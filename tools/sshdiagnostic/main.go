// sshdiagnostic reads cached metadata/credentials without modifying NetTools's
// database. Probe mode executes only show running-config and the existing
// terminal length 0 session preparation. It never saves or prints configuration.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	ormlog "gorm.io/gorm/logger"
	"nettools/internal/db/models"
	"nettools/internal/secret"
	"nettools/internal/ssh"
)

func main() {
	probe := flag.Bool("probe", false, "Execute read-only SSH probes; default lists metadata only")
	hosts := flag.String("hosts", "", "Explicit comma-separated probe IPs")
	subnet := flag.String("subnet", "", "Authorized subnet")
	username := flag.String("username", "", "Cached username")
	modeFlag := flag.String("mode", "both", "both, exec, shell (production backup preparation), shell-unprivileged or shell-enable")
	credentialID := flag.String("credential", "", "Explicit cached credential ID")
	flag.Parse()
	if *username == "" {
		fmt.Println("explicit cached username required")
		os.Exit(1)
	}
	if *modeFlag != "both" && *modeFlag != "exec" && *modeFlag != "shell" && *modeFlag != "shell-unprivileged" && *modeFlag != "shell-enable" {
		fmt.Println("unsupported mode")
		os.Exit(1)
	}
	_, network, err := net.ParseCIDR(*subnet)
	if err != nil {
		fmt.Println("invalid subnet")
		os.Exit(1)
	}
	dbPath := filepath.Join(os.Getenv("APPDATA"), "NetTools", "nettools.db")
	store, err := gorm.Open(sqlite.Open("file:"+filepath.ToSlash(dbPath)+"?mode=ro"), &gorm.Config{Logger: ormlog.Default.LogMode(ormlog.Silent)})
	if err != nil {
		fmt.Println("cannot open local cache read-only")
		os.Exit(1)
	}
	sqlDB, err := store.DB()
	if err != nil {
		fmt.Println("cache unavailable")
		os.Exit(1)
	}
	defer sqlDB.Close()
	var mu sync.Mutex
	emit := func(value any) { mu.Lock(); defer mu.Unlock(); json.NewEncoder(os.Stdout).Encode(value) }
	if !*probe {
		var devices []struct {
			ID, IP, Vendor, CredentialID string
			SSHPort                      int
		}
		if store.Model(&models.Device{}).Select("id,ip,vendor,credential_id,ssh_port").Find(&devices).Error != nil {
			fmt.Println("cannot read cached devices")
			os.Exit(1)
		}
		scopedIDs := []string{}
		for _, d := range devices {
			if network.Contains(net.ParseIP(d.IP)) {
				scopedIDs = append(scopedIDs, d.ID)
				emit(struct {
					Kind   string
					Device any
				}{"device", d})
			}
		}
		var creds []struct {
			ID, Name, Username  string
			HasPassword, HasKey bool
		}
		if store.Model(&models.Credential{}).Select("id,name,username,length(password_enc)>0 AS has_password,length(private_key_enc)>0 AS has_key").Where("username = ?", *username).Find(&creds).Error != nil {
			fmt.Println("cannot read credential metadata")
			os.Exit(1)
		}
		for _, c := range creds {
			emit(struct {
				Kind       string
				Credential any
			}{"credential", c})
		}
		var audits []struct {
			EntityID, Details, Status string
			DurationMs                int64
			CreatedAt                 time.Time
		}
		if store.Model(&models.AuditLog{}).Select("entity_id,details,status,duration_ms,created_at").Where("action = ?", "backup").Order("created_at DESC").Limit(300).Find(&audits).Error != nil {
			fmt.Println("cannot read backup metadata")
			os.Exit(1)
		}
		seen := make(map[string]bool)
		for _, a := range audits {
			var details struct {
				IP string `json:"ip"`
			}
			if json.Unmarshal([]byte(a.Details), &details) == nil && network.Contains(net.ParseIP(details.IP)) && !seen[details.IP] {
				seen[details.IP] = true
				emit(struct {
					Kind, IP, Status string
					DurationMs       int64
					CreatedAt        time.Time
				}{"previous_backup", details.IP, a.Status, a.DurationMs, a.CreatedAt})
			}
		}
		var backups []models.Backup
		if store.Where("device_id IN ?", scopedIDs).Order("created_at DESC").Limit(3).Find(&backups).Error == nil {
			for _, b := range backups {
				failure := "other"
				if strings.Contains(b.ErrorMessage, "empty or too short") {
					failure = "empty_output"
				}
				for _, token := range []string{"status 1", "exit status", "authentication", "permission", "privilege", "timeout", "invalid input", "no output", "failed to", "not supported"} {
					if strings.Contains(strings.ToLower(b.ErrorMessage), token) {
						failure = token
						break
					}
				}
				emit(struct {
					Kind, ConfigType, Status, Failure string
					DurationMs                        int64
				}{"cached_failed_backup", b.ConfigType, b.Status, failure, b.DurationMs})
			}
		}

		return
	}
	if *hosts == "" || *credentialID == "" {
		fmt.Println("explicit hosts and credential required")
		os.Exit(1)
	}
	selected := strings.Split(*hosts, ",")
	if len(selected) > 2 {
		fmt.Println("at most two explicit targets per run")
		os.Exit(1)
	}
	for _, host := range selected {
		if !network.Contains(net.ParseIP(host)) {
			fmt.Println("target outside authorized subnet")
			os.Exit(1)
		}
	}
	var credential models.Credential
	if store.Where("id = ? AND username = ?", *credentialID, *username).First(&credential).Error != nil {
		fmt.Println("cached credential unavailable")
		os.Exit(1)
	}
	password, err := secret.New().Decrypt(credential.PasswordEnc)
	if err != nil {
		fmt.Println("cached password cannot be decrypted for this Windows user")
		os.Exit(1)
	}
	key, err := secret.New().Decrypt(credential.PrivateKeyEnc)
	if err != nil {
		fmt.Println("cached key cannot be decrypted for this Windows user")
		os.Exit(1)
	}
	if password == "" && key == "" {
		fmt.Println("cached credential has no SSH authentication material")
		os.Exit(1)
	}
	for _, host := range selected {
		trace := func(d ssh.Diagnostic) {
			emit(struct {
				Kind, IP   string
				Diagnostic ssh.Diagnostic
			}{"trace", host, d})
		}
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		sess, err := ssh.Connect(ctx, ssh.ConnectParams{Host: host, Port: 22, Username: *username, Password: password, PrivateKey: key, Vendor: "allied", Timeout: 60 * time.Second, Diagnostic: trace})
		if err != nil {
			emit(struct{ Kind, IP, Status string }{"connect_result", host, "failed"})
			cancel()
			continue
		}
		modes := []string{"exec", "shell"}
		if *modeFlag != "both" {
			modes = []string{*modeFlag}
		}
		for _, mode := range modes {
			operation, stop := context.WithTimeout(context.Background(), 90*time.Second)
			start := time.Now()
			var output string
			if mode == "exec" {
				output, err = sess.RunCommand(operation, "show running-config")
			} else if mode == "shell-unprivileged" {
				output, err = sess.RunCommandInteractive(operation, "show running-config")
			} else if mode == "shell-enable" {
				shell, openErr := sess.OpenInteractiveShell(operation)
				err = openErr
				if err == nil {
					privilege, privilegeCancel := context.WithTimeout(operation, 5*time.Second)
					response, enableErr := shell.Run(privilege, "enable")
					privilegeCancel()
					if enableErr == nil && strings.HasSuffix(strings.TrimSpace(response), "#") {
						emit(struct{ Kind, IP, Status string }{"enable_result", host, "privileged_prompt"})
						output, err = shell.Run(operation, "show running-config")
					} else {
						emit(struct{ Kind, IP, Status string }{"enable_result", host, "not_privileged"})
						err = fmt.Errorf("privileged prompt unavailable")
					}
					shell.Close()
				}
			} else {
				output, err = sess.RunBackupInteractive(operation, "show running-config")
			}
			status := "success"
			if err != nil {
				status = "failed"
			} else if strings.Contains(strings.ToLower(output), "% invalid") {
				status = "cli_rejected"
			}
			emit(struct {
				Kind, IP, Mode, Status string
				Bytes                  int
				DurationMs             int64
			}{"read_result", host, mode, status, len(output), time.Since(start).Milliseconds()})
			output = "" // No configuration is retained or written by this utility.
			stop()
		}
		sess.Close()
		cancel()
	}
}
