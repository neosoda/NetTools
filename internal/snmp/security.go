package snmp

import (
	"fmt"
	"strings"

	"github.com/gosnmp/gosnmp"
)

// ValidateV3Security validates and normalizes the USM configuration without
// opening a network connection.
func ValidateV3Security(params ScanParams) error {
	_, _, _, err := v3Security(params)
	return err
}

func configureV3Security(g *gosnmp.GoSNMP, params ScanParams) error {
	flags, authProtocol, privProtocol, err := v3Security(params)
	if err != nil {
		return err
	}

	g.SecurityModel = gosnmp.UserSecurityModel
	g.MsgFlags = flags
	g.SecurityParameters = &gosnmp.UsmSecurityParameters{
		UserName:                 strings.TrimSpace(params.Username),
		AuthenticationProtocol:   authProtocol,
		AuthenticationPassphrase: params.AuthKey,
		PrivacyProtocol:          privProtocol,
		PrivacyPassphrase:        params.PrivKey,
	}
	return nil
}

func v3Security(params ScanParams) (gosnmp.SnmpV3MsgFlags, gosnmp.SnmpV3AuthProtocol, gosnmp.SnmpV3PrivProtocol, error) {
	if strings.TrimSpace(params.Username) == "" {
		return 0, 0, 0, fmt.Errorf("SNMPv3 username is required")
	}

	authProtocol, err := parseAuthProto(params.AuthProto)
	if err != nil {
		return 0, 0, 0, err
	}
	privProtocol, err := parsePrivProto(params.PrivProto)
	if err != nil {
		return 0, 0, 0, err
	}

	if privProtocol != gosnmp.NoPriv && authProtocol == gosnmp.NoAuth {
		return 0, 0, 0, fmt.Errorf("SNMPv3 privacy requires authentication")
	}
	if authProtocol != gosnmp.NoAuth && len(params.AuthKey) < 8 {
		return 0, 0, 0, fmt.Errorf("SNMPv3 authentication passphrase must contain at least 8 characters")
	}
	if privProtocol != gosnmp.NoPriv && len(params.PrivKey) < 8 {
		return 0, 0, 0, fmt.Errorf("SNMPv3 privacy passphrase must contain at least 8 characters")
	}

	switch {
	case privProtocol != gosnmp.NoPriv:
		return gosnmp.AuthPriv, authProtocol, privProtocol, nil
	case authProtocol != gosnmp.NoAuth:
		return gosnmp.AuthNoPriv, authProtocol, gosnmp.NoPriv, nil
	default:
		return gosnmp.NoAuthNoPriv, gosnmp.NoAuth, gosnmp.NoPriv, nil
	}
}

func parseAuthProto(proto string) (gosnmp.SnmpV3AuthProtocol, error) {
	switch strings.ToUpper(strings.TrimSpace(proto)) {
	case "", "NONE", "NOAUTH":
		return gosnmp.NoAuth, nil
	case "MD5":
		return gosnmp.MD5, nil
	case "SHA", "SHA1", "SHA-1":
		return gosnmp.SHA, nil
	case "SHA224", "SHA-224":
		return gosnmp.SHA224, nil
	case "SHA256", "SHA-256":
		return gosnmp.SHA256, nil
	case "SHA384", "SHA-384":
		return gosnmp.SHA384, nil
	case "SHA512", "SHA-512":
		return gosnmp.SHA512, nil
	default:
		return 0, fmt.Errorf("unsupported SNMPv3 authentication protocol %q", proto)
	}
}

func parsePrivProto(proto string) (gosnmp.SnmpV3PrivProtocol, error) {
	switch strings.ToUpper(strings.TrimSpace(proto)) {
	case "", "NONE", "NOPRIV":
		return gosnmp.NoPriv, nil
	case "DES":
		return gosnmp.DES, nil
	case "AES", "AES128", "AES-128":
		return gosnmp.AES, nil
	case "AES192", "AES-192":
		return gosnmp.AES192, nil
	case "AES256", "AES-256":
		return gosnmp.AES256, nil
	case "AES192C", "AES-192C":
		return gosnmp.AES192C, nil
	case "AES256C", "AES-256C":
		return gosnmp.AES256C, nil
	default:
		return 0, fmt.Errorf("unsupported SNMPv3 privacy protocol %q", proto)
	}
}
