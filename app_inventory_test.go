package main

import (
	"path/filepath"
	"testing"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type legacyDevice struct {
	ID           string `gorm:"primaryKey"`
	IP           string `gorm:"uniqueIndex;not null"`
	Hostname     string
	CredentialID string
	Description  string
	Location     string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (legacyDevice) TableName() string { return "devices" }

func TestInventoryMigrationAndImportPreserveExistingDevice(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "nettools.db")
	legacyDB, err := gorm.Open(sqlite.Open(databasePath), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := legacyDB.AutoMigrate(&legacyDevice{}); err != nil {
		t.Fatal(err)
	}
	if err := legacyDB.Create(&legacyDevice{
		ID: "existing-device", IP: "192.0.2.10", Hostname: "core-old",
		CredentialID: "credential-1", Description: "Libellé administrateur", Location: "Salle réseau",
	}).Error; err != nil {
		t.Fatal(err)
	}
	legacySQL, err := legacyDB.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := legacySQL.Close(); err != nil {
		t.Fatal(err)
	}

	if err := db.Init(filepath.Dir(databasePath)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if db.DB != nil {
			if sqlDB, err := db.DB.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
	})
	count, err := mergeImportedDevices(db.DB, []models.Device{{
		ID: "imported-id", IP: "192.0.2.10", Hostname: "core-new", Model: "X123",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("imported %d devices, want 1", count)
	}
	sqlDB, err := db.DB.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	if err := db.Init(filepath.Dir(databasePath)); err != nil {
		t.Fatal(err)
	}

	var device models.Device
	if err := db.DB.First(&device, "ip = ?", "192.0.2.10").Error; err != nil {
		t.Fatal(err)
	}
	if device.ID != "existing-device" || device.CredentialID != "credential-1" {
		t.Fatalf("existing relations were not preserved: %#v", device)
	}
	if device.Description != "Libellé administrateur" || device.Location != "Salle réseau" {
		t.Fatalf("empty import fields replaced custom data: %#v", device)
	}
	if device.Hostname != "core-new" || device.Model != "X123" {
		t.Fatalf("import data was not applied: %#v", device)
	}
}

func TestMergeImportedDevicesDeduplicatesIPs(t *testing.T) {
	if err := db.Init(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if db.DB != nil {
			if sqlDB, err := db.DB.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
	})
	count, err := mergeImportedDevices(db.DB, []models.Device{
		{IP: "192.0.2.20", Hostname: "first"},
		{IP: "192.0.2.20", Hostname: "duplicate"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("imported %d devices, want 1", count)
	}
	var total int64
	if err := db.DB.Model(&models.Device{}).Where("ip = ?", "192.0.2.20").Count(&total).Error; err != nil {
		t.Fatal(err)
	}
	if total != 1 {
		t.Fatalf("stored %d devices for one IP, want 1", total)
	}
}

func TestMergeDiscoveredDevicePreservesCustomData(t *testing.T) {
	now := time.Now()
	existing := models.Device{
		ID: "device-1", IP: "192.0.2.30", Description: "Description personnalisée",
		Location: "Armoire A", CredentialID: "credential-1", Hostname: "old-name",
	}
	merged := mergeDiscoveredDevice(existing, models.Device{
		IP: "192.0.2.30", Hostname: "new-name", Model: "Switch 48", LastSeenAt: &now,
	})
	if merged.Description != existing.Description || merged.Location != existing.Location || merged.CredentialID != existing.CredentialID {
		t.Fatalf("discovery overwrote custom fields: %#v", merged)
	}
	if merged.Hostname != "new-name" || merged.Model != "Switch 48" || merged.LastSeenAt != &now {
		t.Fatalf("discovery data was not refreshed: %#v", merged)
	}
}
