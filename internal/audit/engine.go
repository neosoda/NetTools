package audit

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"
	"nettools/internal/logger"

	"github.com/google/uuid"
)

// Engine runs compliance checks against device configurations
type Engine struct{}

func New() *Engine {
	return &Engine{}
}

type AuditRequest struct {
	Device  models.Device
	Config  string   // running-config text
	RuleIDs []string // optional: restrict to these rule IDs (empty = all)
}

type AuditReport struct {
	DeviceID      string               `json:"device_id"`
	DeviceIP      string               `json:"device_ip"`
	DeviceHost    string               `json:"device_hostname"`
	Status        string               `json:"status"` // completed|error
	ErrorMessage  string               `json:"error_message"`
	BackupID      string               `json:"backup_id"`
	BackupStatus  string               `json:"backup_status"`
	BackupAt      *time.Time           `json:"backup_at"`
	TotalRules    int                  `json:"total_rules"`
	Passed        int                  `json:"passed"` // backward-compatible alias for Compliant
	Failed        int                  `json:"failed"` // backward-compatible alias for NonCompliant
	Compliant     int                  `json:"compliant"`
	NonCompliant  int                  `json:"non_compliant"`
	NotApplicable int                  `json:"not_applicable"`
	Indeterminate int                  `json:"indeterminate"`
	Errors        int                  `json:"errors"`
	Assessed      int                  `json:"assessed"`
	Score         float64              `json:"score"`
	Results       []models.AuditResult `json:"results"`
	CreatedAt     time.Time            `json:"created_at"`
}

const (
	StatusCompliant     = "compliant"
	StatusNonCompliant  = "non_compliant"
	StatusNotApplicable = "not_applicable"
	StatusIndeterminate = "indeterminate"
	StatusError         = "error"
)

type ruleEvaluation struct {
	Status   string
	Details  string
	Evidence string
}

// Run executes audit rules against a device config
func (e *Engine) Run(ctx context.Context, req AuditRequest) (*AuditReport, error) {
	var rules []models.AuditRule
	query := db.DB.Where("enabled = ?", true)
	if len(req.RuleIDs) > 0 {
		query = query.Where("id IN ?", req.RuleIDs)
	}
	if err := query.Find(&rules).Error; err != nil {
		return nil, err
	}

	report := &AuditReport{
		DeviceID:   req.Device.ID,
		DeviceIP:   req.Device.IP,
		DeviceHost: req.Device.Hostname,
		Status:     "completed",
		TotalRules: len(rules),
		CreatedAt:  time.Now(),
	}

	for _, rule := range rules {
		select {
		case <-ctx.Done():
			return report, ctx.Err()
		default:
		}

		evaluation := evaluateRule(rule, req.Config)
		if !ruleApplies(rule, req.Device) {
			evaluation = ruleEvaluation{
				Status:  StatusNotApplicable,
				Details: fmt.Sprintf("Règle réservée au constructeur %s ; équipement identifié comme %s.", rule.Vendor, deviceVendor(req.Device)),
			}
		}
		passed := evaluation.Status == StatusCompliant

		result := models.AuditResult{
			ID:          uuid.NewString(),
			DeviceID:    req.Device.ID,
			RuleID:      rule.ID,
			RuleName:    rule.Name,
			Passed:      passed,
			Status:      evaluation.Status,
			Category:    rule.Category,
			Expected:    rule.Description,
			Risk:        rule.Risk,
			Details:     evaluation.Details,
			Evidence:    evaluation.Evidence,
			Severity:    rule.Severity,
			Remediation: "",
		}

		if (evaluation.Status == StatusNonCompliant || evaluation.Status == StatusIndeterminate) && rule.Remediation != "" {
			result.Remediation = redactSensitive(rule.Remediation)
		}

		if err := db.DB.Create(&result).Error; err != nil {
			logger.Error(fmt.Sprintf("failed to persist audit result for device %s rule %s", req.Device.ID, rule.ID), err)
		}
		report.Results = append(report.Results, result)

		switch evaluation.Status {
		case StatusCompliant:
			report.Compliant++
		case StatusNonCompliant:
			report.NonCompliant++
		case StatusNotApplicable:
			report.NotApplicable++
		case StatusIndeterminate:
			report.Indeterminate++
		default:
			report.Errors++
		}
	}

	report.Passed = report.Compliant
	report.Failed = report.NonCompliant
	report.Assessed = report.Compliant + report.NonCompliant
	if report.Assessed > 0 {
		report.Score = float64(report.Compliant) / float64(report.Assessed) * 100
	}

	return report, nil
}

