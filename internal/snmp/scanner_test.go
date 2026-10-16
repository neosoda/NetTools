package snmp

import (
	"context"
	"strings"
	"testing"
)

func TestResolveTargetsNormalizesAndDeduplicatesIPv4(t *testing.T) {
	targets, err := resolveTargets(ScanParams{IPs: []string{"192.168.1.10", " 192.168.1.10 ", "192.168.1.11"}})
	if err != nil {
		t.Fatalf("resolveTargets returned an error: %v", err)
	}
	if got, want := strings.Join(targets, ","), "192.168.1.10,192.168.1.11"; got != want {
		t.Fatalf("targets = %q, want %q", got, want)
	}
}

func TestResolveTargetsRejectsOversizedCIDR(t *testing.T) {
	_, err := resolveTargets(ScanParams{CIDR: "10.0.0.0/21"})
	if err == nil || !strings.Contains(err.Error(), "limit") {
		t.Fatalf("expected target limit error, got %v", err)
	}
}

func TestResolveTargetsRejectsIPv6(t *testing.T) {
	_, err := resolveTargets(ScanParams{CIDR: "2001:db8::/64"})
	if err == nil || !strings.Contains(err.Error(), "IPv4") {
		t.Fatalf("expected IPv4 validation error, got %v", err)
	}
}

func TestScanRejectsEmptyTargetSet(t *testing.T) {
	_, err := Scan(context.Background(), ScanParams{}, nil)
	if err == nil || !strings.Contains(err.Error(), "no scan targets") {
		t.Fatalf("expected empty target error, got %v", err)
	}
}
