package scheduler

import "testing"

func TestValidateCronExpression(t *testing.T) {
	if err := validateCronExpression("0 15 2 * * *"); err != nil {
		t.Fatalf("expected valid cron expression, got error: %v", err)
	}
}

func TestValidateCronExpressionRejectsInvalid(t *testing.T) {
	if err := validateCronExpression("invalid cron"); err == nil {
		t.Fatal("expected invalid cron expression to be rejected")
	}
}
