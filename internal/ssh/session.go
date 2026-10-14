package ssh

import (
	"context"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/ssh"
)

// safeBuffer is a thread-safe buffer for concurrent SSH reads and goroutine reads
type safeBuffer struct {
	mu          sync.Mutex
	buf         strings.Builder
	chunks      int
	first, last time.Time
}

func (b *safeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(p) > 0 {
		b.chunks++
		b.last = time.Now()
		if b.first.IsZero() {
			b.first = b.last
		}
	}
	return b.buf.Write(p)
}

func (b *safeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func (b *safeBuffer) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Len()
}

// VendorConfig defines vendor-specific SSH parameters
type VendorConfig struct {
	PaginationPattern *regexp.Regexp
	PaginationSend    string
	PromptPattern     *regexp.Regexp
	BannerPattern     *regexp.Regexp // "Press any key" style banners
	BannerSend        string
	BackupCommand     map[string]string // "running" -> command
	DisablePaging     string            // command to disable paging (sent before main command)
	RecoveryRules     []RecoveryRule    // rules to fix common errors automatically
}

// RecoveryRule defines a pattern to match an error and a command to fix it
type RecoveryRule struct {
	ErrorPattern   *regexp.Regexp
	CommandPattern *regexp.Regexp // Optional: only apply to certain commands
	RetryCommand   string         // Command to run before retrying original command
}

var vendorConfigs = map[string]VendorConfig{
	"cisco": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|press RETURN`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "terminal length 0",
	},
	"aruba": {
		// Aruba AOS-S (ProCurve heritage) — SSH exec channel not supported, must use interactive shell.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "no page",
	},
	"hp": {
		// HP ProCurve / ArubaOS-Switch (J-series) — same CLI family as Aruba AOS-S.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "no page",
	},
	"hpe": {
		// HPE Comware / H3C — uses 'display' commands; 'screen-length 0 temporary' disables paging for the session.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "display current-configuration", "startup": "display saved-configuration"},
		DisablePaging:     "screen-length 0 temporary",
	},
	"huawei": {
		// Huawei VRP (CloudEngine, Quidway, S-series, AR-series).
		// Shares CLI heritage with HPE Comware (H3C) — same commands apply.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "display current-configuration", "startup": "display saved-configuration"},
		DisablePaging:     "screen-length 0 temporary",
	},
	"allied": {
		// Allied Telesis AlliedWare Plus.
		PaginationPattern: regexp.MustCompile(`(?i)--[ \t]*more[ \t]*--(?:[ \t]*\([^\r\n]*\))?|<cr>|press[ \t]+any[ \t]+key(?:[ \t]+to[ \t]+continue)?[.:]?`),
		PaginationSend:    "\r",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|Press ENTER`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "terminal length 0",
		RecoveryRules: []RecoveryRule{
			{
				// AlliedWare Plus requires "vlan database" mode for VLAN config
				ErrorPattern:   regexp.MustCompile(`(?i)% Invalid input.*marker`),
				CommandPattern: regexp.MustCompile(`(?i)^(vlan|name)\s+`),
				RetryCommand:   "vlan database",
			},
		},
	},
	"fortinet": {
		// Fortinet FortiOS (FortiGate, FortiSwitch) — SSH exec channel works well; no pagination.
		PaginationPattern: nil,
		PaginationSend:    "",
		PromptPattern:     regexp.MustCompile(`[#$]\s*$`),
		BannerPattern:     nil,
		BannerSend:        "",
		BackupCommand:     map[string]string{"running": "show full-configuration", "startup": "show full-configuration"},
		DisablePaging:     "",
	},
	"unknown": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--|--\s*MORE\s*--|Press any key`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>$%]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|press RETURN`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show running-config"},
		DisablePaging:     "",
	},
}

