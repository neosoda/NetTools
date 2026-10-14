package ssh

import (
	"bufio"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	cryptossh "golang.org/x/crypto/ssh"
)

type eventRecorder struct {
	mu     sync.Mutex
	events []Diagnostic
}

func (r *eventRecorder) record(d Diagnostic) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, d)
}
func (r *eventRecorder) snapshot() []Diagnostic {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Diagnostic(nil), r.events...)
}

// This server binds only loopback and has no device credentials or connectivity.
func localSession(t *testing.T, handle func(cryptossh.Channel, <-chan *cryptossh.Request), record func(Diagnostic)) *Session {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := cryptossh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	config := &cryptossh.ServerConfig{NoClientAuth: true}
	config.AddHostKey(signer)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		server, channels, requests, err := cryptossh.NewServerConn(conn, config)
		if err != nil {
			conn.Close()
			return
		}
		defer server.Close()
		go cryptossh.DiscardRequests(requests)
		for c := range channels {
			channel, requests, err := c.Accept()
			if err == nil {
				go handle(channel, requests)
			}
		}
	}()
	client, err := cryptossh.Dial("tcp", listener.Addr().String(), &cryptossh.ClientConfig{User: "synthetic", HostKeyCallback: cryptossh.InsecureIgnoreHostKey(), Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	s := &Session{client: client, vendor: "allied", timeout: 300 * time.Millisecond, diagnostic: record}
	t.Cleanup(s.Close)
	return s
}

func TestExecDiagnostics(t *testing.T) {
	for _, tc := range []struct {
		name, class           string
		status                int
		reject, hang, missing bool
	}{
		{name: "success"},
		{name: "rejected", class: "transport_or_request_error", reject: true},
		{name: "nonzero", class: "remote_exit", status: 7},
		{name: "missing_status", class: "exit_status_missing", missing: true},
		{name: "no_close", class: "deadline_exceeded", hang: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var recorder eventRecorder
			s := localSession(t, func(c cryptossh.Channel, requests <-chan *cryptossh.Request) {
				defer c.Close()
				for req := range requests {
					if req.Type != "exec" {
						req.Reply(false, nil)
						continue
					}
					req.Reply(!tc.reject, nil)
					if tc.reject {
						return
					}
					io.WriteString(c, "SENSITIVE_CONFIG\n")
					io.WriteString(c.Stderr(), "SENSITIVE_REMOTE_ERROR\n")
					if tc.hang {
						for range requests {
						}
						return
					}
					if !tc.missing {
						c.SendRequest("exit-status", false, cryptossh.Marshal(struct{ Status uint32 }{uint32(tc.status)}))
						if tc.status != 0 {
							c.SendRequest("exit-signal", false, cryptossh.Marshal(struct {
								Signal          string
								CoreDumped      bool
								Error, Language string
							}{"TERM", false, "SENSITIVE_EXIT_ERROR", "en"}))
						}
					}
					return
				}
			}, recorder.record)
			out, err := s.RunCommand(context.Background(), "SENSITIVE_COMMAND")
			if (err != nil) != (tc.class != "" && !tc.missing) {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.class == "" && !strings.Contains(out, "SENSITIVE_CONFIG") {
				t.Fatal("missing output")
			}
			events := recorder.snapshot()
			last := events[len(events)-1]
			if last.ErrorClass != tc.class {
				t.Fatalf("class %s, want %s", last.ErrorClass, tc.class)
			}
			if !tc.reject && (last.Bytes == 0 || last.StderrBytes == 0 || last.Chunks == 0) {
				t.Fatalf("missing counters: %+v", last)
			}
			if tc.status != 0 && (last.ExitStatus == nil || *last.ExitStatus != tc.status) {
				t.Fatal("missing exit status")
			}
			encoded, _ := json.Marshal(events)
			if strings.Contains(string(encoded), "SENSITIVE") {
				t.Fatal("sensitive diagnostic")
			}
		})
	}
}

type testWriter struct{ write func([]byte) (int, error) }

func (w testWriter) Write(p []byte) (int, error) { return w.write(p) }
func (w testWriter) Close() error                { return nil }

func TestInteractiveErrors(t *testing.T) {
	for _, name := range []string{"write", "cancel", "timeout", "pager_write"} {
		t.Run(name, func(t *testing.T) {
			var buffer safeBuffer
			var recorder eventRecorder
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], timeout: 200 * time.Millisecond, diagnostic: recorder.record}
			sh.stdin = testWriter{func(p []byte) (int, error) {
				calls++
				if name == "write" || name == "pager_write" && calls > 1 {
					return 0, io.ErrClosedPipe
				}
				if name == "cancel" {
					cancel()
				}
				if name == "pager_write" {
					buffer.Write([]byte("--More--"))
				}
				return len(p), nil
			}}
			_, err := sh.runOnce(ctx, "show running-config")
			want := context.DeadlineExceeded
			if name == "write" || name == "pager_write" {
				want = io.ErrClosedPipe
			}
			if name == "cancel" {
				want = context.Canceled
			}
			if !errors.Is(err, want) {
				t.Fatalf("got %v, want %v", err, want)
			}
			last := recorder.snapshot()
			if last[len(last)-1].ErrorClass == "" {
				t.Fatal("missing error classification")
			}
		})
	}
}

