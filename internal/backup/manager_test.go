package backup

import "testing"

func TestExtractConfigContentInteractiveStripsEcho(t *testing.T) {
	raw := "show running-config\nBuilding configuration...\n!\nhostname SW-01\ninterface vlan 1\n ip address 10.0.0.1 255.255.255.0\nend\nSW-01#\n"
	got := extractConfigContent(raw, "show running-config", false)
	want := "Building configuration...\n!\nhostname SW-01\ninterface vlan 1\n ip address 10.0.0.1 255.255.255.0\nend"
	if got != want {
		t.Fatalf("unexpected config:\n%s", got)
	}
}

func TestExtractConfigContentExecPreservesFullOutput(t *testing.T) {
	// Exec output has no echo, no preamble — must not skip the initial '!' comment lines.
	raw := "!\nhostname SW-01\ninterface vlan 1\n ip address 10.0.0.1 255.255.255.0\nend\n"
	got := extractConfigContent(raw, "show running-config", true)
	want := "!\nhostname SW-01\ninterface vlan 1\n ip address 10.0.0.1 255.255.255.0\nend"
	if got != want {
		t.Fatalf("unexpected exec config:\n%s", got)
	}
}

func TestDeepCleanConfigRemovesPaginationArtifacts(t *testing.T) {
	raw := "line1\n-- More --\nline2\r\n\x1b[0mline3"
	got := deepCleanConfig(raw)
	if got != "line1\nline2\nline3" {
		t.Fatalf("unexpected cleaned config: %q", got)
	}
}

func TestValidateCapture(t *testing.T) {
	tests := []struct {
		name       string
		raw        string
		content    string
		wantStatus string
	}{
		{
			name:       "validated configuration",
			raw:        "hostname SW-01\ninterface vlan 1\nend\n",
			content:    "hostname SW-01\ninterface vlan 1\nend",
			wantStatus: "success",
		},
		{
			name:       "command error mixed with output",
			raw:        "show running-config\n% Invalid input detected at '^' marker.\nhostname SW-01\n",
			content:    "hostname SW-01\n",
			wantStatus: "suspect",
		},
		{
			name:       "empty command error",
			raw:        "% Invalid input detected at '^' marker.\n",
			content:    "",
			wantStatus: "failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := validateCapture(tt.raw, tt.content).status; got != tt.wantStatus {
				t.Fatalf("status = %q, want %q", got, tt.wantStatus)
			}
		})
	}
}