func evaluateRule(rule models.AuditRule, config string) ruleEvaluation {
	if strings.TrimSpace(config) == "" {
		return ruleEvaluation{Status: StatusError, Details: "Configuration vide : contrôle impossible."}
	}
	if strings.Contains(rule.Pattern, " AND ") {
		return evaluateMultiPattern(rule, config)
	}
	re, err := compilePattern(rule.Pattern)
	if err != nil {
		return ruleEvaluation{Status: StatusError, Details: fmt.Sprintf("Expression régulière invalide : %v", err)}
	}
	match := re.FindString(config)
	if rule.MustMatch {
		if match == "" {
			return ruleEvaluation{Status: StatusIndeterminate, Details: "La configuration ne fournit pas de preuve suffisante pour confirmer cette exigence.", Evidence: diagnoseFailure(rule.Pattern, config)}
		}
		return ruleEvaluation{Status: StatusCompliant, Details: "Exigence vérifiée dans la configuration.", Evidence: redactEvidence(match)}
	}
	if match != "" {
		return ruleEvaluation{Status: StatusNonCompliant, Details: "Une configuration interdite a été détectée.", Evidence: redactEvidence(match)}
	}
	return ruleEvaluation{Status: StatusCompliant, Details: "Aucune configuration interdite n’a été détectée."}
}

// evaluateMultiPattern handles rules with "pattern1 AND pattern2" syntax
// This allows verifying multi-line blocks (e.g., NTP server AND its authentication)
func evaluateMultiPattern(rule models.AuditRule, config string) ruleEvaluation {
	var missing, found []string
	for _, part := range strings.Split(rule.Pattern, " AND ") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		re, err := compilePattern(part)
		if err != nil {
			return ruleEvaluation{Status: StatusError, Details: fmt.Sprintf("Expression régulière invalide : %v", err)}
		}
		if match := re.FindString(config); match != "" {
			found = append(found, redactEvidence(match))
		} else {
			missing = append(missing, part)
		}
	}
	if rule.MustMatch {
		if len(missing) > 0 {
			return ruleEvaluation{Status: StatusIndeterminate, Details: "La configuration ne permet pas de confirmer tous les éléments requis.", Evidence: fmt.Sprintf("Éléments confirmés : %s. Éléments non prouvés : %s.", strings.Join(found, " ; "), strings.Join(missing, ", "))}
		}
		return ruleEvaluation{Status: StatusCompliant, Details: "Tous les éléments requis ont été vérifiés.", Evidence: strings.Join(found, " ; ")}
	}
	if len(found) > 0 {
		return ruleEvaluation{Status: StatusNonCompliant, Details: "Une ou plusieurs configurations interdites ont été détectées.", Evidence: strings.Join(found, " ; ")}
	}
	return ruleEvaluation{Status: StatusCompliant, Details: "Aucune configuration interdite n’a été détectée."}
}

func compilePattern(pattern string) (*regexp.Regexp, error) {
	flags := "(?im)"
	if strings.HasPrefix(pattern, "(?") {
		flags = ""
	}
	return regexp.Compile(flags + pattern)
}

func ruleApplies(rule models.AuditRule, device models.Device) bool {
	return rule.Vendor == "" || strings.EqualFold(strings.TrimSpace(rule.Vendor), deviceVendor(device))
}

func deviceVendor(device models.Device) string {
	vendor := strings.TrimSpace(device.Vendor)
	if vendor == "" {
		return "inconnu"
	}
	return vendor
}

var sensitiveLine = regexp.MustCompile(`(?i)\b(password|secret|community|private-key|authentication-key|privacy-password|psk)\b`)

func redactEvidence(value string) string {
	value = truncate(value, 240)
	if sensitiveLine.MatchString(value) {
		return "[élément de configuration sensible masqué]"
	}
	return value
}

func redactSensitive(value string) string {
	lines := strings.Split(value, "\n")
	for i, line := range lines {
		if sensitiveLine.MatchString(line) {
			lines[i] = "[recommandation contenant une donnée sensible masquée]"
		}
	}
	return strings.Join(lines, "\n")
}

// diagnoseFailure provides a detailed explanation when a MustMatch rule fails.
// It extracts keywords from the pattern, checks which are present/absent in the config,
// and returns a human-readable message to speed up troubleshooting.
func diagnoseFailure(pattern, config string) string {
	wordRe := regexp.MustCompile(`[a-zA-Z][a-zA-Z0-9_\-]{2,}`)
	words := wordRe.FindAllString(pattern, -1)

	if len(words) == 0 {
		return fmt.Sprintf("Pattern not found: %s", pattern)
	}

	configLower := strings.ToLower(config)
	var found, missing []string
	seen := map[string]bool{}
	for _, w := range words {
		wl := strings.ToLower(w)
		if seen[wl] {
			continue
		}
		seen[wl] = true
		if strings.Contains(configLower, wl) {
			found = append(found, w)
		} else {
			missing = append(missing, w)
		}
	}

	switch {
	case len(missing) == 0:
		return fmt.Sprintf("Pattern structure absent (mots-clés présents: %s)", strings.Join(found, ", "))
	case len(found) == 0:
		return fmt.Sprintf("Aucune correspondance — mots-clés absents: %s", strings.Join(missing, ", "))
	default:
		return fmt.Sprintf("Partiel — trouvé: [%s] / manquant: [%s]", strings.Join(found, ", "), strings.Join(missing, ", "))
	}
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
