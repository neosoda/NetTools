package playbook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"
	"nettools/internal/ssh"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// PlaybookDef defines the YAML structure
type PlaybookDef struct {
	Name              string `yaml:"name"`
	Timeout           string `yaml:"timeout"`
	Executor          string `yaml:"executor"`            // native|netmiko
	NetmikoDeviceType string `yaml:"netmiko_device_type"` // optional, defaults from vendor
	Steps             []Step `yaml:"steps"`
}

type Step struct {
	Name     string   `yaml:"name"`
	Command  string   `yaml:"command"`
	Commands []string `yaml:"commands"`
	Expect   string   `yaml:"expect"`
	OnError  string   `yaml:"on_error"` // continue|abort
}

// ExecutionResult holds the result of a playbook run on a device
type ExecutionResult struct {
	DeviceID string
	DeviceIP string
	Steps    []StepResult
	Status   string
	TotalMs  int64
}

type StepResult struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Output  string `json:"output"`
	Passed  bool   `json:"passed"`
	Error   string `json:"error"`
}

// StepEvent is emitted by the progress callback before and after each step.
// Done=false means the step just started; Done=true means it finished.
type StepEvent struct {
	DeviceID    string
	DeviceIP    string
	DeviceLabel string // hostname or IP
	StepIndex   int
	TotalSteps  int
	StepName    string
	Command     string
	Done        bool
	Output      string
	Passed      bool
	Error       string
}

// ProgressFunc receives real-time step events during playbook execution.
type ProgressFunc func(StepEvent)

// Parse parses a YAML playbook
func Parse(content string) (*PlaybookDef, error) {
	var pb PlaybookDef
	if err := yaml.Unmarshal([]byte(content), &pb); err != nil {
		return nil, fmt.Errorf("parse playbook: %w", err)
	}
	if len(pb.Steps) == 0 {
		return nil, fmt.Errorf("playbook has no steps")
	}
	for i, step := range pb.Steps {
		if len(step.commandList()) == 0 {
			return nil, fmt.Errorf("step %d has no command", i+1)
		}
	}
	return &pb, nil
}

// Run executes a playbook on a device.
// onProgress is called before each step starts (Done=false) and after it finishes (Done=true).
// Pass nil if no real-time feedback is needed.
func Run(ctx context.Context, pb *PlaybookDef, device models.Device, username, password string, onProgress ProgressFunc) (*ExecutionResult, error) {
	start := time.Now()

	if strings.EqualFold(pb.Executor, "netmiko") {
		return runWithNetmiko(ctx, start, pb, device, username, password, onProgress)
	}

	label := device.Hostname
	if label == "" {
		label = device.IP
	}

	emit := func(evt StepEvent) {
		if onProgress != nil {
			onProgress(evt)
		}
	}

	result := &ExecutionResult{
		DeviceID: device.ID,
		DeviceIP: device.IP,
		Status:   "failed",
	}

	// Parse timeout
	timeout := 60 * time.Second
	if pb.Timeout != "" {
		if d, err := time.ParseDuration(pb.Timeout); err == nil {
			timeout = d
		}
	}

	params := ssh.ConnectParams{
		Host:     device.IP,
		Port:     device.SSHPort,
		Username: username,
		Password: password,
		Vendor:   device.Vendor,
		Timeout:  timeout,
	}

	sess, err := ssh.Connect(ctx, params)
	if err != nil {
		return result, fmt.Errorf("connect: %w", err)
	}
	defer sess.Close()

	for i, step := range pb.Steps {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		base := StepEvent{
			DeviceID:    device.ID,
			DeviceIP:    device.IP,
			DeviceLabel: label,
			StepIndex:   i,
			TotalSteps:  len(pb.Steps),
			StepName:    step.Name,
			Command:     step.Command,
		}

		// Notify: step starting
		emit(base)

		sr := StepResult{Name: step.Name, Command: step.Command}
		output, cmdErr := sess.RunCommandInteractive(ctx, step.Command)
		sr.Output = output

		if cmdErr != nil {
			sr.Error = cmdErr.Error()
			sr.Passed = false
			result.Steps = append(result.Steps, sr)
			evt := base
			evt.Done, evt.Output, evt.Passed, evt.Error = true, output, false, sr.Error
			emit(evt)
			if step.OnError == "abort" || step.OnError == "" {
				result.TotalMs = time.Since(start).Milliseconds()
				saveExecution(result, device.ID, "")
				return result, fmt.Errorf("step '%s' failed: %w", step.Name, cmdErr)
			}
			continue
		}

		// Check expect pattern if defined
		if step.Expect != "" {
			sr.Passed = strings.Contains(output, step.Expect)
			if !sr.Passed {
				sr.Error = fmt.Sprintf("expected '%s' not found in output", step.Expect)
			}
		} else {
			sr.Passed = true
		}

		result.Steps = append(result.Steps, sr)
		evt := base
		evt.Done, evt.Output, evt.Passed, evt.Error = true, output, sr.Passed, sr.Error
		emit(evt)

		if !sr.Passed && (step.OnError == "abort" || step.OnError == "") {
			result.TotalMs = time.Since(start).Milliseconds()
			saveExecution(result, device.ID, "")
			return result, fmt.Errorf("step '%s' expectation failed", step.Name)
		}
	}

	result.Status = "success"
	result.TotalMs = time.Since(start).Milliseconds()
	saveExecution(result, device.ID, "")
	return result, nil
}

type netmikoPayload struct {
	Device            netmikoDevicePayload `json:"device"`
	TimeoutSeconds    int                  `json:"timeout_seconds"`
	GlobalDelayFactor float64              `json:"global_delay_factor"`
	Steps             []netmikoStepPayload `json:"steps"`
}

