package db

import (
	"fmt"
	"os"
	"path/filepath"

	"nettools/internal/db/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Ready() bool { return DB != nil }

func Init(appDataDir string) error {
	dbPath := filepath.Join(appDataDir, "nettools.db")
	if err := os.MkdirAll(appDataDir, 0700); err != nil {
		return fmt.Errorf("failed to create data dir: %w", err)
	}
	db, err := gorm.Open(sqlite.Open(dbPath+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	db.Exec("PRAGMA foreign_keys = ON")
	if err := db.AutoMigrate(
		&models.Device{}, &models.DeviceGroup{}, &models.Credential{}, &models.Backup{}, &models.ScheduledJob{},
		&models.AuditLog{}, &models.AuditRule{}, &models.AuditResult{}, &models.Playbook{},
		&models.PlaybookExecution{}, &models.SchemaMigration{},
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}
	DB = db
	seedAuditRules(db)
	return nil
}

func seedAuditRules(db *gorm.DB) {
	const catalogVersion = 3
	var migration models.SchemaMigration
	if db.Where("version = ?", catalogVersion).First(&migration).Error == nil {
		return
	}

	legacyRuleIDs := []string{
		"rule-ntp-1", "rule-telnet-1", "rule-ssh-1", "rule-banner-1", "rule-password-1", "rule-logging-1",
		"aruba-pwd-enc", "aruba-manager-del", "aruba-http-off", "aruba-dhcp-off", "aruba-ssh-svc", "aruba-ssh-users",
		"aruba-log-local", "aruba-log-host", "aruba-tz-paris", "aruba-ntp-acad", "aruba-snmp-community", "aruba-radius",
		"aruba-aaa-enable", "aruba-aaa-login", "aruba-lldp", "aruba-stp-rstp", "aruba-loop-protect", "aruba-multicast",
		"aruba-pvlan-999", "aruba-vlan1-admin", "aruba-vlan401-pedago", "aruba-vlan502-dmzpriv", "aruba-vlan504-dmzpedago", "aruba-vlan517-srvpeda",
	}
	// Preserve earlier shipped rules for review, but prevent their site-specific
	// assumptions from being treated as universal compliance requirements.
	db.Model(&models.AuditRule{}).Where("id IN ?", legacyRuleIDs).Update("enabled", false)
	for _, rule := range professionalRules() {
		db.FirstOrCreate(&rule, models.AuditRule{ID: rule.ID})
	}
	db.Create(&models.SchemaMigration{Version: catalogVersion})
}

func professionalRules() []models.AuditRule {
	return []models.AuditRule{
		{ID: "generic-default-snmp-community", Name: "Communauté SNMP par défaut interdite", Category: "Sécurité des accès", Description: "La configuration ne doit pas utiliser les communautés SNMP par défaut public ou private.", Risk: "Une communauté par défaut facilite l’accès non autorisé aux informations de supervision.", Pattern: `^\s*(?:snmp-server|snmp-agent).*community\s+(?:public|private)\b`, MustMatch: false, Severity: "high", Enabled: true, Remediation: "Remplacer la communauté par une valeur gérée de manière sécurisée et restreindre les sources autorisées."},
		{ID: "cisco-telnet-vty", Name: "Cisco : Telnet interdit sur les lignes VTY", Category: "Sécurité des accès", Vendor: "cisco", Description: "Les lignes VTY ne doivent pas autoriser Telnet.", Risk: "Telnet transmet les identifiants et les sessions en clair.", Pattern: `^\s*transport input .*\btelnet\b`, MustMatch: false, Severity: "critical", Enabled: true, Remediation: "Vérifier la politique d’administration distante puis limiter les lignes VTY à SSH."},
		{ID: "cisco-http-server", Name: "Cisco : serveur HTTP non chiffré interdit", Category: "Services réseau", Vendor: "cisco", Description: "Le serveur HTTP Cisco ne doit pas être activé sans chiffrement.", Risk: "Une interface HTTP d’administration expose des identifiants en clair.", Pattern: `^\s*ip http server\b`, MustMatch: false, Severity: "high", Enabled: true, Remediation: "Désactiver HTTP ou basculer vers HTTPS selon la politique d’administration validée."},
		{ID: "aruba-web-management-disabled", Name: "Aruba AOS-S : administration Web désactivée", Category: "Services réseau", Vendor: "aruba", Description: "La configuration doit apporter une preuve explicite de désactivation de l’administration Web.", Risk: "Une interface Web non maîtrisée accroît la surface d’administration.", Pattern: `^\s*no web-management\b`, MustMatch: true, Severity: "medium", Enabled: true, Remediation: "Vérifier la politique d’administration Web et documenter la configuration retenue."},
		{ID: "allied-telnet-disabled", Name: "AlliedWare Plus : Telnet désactivé", Category: "Sécurité des accès", Vendor: "allied", Description: "La configuration doit apporter une preuve explicite de désactivation de Telnet.", Risk: "Telnet expose les sessions d’administration en clair.", Pattern: `^\s*no service telnet\b`, MustMatch: true, Severity: "high", Enabled: true, Remediation: "Vérifier la syntaxe correspondant à la version AlliedWare Plus et la politique SSH."},
		{ID: "huawei-telnet-disabled", Name: "Huawei : Telnet désactivé", Category: "Sécurité des accès", Vendor: "huawei", Description: "La configuration doit apporter une preuve explicite de désactivation du serveur Telnet.", Risk: "Telnet ne protège pas les identifiants ni les commandes d’administration.", Pattern: `^\s*undo telnet server enable\b`, MustMatch: true, Severity: "high", Enabled: true, Remediation: "Vérifier la politique d’accès distante et la configuration SSH/Stelnet applicable."},
		{ID: "fortinet-telnet-disabled", Name: "Fortinet : Telnet d’administration désactivé", Category: "Sécurité des accès", Vendor: "fortinet", Description: "La configuration doit apporter une preuve explicite de désactivation de Telnet pour l’administration.", Risk: "Telnet expose les identifiants et les sessions d’administration en clair.", Pattern: `^\s*set admin-telnet disable\b`, MustMatch: true, Severity: "high", Enabled: true, Remediation: "Vérifier les accès d’administration autorisés dans la configuration système Fortinet."},
	}
}