// GetBackupCommand returns the vendor-specific command to retrieve device configuration.
// Falls back to "show running-config" for unknown vendors or config types.
func GetBackupCommand(vendor, configType string) string {
	vc, ok := vendorConfigs[strings.ToLower(vendor)]
	if !ok {
		vc = vendorConfigs["unknown"]
	}
	if cmd, ok := vc.BackupCommand[configType]; ok {
		return cmd
	}
	return "show running-config"
}

// DetectVendorFromBanner tries to identify the device vendor from an SSH server
// version string or the initial shell banner/MOTD.
// Returns "" when the vendor cannot be determined.
func DetectVendorFromBanner(banner string) string {
	lower := strings.ToLower(banner)
	switch {
	case strings.Contains(lower, "cisco"):
		return "cisco"
	case strings.Contains(lower, "aruba"):
		return "aruba"
	case strings.Contains(lower, "alliedware") || strings.Contains(lower, "allied telesis"):
		return "allied"
	case strings.Contains(lower, "comware") || strings.Contains(lower, "h3c"):
		return "hpe"
	case strings.Contains(lower, "huawei"):
		return "huawei"
	case strings.Contains(lower, "fortinet") || strings.Contains(lower, "fortigate") || strings.Contains(lower, "fortiswitch"):
		return "fortinet"
	default:
		return ""
	}
}

// Comprehensive ANSI/terminal control sequence cleaning pattern
// Covers: CSI sequences, OSC sequences, cursor positioning, backspace,
// carriage return, DCS, PM, APC sequences, and other control chars
var ansiPattern = regexp.MustCompile(
	`\x1b\[[0-9;]*[a-zA-Z]` + // CSI sequences: \e[24;1H, \e[0m, etc.
		`|\x1b\[[?][0-9;]*[a-zA-Z]` + // CSI private: \e[?25l, etc.
		`|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)` + // OSC sequences: \e]0;title\a
		`|\x1b[PX^_][^\x1b]*\x1b\\` + // DCS/SOS/PM/APC sequences
		`|\x1b[()][A-Z0-9]` + // Character set selection
		`|\x1b[>=Nc]` + // Various escape codes
		`|\x1b\[[\d;]*m` + // SGR color/style
		`|\x08+` + // Backspace characters
		`|\x0d` + // Carriage return
		`|\x07` + // BEL
		`|\x00` + // NULL
		`|\x0f` + // Shift In
		`|\x0e`, // Shift Out
)

// Session represents an SSH session to a network device
type Session struct {
	client     *ssh.Client
	vendor     string
	timeout    time.Duration
	diagnostic func(Diagnostic)
}

// InteractiveShell manages a persistent PTY session
type InteractiveShell struct {
	sess           *ssh.Session
	stdin          io.WriteCloser
	stdout         *safeBuffer
	vc             VendorConfig
	vendor         string
	timeout        time.Duration
	diagnostic     func(Diagnostic)
	stderr         *safeBuffer
	closeRequested *atomic.Bool
	prompt         *regexp.Regexp
	done           chan struct{}
	waitErr        error
}

type ConnectParams struct {
	Host       string
	Port       int
	Username   string
	Password   string
	PrivateKey string
	Vendor     string
	Timeout    time.Duration
	Diagnostic func(Diagnostic) // Optional metadata-only observer; enabled for backups.
}

