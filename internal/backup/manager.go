package backup

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"networktools/internal/db"
	"networktools/internal/db/models"
	"networktools/internal/ssh"

	"github.com/google/uuid"
)

var unsafeChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

// Manager handles device configuration backups
type Manager struct {
	backupDir string
}

func New(backupDir string) *Manager {
	os.MkdirAll(backupDir, 0700)
	return &Manager{backupDir: backupDir}
}

type BackupRequest struct {
	Device     models.Device
	ConfigType string // running|startup
	Username   string
	Password   string
	PrivateKey string
}

// Run performs a backup for a single device
func (m *Manager) Run(ctx context.Context, req BackupRequest) (*models.Backup, error) {
	start := time.Now()
	backup := &models.Backup{
		ID:         uuid.NewString(),
		DeviceID:   req.Device.ID,
		ConfigType: req.ConfigType,
		Status:     "failed",
	}

	// Determine command
	vcfg := map[string]map[string]string{
		"cisco":   {"running": "show running-config", "startup": "show startup-config"},
		"aruba":   {"running": "show running-config", "startup": "show startup-config"},
		"allied":  {"running": "show running-config", "startup": "show startup-config"},
		"unknown": {"running": "show running-config", "startup": "show startup-config"},
	}
	vendor := req.Device.Vendor
	if vendor == "" {
		vendor = "unknown"
	}
	command := "show running-config"
	if cmds, ok := vcfg[vendor]; ok {
		if cmd, ok := cmds[req.ConfigType]; ok {
			command = cmd
		}
	}

	params := ssh.ConnectParams{
		Host:       req.Device.IP,
		Port:       req.Device.SSHPort,
		Username:   req.Username,
		Password:   req.Password,
		PrivateKey: req.PrivateKey,
		Vendor:     vendor,
		Timeout:    60 * time.Second,
	}

	sess, err := ssh.Connect(ctx, params)
	if err != nil {
		backup.ErrorMessage = err.Error()
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, err
	}
	defer sess.Close()

	output, err := sess.RunCommandInteractive(ctx, command)
	if err != nil {
		backup.ErrorMessage = err.Error()
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, err
	}

	// Save to disk
	filename := m.buildFilename(req.Device, req.ConfigType)
	filePath := filepath.Join(m.backupDir, filename)
	if err := os.WriteFile(filePath, []byte(output), 0600); err != nil {
		backup.ErrorMessage = fmt.Sprintf("write file: %v", err)
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, err
	}

	// Compute hash
	hash := sha256Sum([]byte(output))

	backup.FilePath = filePath
	backup.FileSizeBytes = int64(len(output))
	backup.SHA256Hash = hash
	backup.Status = "success"
	backup.DurationMs = time.Since(start).Milliseconds()

	db.DB.Create(backup)
	return backup, nil
}

func (m *Manager) buildFilename(device models.Device, configType string) string {
	hostname := device.Hostname
	if hostname == "" {
		hostname = device.IP
	}
	safe := unsafeChars.ReplaceAllString(hostname, "_")
	ts := time.Now().Format("20060102-150405")
	return fmt.Sprintf("%s_%s_%s_%s.txt", safe, device.IP, configType, ts)
}

func sha256Sum(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
}

// ExportZip creates a ZIP archive of selected backups
func (m *Manager) ExportZip(backupIDs []string, destPath string) error {
	var backups []models.Backup
	db.DB.Where("id IN ?", backupIDs).Find(&backups)

	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create zip: %w", err)
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	for _, b := range backups {
		if b.FilePath == "" {
			continue
		}
		content, err := os.ReadFile(b.FilePath)
		if err != nil {
			continue
		}
		entry, err := w.Create(filepath.Base(b.FilePath))
		if err != nil {
			continue
		}
		io.WriteString(entry, string(content))
	}

	return nil
}

// GetContent reads the content of a backup file
func (m *Manager) GetContent(backupID string) (string, error) {
	var backup models.Backup
	if err := db.DB.First(&backup, "id = ?", backupID).Error; err != nil {
		return "", err
	}
	if backup.FilePath == "" {
		return "", fmt.Errorf("no file path for backup %s", backupID)
	}
	content, err := os.ReadFile(backup.FilePath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// ListForDevice returns all backups for a device
func (m *Manager) ListForDevice(deviceID string) ([]models.Backup, error) {
	var backups []models.Backup
	err := db.DB.Where("device_id = ?", deviceID).Order("created_at DESC").Find(&backups).Error
	return backups, err
}

// CleanOutput removes common terminal artifacts
func CleanOutput(raw string) string {
	// Remove terminal control sequences
	result := strings.ReplaceAll(raw, "\r\n", "\n")
	result = strings.ReplaceAll(result, "\r", "\n")
	return strings.TrimSpace(result)
}
