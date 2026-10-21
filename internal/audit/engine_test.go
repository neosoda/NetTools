package audit

import (
	"nettools/internal/db/models"
	"strings"
	"testing"
)

func TestRequiredRuleWithoutProofIsIndeterminate(t *testing.T) {
	result := evaluateRule(models.AuditRule{Pattern: `^service ssh$`, MustMatch: true}, "hostname edge")
	if result.Status != StatusIndeterminate {
		t.Fatalf("status = %q, want %q", result.Status, StatusIndeterminate)
	}
}

func TestForbiddenPatternProducesEvidence(t *testing.T) {
	rule := models.AuditRule{Pattern: `^\s*transport input .*telnet\b`, MustMatch: false}
	result := evaluateRule(rule, "line vty 0 4\n transport input ssh telnet")
	if result.Status != StatusNonCompliant || !strings.Contains(result.Evidence, "transport input") {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestSensitiveEvidenceIsRedacted(t *testing.T) {
	rule := models.AuditRule{Pattern: `^snmp-server community.*`, MustMatch: false}
	result := evaluateRule(rule, "snmp-server community private ro")
	if result.Status != StatusNonCompliant || strings.Contains(result.Evidence, "private") {
		t.Fatalf("sensitive evidence leaked: %#v", result)
	}
}

func TestInvalidPatternIsTechnicalError(t *testing.T) {
	result := evaluateRule(models.AuditRule{Pattern: `[`, MustMatch: true}, "hostname edge")
	if result.Status != StatusError {
		t.Fatalf("status = %q, want %q", result.Status, StatusError)
	}
}

func TestMultiPatternWithoutAllProofIsIndeterminate(t *testing.T) {
	rule := models.AuditRule{Pattern: `^ntp server one$ AND ^ntp authenticate$`, MustMatch: true}
	result := evaluateMultiPattern(rule, "ntp server one")
	if result.Status != StatusIndeterminate {
		t.Fatalf("status = %q, want %q", result.Status, StatusIndeterminate)
	}
}

func TestVendorApplicability(t *testing.T) {
	if ruleApplies(models.AuditRule{Vendor: "cisco"}, models.Device{Vendor: "aruba"}) {
		t.Fatal("Cisco rule must not apply to Aruba")
	}
}