func Connect(ctx context.Context, p ConnectParams) (*Session, error) {
	start := time.Now()
	if p.Timeout == 0 {
		p.Timeout = 30 * time.Second
	}
	if p.Port == 0 {
		p.Port = 22
	}
	if p.Vendor == "" {
		p.Vendor = "unknown"
	}

	var authMethods []ssh.AuthMethod
	if p.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(p.PrivateKey))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	}
	if p.Password != "" {
		authMethods = append(authMethods, ssh.Password(p.Password))
		authMethods = append(authMethods, ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range questions {
				answers[i] = p.Password
			}
			return answers, nil
		}))
	}

	config := &ssh.ClientConfig{
		User:            p.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // For network devices, TOFU is standard
		Timeout:         p.Timeout,
		Config: ssh.Config{
			// Support older network devices with legacy ciphers/KEX
			KeyExchanges: []string{
				"curve25519-sha256", "curve25519-sha256@libssh.org",
				"ecdh-sha2-nistp256", "ecdh-sha2-nistp384", "ecdh-sha2-nistp521",
				"diffie-hellman-group14-sha256", "diffie-hellman-group14-sha1",
				"diffie-hellman-group1-sha1",
			},
			Ciphers: []string{
				"aes128-gcm@openssh.com", "aes256-gcm@openssh.com",
				"chacha20-poly1305@openssh.com",
				"aes128-ctr", "aes192-ctr", "aes256-ctr",
				"aes128-cbc", "aes256-cbc", "3des-cbc",
			},
		},
	}

	addr := fmt.Sprintf("%s:%d", p.Host, p.Port)

	diagnose(p.Diagnostic, ctx, "connect", "started", start, p.Timeout, nil, nil, nil, false, false, 0)
	// Dial with context support for cancellation
	dialDone := make(chan struct{})
	var client *ssh.Client
	var dialErr error
	go func() {
		defer close(dialDone)
		client, dialErr = ssh.Dial("tcp", addr, config)
	}()

	select {
	case <-ctx.Done():
		diagnose(p.Diagnostic, ctx, "connect", "context_done", start, p.Timeout, nil, nil, ctx.Err(), false, false, 0)
		return nil, fmt.Errorf("ssh dial %s: %w", addr, ctx.Err())
	case <-dialDone:
		if dialErr != nil {
			diagnose(p.Diagnostic, ctx, "connect", "failed", start, p.Timeout, nil, nil, dialErr, false, false, 0)
			return nil, fmt.Errorf("ssh dial %s: %w", addr, dialErr)
		}
	}

	// Auto-detect vendor from SSH server version banner when vendor is unspecified.
	// Example server versions: "SSH-2.0-Cisco-1.25", "SSH-2.0-HuaweiSSH".
	if p.Vendor == "" || p.Vendor == "unknown" {
		if detected := DetectVendorFromBanner(string(client.ServerVersion())); detected != "" {
			p.Vendor = detected
		}
	}

	diagnose(p.Diagnostic, ctx, "connect", "authenticated", start, p.Timeout, nil, nil, nil, false, false, 0)
	if p.Diagnostic != nil {
		p.Diagnostic(Diagnostic{Stage: "profile", Reason: "after_authentication", Profile: profileName(p.Vendor)})
	}
	return &Session{client: client, vendor: p.Vendor, timeout: p.Timeout, diagnostic: p.Diagnostic}, nil
}

func (s *Session) Close() {
	if s.client != nil {
		s.client.Close()
	}
}

