package snmp

import (
	"testing"

	"github.com/gosnmp/gosnmp"
)

func TestV3SecurityLevels(t *testing.T) {
	tests := []struct {
		name   string
		params ScanParams
		flags  gosnmp.SnmpV3MsgFlags
		auth   gosnmp.SnmpV3AuthProtocol
		priv   gosnmp.SnmpV3PrivProtocol
	}{
		{
			name:   "noAuthNoPriv",
			params: ScanParams{Username: "monitor", AuthProto: "NONE", PrivProto: "NONE"},
			flags:  gosnmp.NoAuthNoPriv,
			auth:   gosnmp.NoAuth,
			priv:   gosnmp.NoPriv,
		},
		{
			name:   "authNoPriv SHA256",
			params: ScanParams{Username: "monitor", AuthProto: "SHA-256", AuthKey: "auth-pass", PrivProto: "NONE"},
			flags:  gosnmp.AuthNoPriv,
			auth:   gosnmp.SHA256,
			priv:   gosnmp.NoPriv,
		},
		{
			name: "authPriv SHA512 AES256C",
			params: ScanParams{
				Username: "monitor", AuthProto: "SHA512", AuthKey: "auth-pass",
				PrivProto: "AES256C", PrivKey: "priv-pass",
			},
			flags: gosnmp.AuthPriv,
			auth:  gosnmp.SHA512,
			priv:  gosnmp.AES256C,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flags, auth, priv, err := v3Security(tt.params)
			if err != nil {
				t.Fatalf("v3Security() error = %v", err)
			}
			if flags != tt.flags || auth != tt.auth || priv != tt.priv {
				t.Fatalf("v3Security() = (%v, %v, %v), want (%v, %v, %v)", flags, auth, priv, tt.flags, tt.auth, tt.priv)
			}
		})
	}
}

func TestV3SecuritySupportsAllGoSNMPProtocols(t *testing.T) {
	authProtocols := []string{"MD5", "SHA", "SHA224", "SHA256", "SHA384", "SHA512"}
	for _, protocol := range authProtocols {
		if _, err := parseAuthProto(protocol); err != nil {
			t.Errorf("parseAuthProto(%q) error = %v", protocol, err)
		}
	}

	privProtocols := []string{"DES", "AES", "AES192", "AES256", "AES192C", "AES256C"}
	for _, protocol := range privProtocols {
		if _, err := parsePrivProto(protocol); err != nil {
			t.Errorf("parsePrivProto(%q) error = %v", protocol, err)
		}
	}
}

func TestV3SecurityRejectsInvalidConfigurations(t *testing.T) {
	tests := []struct {
		name   string
		params ScanParams
	}{
		{name: "missing username", params: ScanParams{}},
		{name: "privacy without auth", params: ScanParams{Username: "monitor", PrivProto: "AES", PrivKey: "priv-pass"}},
		{name: "short auth passphrase", params: ScanParams{Username: "monitor", AuthProto: "SHA256", AuthKey: "short"}},
		{name: "short privacy passphrase", params: ScanParams{Username: "monitor", AuthProto: "SHA256", AuthKey: "auth-pass", PrivProto: "AES", PrivKey: "short"}},
		{name: "unknown auth", params: ScanParams{Username: "monitor", AuthProto: "SHA3"}},
		{name: "unknown privacy", params: ScanParams{Username: "monitor", PrivProto: "CHACHA20"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := ValidateV3Security(tt.params); err == nil {
				t.Fatal("ValidateV3Security() error = nil, want error")
			}
		})
	}
}
