package playbook

import "testing"

func TestParseRejectsStepWithoutCommands(t *testing.T) {
	_, err := Parse(`name: bad
steps:
  - name: empty
`)
	if err == nil {
		t.Fatal("expected parse error for step without command(s)")
	}
}

func TestParseAcceptsCommandsList(t *testing.T) {
	pb, err := Parse(`name: good
executor: netmiko
steps:
  - name: vlan-create
    commands:
      - configure terminal
      - vlan 10
      - name USERS
`)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if got := len(pb.Steps[0].Commands); got != 3 {
		t.Fatalf("expected 3 commands, got %d", got)
	}
}

func TestNetmikoDeviceTypeFromVendor(t *testing.T) {
	cases := map[string]string{
		"cisco":   "cisco_ios",
		"huawei":  "hp_comware",
		"unknown": "autodetect",
	}
	for in, want := range cases {
		if got := netmikoDeviceTypeFromVendor(in); got != want {
			t.Fatalf("vendor %s: got %s, want %s", in, got, want)
		}
	}
}