func TestInteractiveDoesNotFinishWithoutPrompt(t *testing.T) {
	for _, tc := range []struct {
		name, old, fresh string
		timeout          time.Duration
	}{
		{"config_marker", "", "partial synthetic config\nexit\n", 3400 * time.Millisecond},
		{"stale_prompt", "synthetic#", "", 1400 * time.Millisecond},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var buffer safeBuffer
			buffer.Write([]byte(tc.old))
			sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], timeout: tc.timeout}
			sh.stdin = testWriter{func(p []byte) (int, error) { buffer.Write([]byte(tc.fresh)); return len(p), nil }}
			_, err := sh.runOnce(context.Background(), "show running-config")
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("partial response accepted: %v", err)
			}
		})
	}
}

func TestInteractiveAcknowledgesPagerOnlyOnce(t *testing.T) {
	var buffer safeBuffer
	pages := 0
	sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], timeout: 450 * time.Millisecond}
	sh.stdin = testWriter{func(p []byte) (int, error) {
		if string(p) == "\r" {
			pages++
		} else {
			buffer.Write([]byte("partial config\n--More--"))
		}
		return len(p), nil
	}}
	_, err := sh.runOnce(context.Background(), "show running-config")
	if !errors.Is(err, context.DeadlineExceeded) || pages != 1 {
		t.Fatalf("pager acknowledged %d times, error %v", pages, err)
	}
}

func TestInteractiveWaitsForDelayedRemainder(t *testing.T) {
	var buffer safeBuffer
	sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], prompt: learnedPrompt("synthetic#"), timeout: 6 * time.Second}
	var delayed *time.Timer
	sh.stdin = testWriter{func(p []byte) (int, error) {
		buffer.Write([]byte("partial configuration\nexit\n"))
		delayed = time.AfterFunc(3300*time.Millisecond, func() { buffer.Write([]byte("remaining configuration\nend\nsynthetic#\x1b[0m")) })
		return len(p), nil
	}}
	out, err := sh.runOnce(context.Background(), "show running-config")
	delayed.Stop()
	if err != nil || !strings.Contains(out, "remaining configuration") {
		t.Fatalf("configuration truncated: %v", err)
	}
}

func TestInteractivePaginationVariants(t *testing.T) {
	for _, token := range []string{"--More--", "-- More --", "<cr>", "Press any key to continue", "description <cr>", "description --More--"} {
		t.Run(token, func(t *testing.T) {
			t.Parallel()
			var buffer safeBuffer
			pages := 0
			falsePositive := strings.HasPrefix(token, "description")
			timeout := 2 * time.Second
			if falsePositive {
				timeout = 350 * time.Millisecond
			}
			sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], prompt: learnedPrompt("synthetic#"), timeout: timeout}
			sh.stdin = testWriter{func(p []byte) (int, error) {
				if string(p) == "\r" {
					pages++
					buffer.Write([]byte("\r\nremaining configuration\r\nsynthetic#\x1b[0m"))
				} else {
					buffer.Write([]byte("first page\n" + token))
				}
				return len(p), nil
			}}
			out, err := sh.runOnce(context.Background(), "show running-config")
			if falsePositive {
				if pages != 0 || !errors.Is(err, context.DeadlineExceeded) {
					t.Fatalf("config token acknowledged: %d, %v", pages, err)
				}
			} else if err != nil || pages != 1 || strings.Contains(out, token) || !strings.Contains(out, "remaining configuration") {
				t.Fatalf("pagination failed: sends=%d, err=%v", pages, err)
			}
		})
	}
}