// RunCommand executes a single command via SSH exec channel (no PTY, no interactive shell).
// This is the preferred method for backup: the device sends the full output without
// pagination because there is no terminal attached — equivalent to paramiko exec_command().
func (s *Session) RunCommand(ctx context.Context, command string) (string, error) {
	start := time.Now()
	var combined, stdout, stderr safeBuffer
	observe := s.diagnostic
	if observe != nil {
		observe = func(d Diagnostic) {
			current := combined.String()
			clean := CleanOutput(current)
			vc := vendorConfigs[profileName(s.vendor)]
			d.Profile = profileName(s.vendor)
			d.Prompt = hasTerminalPrompt(vc.PromptPattern, current)
			d.Pager = vc.PaginationPattern != nil && vc.PaginationPattern.MatchString(current)
			d.CleanPrompt = hasTerminalPrompt(vc.PromptPattern, clean)
			d.CleanPager = vc.PaginationPattern != nil && vc.PaginationPattern.MatchString(clean)
			d.CLIErrorSeen = cliErrorPattern.MatchString(clean)
			d.CLIErrorClass = cliErrorClass(clean)
			d.PromptTerminator = promptTerminator(clean)
			s.diagnostic(d)
		}
	}
	var resultErr error
	defer func() {
		diagnose(observe, ctx, "exec", "finished", start, s.timeout, &stdout, &stderr, resultErr, false, false, 0)
	}()
	diagnose(observe, ctx, "exec_channel", "opening", start, s.timeout, nil, nil, nil, false, false, 0)
	sess, err := s.client.NewSession()
	if err != nil {
		resultErr = err
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()
	diagnose(observe, ctx, "exec_channel", "opened_no_pty", start, s.timeout, nil, nil, nil, false, false, 0)
	sess.Stdout = diagnosticWriter{&combined, &stdout}
	sess.Stderr = diagnosticWriter{&combined, &stderr}
	// Bound both request acknowledgement and stream/exit-status waiting.
	execCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	diagnose(observe, execCtx, "exec_request", "started", start, s.timeout, &stdout, &stderr, nil, false, false, 0)
	outputCh := make(chan error, 1)
	go func() {
		if err := sess.Start(command); err != nil {
			outputCh <- err
			return
		}
		diagnose(observe, execCtx, "exec_request", "accepted", start, s.timeout, &stdout, &stderr, nil, false, false, 0)
		outputCh <- sess.Wait()
	}()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-execCtx.Done():
			resultErr = execCtx.Err()
			return "", fmt.Errorf("exec wait: %w", resultErr)
		case resultErr = <-outputCh:
			if resultErr != nil {
				var missing *ssh.ExitMissingError
				if !errors.As(resultErr, &missing) {
					return "", resultErr
				}
				// RFC 4254 recommends, but does not require, an exit-status.
				// Wait has already drained both streams and observed channel closure.
				diagnose(observe, execCtx, "exec_completion", "closed_without_exit_status", start, s.timeout, &stdout, &stderr, resultErr, false, false, 0)
			}
			return CleanOutput(combined.String()), nil
		case <-tick.C:
			diagnose(observe, execCtx, "exec_read", "waiting", start, s.timeout, &stdout, &stderr, nil, false, false, 0)
		}
	}
}

// RunCommandInteractive runs a command in an interactive shell (handles pagination & banners).
// This is a shorthand for OpenInteractiveShell + Run + Close.
func (s *Session) RunCommandInteractive(ctx context.Context, command string) (string, error) {
	shell, err := s.OpenInteractiveShell(ctx)
	if err != nil {
		return "", err
	}
	defer shell.Close()

	return shell.Run(ctx, command)
}

// RunBackupInteractive enters Allied's privileged EXEC mode only when the
// backup fallback starts at a user EXEC prompt. It never enters config mode.
// Do not apply this preparation to arbitrary commands or playbooks.
func (s *Session) RunBackupInteractive(ctx context.Context, command string) (string, error) {
	shell, err := s.OpenInteractiveShell(ctx)
	if err != nil {
		return "", err
	}
	defer shell.Close()
	shell.prompt = learnedPrompt(CleanOutput(shell.stdout.String()))
	if shell.vendor == "allied" && promptTerminator(CleanOutput(shell.stdout.String())) == ">" {
		response, err := shell.runWithTimeout(ctx, "enable", min(5*time.Second, s.timeout), "backup_enable")
		if err != nil {
			return "", fmt.Errorf("Allied backup requires privileged prompt (#); enable did not complete (an enable password may be required): %w", err)
		}
		if promptTerminator(response) != "#" || !hasTerminalPrompt(shell.commandPrompt(), response) || cliErrorPattern.MatchString(response) {
			return "", fmt.Errorf("Allied backup requires privileged prompt (#); enable was rejected")
		}
	}
	return shell.Run(ctx, command)
}

