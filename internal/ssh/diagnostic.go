package ssh

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	cryptossh "golang.org/x/crypto/ssh"
)

// Diagnostic contains only locally generated labels, counters and timings.
// Never add commands, stream text, prompts, banners or remote error messages.
type Diagnostic struct {
	Stage              string `json:"stage"`
	Reason             string `json:"reason"`
	Profile            string `json:"profile,omitempty"`
	ElapsedMs          int64  `json:"elapsed_ms"`
	Bytes              int    `json:"bytes"`
	StderrBytes        int    `json:"stderr_bytes"`
	Chunks             int    `json:"chunks"`
	FirstByteMs        int64  `json:"first_byte_ms"`
	IdleMs             int64  `json:"idle_ms"`
	Prompt             bool   `json:"prompt"`
	Pager              bool   `json:"pager"`
	PagerSends         int    `json:"pager_sends"`
	NewBytes           int    `json:"new_bytes,omitempty"`
	EchoSeen           bool   `json:"echo_seen"`
	CleanPrompt        bool   `json:"clean_prompt"`
	CleanPager         bool   `json:"clean_pager"`
	CLIErrorSeen       bool   `json:"cli_error_seen"`
	CLIErrorClass      string `json:"cli_error_class,omitempty"`
	PromptTerminator   string `json:"prompt_terminator,omitempty"`
	ErrorClass         string `json:"error_class,omitempty"`
	ExitStatus         *int   `json:"exit_status,omitempty"`
	TimeoutMs          int64  `json:"timeout_ms"`
	ContextRemainingMs *int64 `json:"context_remaining_ms,omitempty"`
}

func cliErrorClass(text string) string {
	if !cliErrorPattern.MatchString(text) {
		return ""
	}
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(lower, "invalid input"):
		return "invalid_input"
	case strings.Contains(lower, "incomplete command"):
		return "incomplete_command"
	case strings.Contains(lower, "ambiguous command"):
		return "ambiguous_command"
	case strings.Contains(lower, "permission denied") || strings.Contains(lower, "not authorized"):
		return "permission_denied"
	case strings.Contains(lower, "command execution is not supported") || strings.Contains(lower, "command not supported"):
		return "command_not_supported"
	default:
		if cliErrorPattern.MatchString(text) {
			return "other_cli_error"
		}
		return ""
	}
}

func promptTerminator(text string) string {
	line := lastTerminalLine(text)
	if line != "" && strings.ContainsAny(line[len(line)-1:], "#>$%") {
		return line[len(line)-1:]
	}
	return ""
}

func profileName(vendor string) string {
	if _, ok := vendorConfigs[vendor]; ok {
		return vendor
	}
	return "unknown"
}

func diagnose(sink func(Diagnostic), ctx context.Context, stage, reason string, start time.Time, timeout time.Duration, b, stderr *safeBuffer, err error, prompt, pager bool, sends int) {
	if sink == nil {
		return
	}
	d := Diagnostic{Stage: stage, Reason: reason, ElapsedMs: time.Since(start).Milliseconds(), TimeoutMs: timeout.Milliseconds(), FirstByteMs: -1, Prompt: prompt, Pager: pager, PagerSends: sends}
	if b != nil {
		b.mu.Lock()
		d.Bytes, d.Chunks = b.buf.Len(), b.chunks
		if !b.first.IsZero() {
			if !b.first.Before(start) {
				d.FirstByteMs = b.first.Sub(start).Milliseconds()
			}
			d.IdleMs = time.Since(b.last).Milliseconds()
		}
		b.mu.Unlock()
	}
	if stderr != nil {
		d.StderrBytes = stderr.Len()
	}
	if deadline, ok := ctx.Deadline(); ok {
		ms := time.Until(deadline).Milliseconds()
		d.ContextRemainingMs = &ms
	}
	d.ErrorClass, d.ExitStatus = errorClass(err)
	sink(d)
}

func errorClass(err error) (string, *int) {
	if err == nil {
		return "", nil
	}
	var exit *cryptossh.ExitError
	var missing *cryptossh.ExitMissingError
	switch {
	case errors.Is(err, context.Canceled):
		return "context_canceled", nil
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline_exceeded", nil
	case errors.As(err, &exit):
		status := exit.ExitStatus()
		return "remote_exit", &status
	case errors.As(err, &missing):
		return "exit_status_missing", nil
	case errors.Is(err, io.ErrUnexpectedEOF):
		return "unexpected_eof", nil
	case errors.Is(err, io.EOF):
		return "eof", nil
	case errors.Is(err, io.ErrClosedPipe):
		return "closed_pipe", nil
	default:
		return "transport_or_request_error", nil
	}
}

// diagnosticWriter counts each stream while preserving its original combined order.
type diagnosticWriter struct{ combined, stream *safeBuffer }

func (w diagnosticWriter) Write(p []byte) (int, error) {
	w.stream.Write(p)
	return w.combined.Write(p)
}