func TestLearnedPrompt(t *testing.T) {
	re := learnedPrompt("banner\nsynthetic#")
	for _, prompt := range []string{"synthetic#", "synthetic>", "synthetic(config)#", "synthetic(config-if)#"} {
		if !hasTerminalPrompt(re, prompt) {
			t.Fatalf("mode prompt rejected: %s", prompt)
		}
	}
	if hasTerminalPrompt(re, "description something#") || hasTerminalPrompt(re, "other-device#") {
		t.Fatal("configuration mistaken for device prompt")
	}
	// Prompt metacharacters must be literal, including dotted hostnames.
	if learnedPrompt("sw.01#").MatchString("swX01#") {
		t.Fatal("unescaped hostname")
	}
}

func TestInteractiveClosure(t *testing.T) {
	for _, withPrompt := range []bool{false, true} {
		var buffer safeBuffer
		sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], prompt: regexp.MustCompile(`^synthetic#$`), timeout: time.Second, done: make(chan struct{})}
		sh.stdin = testWriter{func(p []byte) (int, error) {
			buffer.Write([]byte("partial config\n"))
			if withPrompt {
				buffer.Write([]byte("synthetic#"))
			}
			close(sh.done)
			return len(p), nil
		}}
		_, err := sh.runOnce(context.Background(), "show running-config")
		if withPrompt && err != nil || !withPrompt && !errors.Is(err, io.ErrUnexpectedEOF) {
			t.Fatalf("incorrect EOF handling (prompt=%v): %v", withPrompt, err)
		}
	}
}

func TestCleanOutputCRLines(t *testing.T) {
	if got := CleanOutput("first\rsecond\rthird\r"); got != "first\nsecond\nthird" {
		t.Fatalf("CR-only lines joined: %q", got)
	}
}

func TestInteractiveSuccessivePages(t *testing.T) {
	var buffer safeBuffer
	pages := 0
	sh := &InteractiveShell{stdout: &buffer, vc: vendorConfigs["allied"], prompt: learnedPrompt("synthetic#"), timeout: 3 * time.Second}
	sh.stdin = testWriter{func(p []byte) (int, error) {
		if string(p) != "\r" {
			buffer.Write([]byte("first page\n--More--"))
		} else {
			pages++
			if pages == 1 {
				buffer.Write([]byte("\nsecond page\n<cr>"))
			} else {
				buffer.Write([]byte("\nlast page\nsynthetic#"))
			}
		}
		return len(p), nil
	}}
	out, err := sh.runOnce(context.Background(), "show running-config")
	if err != nil || pages != 2 || strings.Contains(out, "--More--") || strings.Contains(out, "<cr>") || !strings.Contains(out, "second page") || !strings.Contains(out, "last page") {
		t.Fatalf("successive pages lost/repeated: sends=%d, err=%v", pages, err)
	}
}

func TestShellRequiresPreparationResponse(t *testing.T) {
	for _, initialPrompt := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing_initial_prompt", true: "missing_preparation_prompt"}[initialPrompt], func(t *testing.T) {
			t.Parallel()
			var commands atomic.Int32
			s := localSession(t, func(c cryptossh.Channel, requests <-chan *cryptossh.Request) {
				defer c.Close()
				for req := range requests {
					req.Reply(true, nil)
					if req.Type != "shell" {
						continue
					}
					if initialPrompt {
						io.WriteString(c, "synthetic#\x1b[0m")
					}
					reader := bufio.NewReader(c)
					for {
						if _, err := reader.ReadString('\r'); err != nil {
							return
						}
						commands.Add(1)
						// Keep the channel alive without acknowledging preparation.
					}
				}
			}, nil)
			s.timeout = 1400 * time.Millisecond
			_, err := s.RunCommandInteractive(context.Background(), "show running-config")
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("missing preparation accepted: %v", err)
			}
			want := int32(0)
			if initialPrompt {
				want = 1
			}
			if commands.Load() != want {
				t.Fatalf("main command sent before readiness: %d writes", commands.Load())
			}
		})
	}
}

