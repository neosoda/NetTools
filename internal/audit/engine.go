package audit

import (
	"context"
	"regexp"
	"time"

	"networktools/internal/db"
	"networktools/internal/db/models"

	"github.com/google/uuid"
)

// Engine runs compliance checks against device configurations
type Engine struct{}

func New() *Engine {
	return &Engine{}
}

type AuditRequest struct {
	Device  models.Device
	Config  string // running-config text
}

type AuditReport struct {
	DeviceID   string              `json:"device_id"`
	DeviceIP   string              `json:"device_ip"`
	TotalRules int                 `json:"total_rules"`
	Passed     int                 `json:"passed"`
	Failed     int                 `json:"failed"`
	Score      float64             `json:"score"`
	Results    []models.AuditResult `json:"results"`
	CreatedAt  time.Time           `json:"created_at"`
}

// Run executes all enabled audit rules against a device config
func (e *Engine) Run(ctx context.Context, req AuditRequest) (*AuditReport, error) {
	var rules []models.AuditRule
	query := db.DB.Where("enabled = ?", true)
	if req.Device.Vendor != "" {
		query = query.Where("vendor = '' OR vendor = ?", req.Device.Vendor)
	}
	if err := query.Find(&rules).Error; err != nil {
		return nil, err
	}

	report := &AuditReport{
		DeviceID:   req.Device.ID,
		DeviceIP:   req.Device.IP,
		TotalRules: len(rules),
		CreatedAt:  time.Now(),
	}

	for _, rule := range rules {
		select {
		case <-ctx.Done():
			return report, ctx.Err()
		default:
		}

		re, err := regexp.Compile("(?i)" + rule.Pattern)
		if err != nil {
			continue
		}

		matches := re.MatchString(req.Config)
		passed := (rule.MustMatch && matches) || (!rule.MustMatch && !matches)

		details := ""
		if !passed {
			if rule.MustMatch {
				details = "Pattern not found: " + rule.Pattern
			} else {
				details = "Forbidden pattern found: " + rule.Pattern
			}
		}

		result := models.AuditResult{
			ID:       uuid.NewString(),
			DeviceID: req.Device.ID,
			RuleID:   rule.ID,
			RuleName: rule.Name,
			Passed:   passed,
			Details:  details,
			Severity: rule.Severity,
		}

		db.DB.Create(&result)
		report.Results = append(report.Results, result)

		if passed {
			report.Passed++
		} else {
			report.Failed++
		}
	}

	if report.TotalRules > 0 {
		report.Score = float64(report.Passed) / float64(report.TotalRules) * 100
	}

	return report, nil
}