// OpenInteractiveShell initializes a persistent interactive shell (handles banners & paging)
func (s *Session) OpenInteractiveShell(ctx context.Context) (result *InteractiveShell, resultErr error) {
	start := time.Now()
	phase := "shell_channel"
	defer func() {
		diagnose(s.diagnostic, ctx, "shell_open", "finished", start, s.timeout, nil, nil, resultErr, false, false, 0)
	}()
	diagnose(s.diagnostic, ctx, phase, "opening", start, s.timeout, nil, nil, nil, false, false, 0)
	sess, err := s.client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("new session: %w", err)
	}

	diagnose(s.diagnostic, ctx, phase, "opened", start, s.timeout, nil, nil, nil, false, false, 0)
	phase = "pty_vt100_512x512_echo_off"
	diagnose(s.diagnostic, ctx, phase, "started", start, s.timeout, nil, nil, nil, false, false, 0)
	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}
	if err := sess.RequestPty("vt100", 512, 512, modes); err != nil {
		diagnose(s.diagnostic, ctx, phase, "failed", start, s.timeout, nil, nil, err, false, false, 0)
		sess.Close()
		return nil, fmt.Errorf("pty request: %w", err)
	}

	diagnose(s.diagnostic, ctx, phase, "accepted", start, s.timeout, nil, nil, nil, false, false, 0)
	phase = "shell_request"
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	var sb, stderr safeBuffer
	sess.Stdout = &sb
	sess.Stderr = diagnosticWriter{&sb, &stderr}

	diagnose(s.diagnostic, ctx, phase, "started", start, s.timeout, &sb, &stderr, nil, false, false, 0)
	if err := sess.Shell(); err != nil {
		diagnose(s.diagnostic, ctx, phase, "failed", start, s.timeout, &sb, &stderr, err, false, false, 0)
		sess.Close()
		return nil, fmt.Errorf("shell: %w", err)
	}

	diagnose(s.diagnostic, ctx, phase, "accepted", start, s.timeout, &sb, &stderr, nil, false, false, 0)
	closeRequested := &atomic.Bool{}
	shell := &InteractiveShell{
		sess: sess, stdin: stdin, stdout: &sb, vendor: s.vendor,
		timeout: s.timeout, diagnostic: s.diagnostic, stderr: &stderr,
		closeRequested: closeRequested, done: make(chan struct{}),
	}
	go func() {
		shell.waitErr = sess.Wait()
		close(shell.done) // Publishes waitErr and completion of stream copies.
		reason := "closed_before_local_request"
		if closeRequested.Load() {
			reason = "closed_after_local_request"
		}
		diagnose(s.diagnostic, ctx, "shell_wait", reason, start, s.timeout, &sb, &stderr, shell.waitErr, false, false, 0)
	}()

	shell.vc = vendorConfigs[shell.vendor]
	if _, ok := vendorConfigs[shell.vendor]; !ok {
		shell.vc = vendorConfigs["unknown"]
	}

	// Phase 1: Wait for initial prompt or banner, with banner auto-dismiss
	phase = "shell_ready"
	readyReason := "prompt"
	waitReady := time.NewTicker(100 * time.Millisecond)
	readyDeadline := time.NewTimer(min(15*time.Second, s.timeout))
	defer readyDeadline.Stop()
	bannerDismissed := false