type netmikoDevicePayload struct {
	DeviceType string `json:"device_type"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
}

type netmikoStepPayload struct {
	Name     string   `json:"name"`
	Commands []string `json:"commands"`
	Expect   string   `json:"expect"`
	OnError  string   `json:"on_error"`
}

type netmikoResult struct {
	Status string       `json:"status"`
	Steps  []StepResult `json:"steps"`
	Error  string       `json:"error"`
}

func (s Step) commandList() []string {
	if len(s.Commands) > 0 {
		return s.Commands
	}
	if strings.TrimSpace(s.Command) == "" {
		return nil
	}
	return []string{s.Command}
}

func runWithNetmiko(ctx context.Context, start time.Time, pb *PlaybookDef, device models.Device, username, password string, onProgress ProgressFunc) (*ExecutionResult, error) {
	label := device.Hostname
	if label == "" {
		label = device.IP
	}

	emit := func(evt StepEvent) {
		if onProgress != nil {
			onProgress(evt)
		}
	}

	result := &ExecutionResult{
		DeviceID: device.ID,
		DeviceIP: device.IP,
		Status:   "failed",
	}

	timeout := 60 * time.Second
	if pb.Timeout != "" {
		if d, err := time.ParseDuration(pb.Timeout); err == nil {
			timeout = d
		}
	}

	stepsPayload := make([]netmikoStepPayload, 0, len(pb.Steps))
	for i, step := range pb.Steps {
		commands := step.commandList()
		joinedCommand := strings.Join(commands, " && ")

		base := StepEvent{
			DeviceID:    device.ID,
			DeviceIP:    device.IP,
			DeviceLabel: label,
			StepIndex:   i,
			TotalSteps:  len(pb.Steps),
			StepName:    step.Name,
			Command:     joinedCommand,
		}
		emit(base)
		stepsPayload = append(stepsPayload, netmikoStepPayload{
			Name:     step.Name,
			Commands: commands,
			Expect:   step.Expect,
			OnError:  step.OnError,
		})
	}

	deviceType := strings.TrimSpace(pb.NetmikoDeviceType)
	if deviceType == "" {
		deviceType = netmikoDeviceTypeFromVendor(device.Vendor)
	}

	payload := netmikoPayload{
		Device: netmikoDevicePayload{
			DeviceType: deviceType,
			Host:       device.IP,
			Port:       device.SSHPort,
			Username:   username,
			Password:   password,
		},
		TimeoutSeconds:    int(timeout.Seconds()),
		GlobalDelayFactor: 1.0,
		Steps:             stepsPayload,
	}

	input, err := json.Marshal(payload)
	if err != nil {
		return result, fmt.Errorf("marshal netmiko payload: %w", err)
	}

	cmd := exec.CommandContext(ctx, "python3", "tools/netmiko_runner.py")
	cmd.Stdin = bytes.NewReader(input)
	raw, err := cmd.CombinedOutput()
	if err != nil {
		return result, fmt.Errorf("netmiko runner failed: %w: %s", err, strings.TrimSpace(string(raw)))
	}

	var nmResult netmikoResult
	if err := json.Unmarshal(raw, &nmResult); err != nil {
		return result, fmt.Errorf("invalid netmiko runner output: %w", err)
	}
	if nmResult.Error != "" {
		return result, fmt.Errorf("netmiko runner error: %s", nmResult.Error)
	}

	result.Steps = nmResult.Steps
	result.Status = nmResult.Status
	result.TotalMs = time.Since(start).Milliseconds()

	for i, sr := range result.Steps {
		base := StepEvent{
			DeviceID:    device.ID,
			DeviceIP:    device.IP,
			DeviceLabel: label,
			StepIndex:   i,
			TotalSteps:  len(pb.Steps),
			StepName:    sr.Name,
			Command:     sr.Command,
			Done:        true,
			Output:      sr.Output,
			Passed:      sr.Passed,
			Error:       sr.Error,
		}
		emit(base)
	}

	saveExecution(result, device.ID, "")
	if result.Status != "success" {
		return result, fmt.Errorf("netmiko playbook failed")
	}
	return result, nil
}

func netmikoDeviceTypeFromVendor(vendor string) string {
	switch strings.ToLower(strings.TrimSpace(vendor)) {
	case "cisco":
		return "cisco_ios"
	case "aruba", "hp":
		return "hp_procurve"
	case "hpe", "huawei":
		return "hp_comware"
	case "fortinet":
		return "fortinet"
	case "allied":
		return "cisco_ios"
	default:
		return "autodetect"
	}
}

func saveExecution(result *ExecutionResult, deviceID, playbookID string) {
	if db.DB == nil {
		return
	}
	output := formatOutput(result)
	exec := models.PlaybookExecution{
		ID:         uuid.NewString(),
		PlaybookID: playbookID,
		DeviceID:   deviceID,
		Status:     result.Status,
		Output:     output,
		DurationMs: result.TotalMs,
	}
	db.DB.Create(&exec)
}

func formatOutput(result *ExecutionResult) string {
	var sb strings.Builder
	for _, step := range result.Steps {
		sb.WriteString(fmt.Sprintf("=== Step: %s ===\n", step.Name))
		sb.WriteString(fmt.Sprintf("$ %s\n", step.Command))
		sb.WriteString(step.Output)
		if step.Error != "" {
			sb.WriteString(fmt.Sprintf("\nERROR: %s", step.Error))
		}
		sb.WriteString("\n\n")
	}
	return sb.String()
}