func TestAlliedBackupPrivilege(t *testing.T) {
	for _, tc := range []struct {
		name, initial string
		rejected      bool
		enableCount   int
	}{
		{"user_exec", ">", false, 1},
		{"already_privileged", "#", false, 0},
		{"enable_denied", ">", true, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var enables, configReads atomic.Int32
			s := localSession(t, func(c cryptossh.Channel, requests <-chan *cryptossh.Request) {
				defer c.Close()
				for req := range requests {
					req.Reply(true, nil)
					if req.Type != "shell" {
						continue
					}
					prompt := tc.initial
					io.WriteString(c, "synthetic"+prompt)
					reader := bufio.NewReader(c)
					for {
						command, err := reader.ReadString('\r')
						if err != nil {
							return
						}
						switch strings.TrimSpace(command) {
						case "terminal length 0":
						case "enable":
							enables.Add(1)
							if tc.rejected {
								io.WriteString(c, "\n% Invalid input detected")
							} else {
								prompt = "#"
							}
						case "show running-config":
							configReads.Add(1)
							if prompt == "#" {
								io.WriteString(c, "\nSENSITIVE_CONFIG\nend")
							} else {
								io.WriteString(c, "\n% Invalid input detected")
							}
						default:
							t.Error("unexpected command")
						}
						io.WriteString(c, "\nsynthetic"+prompt)
					}
				}
			}, nil)
			s.timeout = 4 * time.Second
			out, err := s.RunBackupInteractive(context.Background(), "show running-config")
			if tc.rejected {
				if err == nil || configReads.Load() != 0 {
					t.Fatal("backup continued without privilege")
				}
			} else if err != nil || !strings.Contains(out, "SENSITIVE_CONFIG") || configReads.Load() != 1 {
				t.Fatalf("privileged backup failed: %v", err)
			}
			if enables.Load() != int32(tc.enableCount) {
				t.Fatalf("unexpected enable count %d", enables.Load())
			}
		})
	}
}

func TestShellPTYAndDiagnosticPrivacy(t *testing.T) {
	var recorder eventRecorder
	s := localSession(t, func(c cryptossh.Channel, requests <-chan *cryptossh.Request) {
		defer c.Close()
		for req := range requests {
			switch req.Type {
			case "pty-req":
				var pty struct {
					Term                         string
					Columns, Rows, Width, Height uint32
					Modes                        string
				}
				if err := cryptossh.Unmarshal(req.Payload, &pty); err != nil {
					t.Error(err)
					return
				}
				if pty.Term != "vt100" || pty.Columns != 512 || pty.Rows != 512 {
					t.Error("unexpected PTY")
				}
				req.Reply(true, nil)
			case "shell":
				req.Reply(true, nil)
				io.WriteString(c, "SENSITIVE_BANNER\nsynthetic#")
				reader := bufio.NewReader(c)
				for {
					command, err := reader.ReadString('\r')
					if err != nil {
						return
					}
					if strings.TrimSpace(command) == "terminal length 0" {
						io.WriteString(c, "\nsynthetic#")
					} else {
						io.WriteString(c, "\nSENSITIVE_CONFIG\nend\nsynthetic#")
					}
				}
			default:
				req.Reply(false, nil)
			}
		}
	}, recorder.record)
	s.timeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := s.RunCommandInteractive(ctx, "SENSITIVE_COMMAND")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "SENSITIVE_CONFIG") {
		t.Fatal("missing configuration")
	}
	events := recorder.snapshot()
	var last Diagnostic
	for _, event := range events {
		if event.Stage == "interactive_read" {
			last = event
		}
	}
	if last.Reason != "stable_prompt" || !last.CleanPrompt || last.NewBytes == 0 {
		t.Fatalf("incorrect command diagnostic: %+v", last)
	}
	encoded, _ := json.Marshal(events)
	if strings.Contains(string(encoded), "SENSITIVE") || strings.Contains(string(encoded), "synthetic") {
		t.Fatal("sensitive shell diagnostic")
	}
}