waitLoop:
	for {
		select {
		case <-ctx.Done():
			waitReady.Stop()
			shell.Close()
			return nil, ctx.Err()
		case <-shell.done:
			waitReady.Stop()
			shell.Close()
			return nil, shellClosedError(shell.waitErr)
		case <-readyDeadline.C:
			waitReady.Stop()
			shell.Close()
			return nil, fmt.Errorf("initial shell prompt: %w", context.DeadlineExceeded)
		case <-waitReady.C:
			current := CleanOutput(sb.String())
			if !bannerDismissed && shell.vc.BannerPattern != nil && shell.vc.BannerPattern.MatchString(current) {
				if _, err := fmt.Fprint(stdin, shell.vc.BannerSend); err != nil {
					waitReady.Stop()
					shell.Close()
					return nil, fmt.Errorf("banner write: %w", err)
				}
				diagnose(s.diagnostic, ctx, "banner", "dismissed", start, s.timeout, &sb, &stderr, nil, false, false, 0)
				bannerDismissed = true
				continue
			}
			if hasTerminalPrompt(shell.vc.PromptPattern, current) {
				waitReady.Stop()
				break waitLoop
			}
		}
	}

	diagnose(s.diagnostic, ctx, phase, readyReason, start, 15*time.Second, &sb, &stderr, nil, hasTerminalPrompt(shell.vc.PromptPattern, sb.String()), false, 0)
	if s.diagnostic != nil {
		s.diagnostic(Diagnostic{Stage: "shell_ready_response", Reason: "observed", PromptTerminator: promptTerminator(CleanOutput(sb.String())), CleanPrompt: hasTerminalPrompt(shell.vc.PromptPattern, CleanOutput(sb.String()))})
	}
	// Phase 1.5: if vendor was unknown, try to detect from the initial banner/MOTD output
	if shell.vendor == "unknown" {
		if detected := DetectVendorFromBanner(sb.String()); detected != "" {
			shell.vendor = detected
			s.vendor = detected // Update session vendor too
			if newVC, ok := vendorConfigs[shell.vendor]; ok {
				shell.vc = newVC
			}
		}
	}

	if s.diagnostic != nil {
		s.diagnostic(Diagnostic{Stage: "profile", Reason: "after_shell_banner", Profile: profileName(shell.vendor)})
	}
	// Consume the preparation command's own response and final prompt before
	// establishing the main command's buffer boundary.
	if shell.vc.DisablePaging != "" {
		response, err := shell.runWithTimeout(ctx, shell.vc.DisablePaging, min(5*time.Second, s.timeout), "disable_paging")
		if err != nil {
			shell.Close()
			return nil, fmt.Errorf("disable paging: %w", err)
		}
		if s.diagnostic != nil {
			s.diagnostic(Diagnostic{Stage: "disable_paging_response", Reason: "observed", NewBytes: len(response), CLIErrorSeen: cliErrorPattern.MatchString(response), CleanPrompt: hasTerminalPrompt(shell.prompt, response)})
		}
	}

	return shell, nil
}

// Run executes a command in the interactive shell and waits for output/prompt.
// It includes a smart "recovery" mechanism to auto-correct common syntax errors.
func (sh *InteractiveShell) Run(ctx context.Context, command string) (string, error) {
	output, err := sh.runOnce(ctx, command)
	if err != nil {
		return output, err
	}

	// Check for known error patterns that have recovery rules
	for _, rule := range sh.vc.RecoveryRules {
		if rule.ErrorPattern.MatchString(output) {
			if rule.CommandPattern == nil || rule.CommandPattern.MatchString(command) {
				// We found a matching error and command! Try to recover.
				_, recErr := sh.runOnce(ctx, rule.RetryCommand)
				if recErr == nil {
					// Preamble sent successfully. Retry the original command once.
					retryOutput, retryErr := sh.runOnce(ctx, command)
					if retryErr == nil {
						// Return combined output with a notice about the auto-fix
						return fmt.Sprintf("[AUTO-FIX: Applied '%s']\n%s", rule.RetryCommand, retryOutput), nil
					}
					// If retry fails, we return the original error output
				}
			}
		}
	}

	return output, nil
}

var cliErrorPattern = regexp.MustCompile(`(?im)^\s*%\s*(invalid|error|incomplete|ambiguous)|command (execution is not supported|not supported)|permission denied`)

// runOnce executes a command once and returns the raw output
func (sh *InteractiveShell) runOnce(ctx context.Context, command string) (string, error) {
	return sh.runWithTimeout(ctx, command, sh.timeout, "interactive_read")
}

