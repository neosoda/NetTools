package db

import (
	"fmt"
	"os"
	"path/filepath"

	"networktools/internal/db/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Ready returns true if the database is initialized and ready
func Ready() bool { return DB != nil }

func Init(appDataDir string) error {
	dbPath := filepath.Join(appDataDir, "networktools.db")

	// Ensure directory exists
	if err := os.MkdirAll(appDataDir, 0700); err != nil {
		return fmt.Errorf("failed to create data dir: %w", err)
	}

	db, err := gorm.Open(sqlite.Open(dbPath+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys
	db.Exec("PRAGMA foreign_keys = ON")

	// Auto-migrate all models
	if err := db.AutoMigrate(
		&models.Device{},
		&models.Credential{},
		&models.Backup{},
		&models.ScheduledJob{},
		&models.AuditLog{},
		&models.AuditRule{},
		&models.AuditResult{},
		&models.Playbook{},
		&models.PlaybookExecution{},
		&models.SchemaMigration{},
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	DB = db

	// Seed default audit rules
	seedAuditRules(db)

	return nil
}

func seedAuditRules(db *gorm.DB) {
	var count int64
	db.Model(&models.AuditRule{}).Count(&count)
	if count > 0 {
		return
	}

	rules := []models.AuditRule{
		{ID: "rule-ntp-1", Name: "NTP configured", Description: "Device must have NTP server configured", Pattern: `ntp server`, MustMatch: true, Severity: "high", Enabled: true},
		{ID: "rule-telnet-1", Name: "Telnet disabled", Description: "Telnet must not be enabled", Pattern: `transport input telnet`, MustMatch: false, Severity: "critical", Vendor: "cisco", Enabled: true},
		{ID: "rule-ssh-1", Name: "SSHv2 enforced", Description: "SSH version 2 must be configured", Pattern: `ip ssh version 2`, MustMatch: true, Severity: "critical", Vendor: "cisco", Enabled: true},
		{ID: "rule-banner-1", Name: "Login banner set", Description: "Login banner must be configured", Pattern: `banner (login|motd)`, MustMatch: true, Severity: "medium", Enabled: true},
		{ID: "rule-password-1", Name: "Password encryption", Description: "Service password-encryption must be enabled", Pattern: `service password-encryption`, MustMatch: true, Severity: "high", Vendor: "cisco", Enabled: true},
		{ID: "rule-logging-1", Name: "Remote logging", Description: "Syslog server must be configured", Pattern: `logging \d+\.\d+\.\d+\.\d+`, MustMatch: true, Severity: "medium", Enabled: true},
	}

	for _, r := range rules {
		db.FirstOrCreate(&r, models.AuditRule{ID: r.ID})
	}
}