func (sh *InteractiveShell) runWithTimeout(ctx context.Context, command string, timeout time.Duration, stage string) (output string, err error) {
	start := time.Now()
	startLen := sh.stdout.Len()
	observe := sh.diagnostic
	if observe != nil {
		observe = func(d Diagnostic) {
			current := sh.stdout.String()
			fresh := current[startLen:]
			clean := CleanOutput(fresh)
			d.Profile = profileName(sh.vendor)
			d.NewBytes = len(fresh)
			d.EchoSeen = strings.Contains(fresh, command)
			d.CleanPrompt = hasTerminalPrompt(sh.commandPrompt(), clean)
			d.CleanPager = sh.vc.PaginationPattern != nil && sh.vc.PaginationPattern.MatchString(clean)
			d.CLIErrorSeen = cliErrorPattern.MatchString(clean)
			d.CLIErrorClass = cliErrorClass(clean)
			d.PromptTerminator = promptTerminator(clean)
			sh.diagnostic(d)
		}
	}
	reason := "write_error"
	var consumedPages [][2]int
	pagerSends := 0
	prompt, pager := false, false
	defer func() {
		diagnose(observe, ctx, stage, reason, start, timeout, sh.stdout, sh.stderr, err, prompt, pager, pagerSends)
		full := sh.stdout.String()
		output = withoutPages(CleanOutput(full[startLen:]), consumedPages)
		if err != nil {
			sh.Close()
		}
	}()
	if _, err = fmt.Fprintf(sh.stdin, "%s\r", command); err != nil {
		return "", fmt.Errorf("command write: %w", err)
	}
	diagnose(observe, ctx, "interactive_command", "written", start, sh.timeout, sh.stdout, sh.stderr, nil, false, false, 0)
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	lastLen, stableCount := -1, 0
	consumedStart := -1
	nextDiagnostic := start.Add(time.Second)
	for {
		select {
		case <-ctx.Done():
			reason = "context_done"
			return "", ctx.Err()
		case <-sh.done:
			reason = "channel_closed"
			var missing *ssh.ExitMissingError
			clean := CleanOutput(sh.stdout.String()[startLen:])
			if hasTerminalPrompt(sh.commandPrompt(), clean) && (sh.waitErr == nil || errors.As(sh.waitErr, &missing)) {
				reason, prompt = "prompt_before_channel_close", true
				return "", nil
			}
			return "", shellClosedError(sh.waitErr)
		case <-deadline.C:
			reason = "command_deadline"
			return "", fmt.Errorf("interactive command wait: %w", context.DeadlineExceeded)
		case <-tick.C:
			// Only the response to this command can complete this command.
			current := sh.stdout.String()[startLen:]
			currentLen := len(current)
			clean := CleanOutput(current)
			prompt = hasTerminalPrompt(sh.commandPrompt(), clean)
			page := paginationAtEnd(sh.vc.PaginationPattern, clean)
			pager = page != nil
			if pager {
				if page[0] > consumedStart {
					if _, err = fmt.Fprint(sh.stdin, sh.vc.PaginationSend); err != nil {
						reason = "pager_write_error"
						return "", fmt.Errorf("pager write: %w", err)
					}
					pagerSends++
					consumedStart = page[0]
					consumedPages = append(consumedPages, [2]int{page[0], page[1]})
				} else if page[0] == consumedStart {
					consumedPages[len(consumedPages)-1][1] = page[1]
				}
				stableCount, lastLen = 0, currentLen
			} else if currentLen == lastLen {
				stableCount++
				if currentLen > 0 && stableCount >= 10 && prompt {
					reason = "stable_prompt"
					return "", nil
				}
			} else {
				stableCount, lastLen = 0, currentLen
			}

			if !time.Now().Before(nextDiagnostic) {
				nextDiagnostic = time.Now().Add(time.Second)
				diagnose(observe, ctx, stage, "waiting", start, timeout, sh.stdout, sh.stderr, nil, prompt, pager, pagerSends)
			}
		}
	}
}

func (sh *InteractiveShell) Close() {
	if sh.closeRequested != nil {
		sh.closeRequested.Store(true)
	}
	if sh.stdin != nil {
		sh.stdin.Close()
	}
	if sh.sess != nil {
		sh.sess.Close()
	}
}

// CleanOutput removes ANSI codes, control characters, and normalizes line endings
func CleanOutput(raw string) string {
	// Remove all ANSI/terminal control sequences
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	cleaned := ansiPattern.ReplaceAllString(raw, "")

	// Normalize line endings
	cleaned = strings.ReplaceAll(cleaned, "\r\n", "\n")
	cleaned = strings.ReplaceAll(cleaned, "\r", "\n")

	// Clean each line: remove trailing whitespace and invisible chars
	lines := strings.Split(cleaned, "\n")
	var result []string
	for _, line := range lines {
		trimmed := strings.TrimRight(line, " \t\x00\x0f\x0e")
		result = append(result, trimmed)
	}

	// Remove pagination artifacts (lines that are just spaces from "-- MORE --" clearing)
	var finalLines []string
	emptyRun := 0
	for _, line := range result {
		if strings.TrimSpace(line) == "" {
			emptyRun++
			// Collapse runs of more than 2 blank lines
			if emptyRun <= 2 {
				finalLines = append(finalLines, line)
			}
		} else {
			emptyRun = 0
			finalLines = append(finalLines, line)
		}
	}

	return strings.TrimSpace(strings.Join(finalLines, "\n"))
}

func hasTerminalPrompt(re *regexp.Regexp, text string) bool {
	if re == nil {
		return false
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	lines := strings.Split(trimmed, "\n")
	last := strings.TrimSpace(lines[len(lines)-1])
	return re.MatchString(last)
}

// learnedPrompt binds completion to the device prompt seen at shell startup,
// allowing privilege/configuration-mode transitions on the same device.
func learnedPrompt(text string) *regexp.Regexp {
	line := lastTerminalLine(text)
	if strings.HasSuffix(line, "#") || strings.HasSuffix(line, ">") {
		base := strings.TrimSpace(line[:len(line)-1])
		if i := strings.Index(base, "("); i >= 0 {
			base = strings.TrimSpace(base[:i])
		}
		return regexp.MustCompile(`^` + regexp.QuoteMeta(base) + `(?:\([^\r\n]*\))*\s*[#>]\s*$`)
	}
	return regexp.MustCompile(`^` + regexp.QuoteMeta(line) + `$`)
}

func (sh *InteractiveShell) commandPrompt() *regexp.Regexp {
	if sh.prompt != nil {
		return sh.prompt
	}
	return sh.vc.PromptPattern
}

func lastTerminalLine(text string) string {
	text = strings.TrimSpace(text)
	if i := strings.LastIndexByte(text, '\n'); i >= 0 {
		text = text[i+1:]
	}
	return strings.TrimSpace(text)
}

// A pager must occupy the terminal's last line. Tokens in config/help lines
// (for example "description <cr>") must never trigger a keypress.
func paginationAtEnd(pattern *regexp.Regexp, text string) []int {
	if pattern == nil {
		return nil
	}
	lineStart := strings.LastIndexByte(text, '\n') + 1
	line := text[lineStart:]
	match := pattern.FindStringIndex(line)
	if match == nil || strings.TrimSpace(line[:match[0]]) != "" || strings.TrimSpace(line[match[1]:]) != "" {
		return nil
	}
	return []int{lineStart + match[0], lineStart + match[1]}
}

func withoutPages(text string, pages [][2]int) string {
	for i := len(pages) - 1; i >= 0; i-- {
		p := pages[i]
		if p[1] <= len(text) {
			text = text[:p[0]] + text[p[1]:]
		}
	}
	return text
}

// Preserve the error type for diagnostics without returning a server-supplied
// error message that could contain terminal text.
type shellReadError struct{ cause error }

func (e *shellReadError) Error() string {
	class, _ := errorClass(e.cause)
	return "SSH shell closed before final prompt (" + class + ")"
}
func (e *shellReadError) Unwrap() error { return e.cause }
func shellClosedError(err error) error {
	if err == nil {
		err = io.ErrUnexpectedEOF
	}
	return &shellReadError{err}
}
