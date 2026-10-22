package main

import (
	"context"
	"testing"

	"nettools/internal/db"
	"nettools/internal/db/models"
)

func setupTestApp(t *testing.T) *App {
	t.Helper()
	tempDir := t.TempDir()
	if err := db.Init(tempDir); err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	t.Cleanup(func() {
		if db.DB != nil {
			if sqlDB, err := db.DB.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
	})

	app := NewApp()
	return app
}

func TestDeviceGroupLifecycle(t *testing.T) {
	app := setupTestApp(t)

	// 1. Initial groups should be empty
	groups, err := app.GetDeviceGroups()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 0 {
		t.Fatalf("expected 0 groups, got %d", len(groups))
	}

	// 2. Cannot create empty group
	if _, err := app.SaveDeviceGroup(models.DeviceGroup{Name: ""}); err == nil {
		t.Fatal("expected error creating empty group name")
	}

	// 3. Create custom groups
	g1, err := app.SaveDeviceGroup(models.DeviceGroup{Name: "Lycée A", Description: "Site Principal"})
	if err != nil {
		t.Fatalf("failed to create group: %v", err)
	}
	if g1.ID == "" || g1.Name != "Lycée A" {
		t.Fatalf("unexpected group: %+v", g1)
	}

	g2, err := app.SaveDeviceGroup(models.DeviceGroup{Name: "Collège C", Description: "Site Secondaire"})
	if err != nil {
		t.Fatalf("failed to create group: %v", err)
	}

	// 4. Duplicate name check
	if _, err := app.SaveDeviceGroup(models.DeviceGroup{Name: "lycée a"}); err == nil {
		t.Fatal("expected error on duplicate group name (case insensitive)")
	}

	// 5. GetDeviceGroups returns ordered list
	groups, err = app.GetDeviceGroups()
	if err != nil || len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d (err: %v)", len(groups), err)
	}
	if groups[0].Name != "Collège C" || groups[1].Name != "Lycée A" {
		t.Fatalf("expected alphabetical order, got: %s, %s", groups[0].Name, groups[1].Name)
	}

	// 6. Create devices and assign to group
	d1, err := app.SaveDevice(models.Device{IP: "10.0.1.1", Hostname: "sw-lycee-1"})
	if err != nil {
		t.Fatalf("failed to create device: %v", err)
	}
	d2, err := app.SaveDevice(models.Device{IP: "10.0.1.2", Hostname: "sw-lycee-2"})
	if err != nil {
		t.Fatalf("failed to create device: %v", err)
	}
	d3, err := app.SaveDevice(models.Device{IP: "10.0.2.1", Hostname: "sw-unassigned"})
	if err != nil {
		t.Fatalf("failed to create device: %v", err)
	}

	// Devices initially have no group ("Non classés")
	var initialDev models.Device
	_ = db.DB.First(&initialDev, "id = ?", d1.ID)
	if initialDev.GroupID != "" || initialDev.GroupName != "" {
		t.Fatalf("expected unassigned initially, got group_id=%s, group_name=%s", initialDev.GroupID, initialDev.GroupName)
	}

	// Assign d1 and d2 to Lycée A
	if err := app.AssignDevicesToGroup([]string{d1.ID, d2.ID}, g1.ID); err != nil {
		t.Fatalf("failed to assign devices to group: %v", err)
	}

	_ = db.DB.First(&initialDev, "id = ?", d1.ID)
	if initialDev.GroupID != g1.ID || initialDev.GroupName != "Lycée A" {
		t.Fatalf("device assignment failed: %+v", initialDev)
	}

	// 7. Renaming group updates devices' GroupName
	g1.Name = "Lycée Victor Hugo"
	updatedG1, err := app.SaveDeviceGroup(*g1)
	if err != nil {
		t.Fatalf("failed to rename group: %v", err)
	}
	if updatedG1.Name != "Lycée Victor Hugo" {
		t.Fatalf("unexpected group name: %s", updatedG1.Name)
	}

	var devAfterRename models.Device
	_ = db.DB.First(&devAfterRename, "id = ?", d1.ID)
	if devAfterRename.GroupName != "Lycée Victor Hugo" {
		t.Fatalf("device group_name not updated on group rename: %+v", devAfterRename)
	}

	// 8. Move device to another group
	if err := app.AssignDevicesToGroup([]string{d2.ID}, g2.ID); err != nil {
		t.Fatalf("failed to move device: %v", err)
	}
	var devMoved models.Device
	_ = db.DB.First(&devMoved, "id = ?", d2.ID)
	if devMoved.GroupID != g2.ID || devMoved.GroupName != "Collège C" {
		t.Fatalf("device move failed: %+v", devMoved)
	}

	// 9. Unassign device (move to "none" / "Non classés")
	if err := app.AssignDevicesToGroup([]string{d2.ID}, ""); err != nil {
		t.Fatalf("failed to unassign device: %v", err)
	}
	_ = db.DB.First(&devMoved, "id = ?", d2.ID)
	if devMoved.GroupID != "" || devMoved.GroupName != "" {
		t.Fatalf("device unassignment failed: %+v", devMoved)
	}

	// 10. Deleting group resets devices in that group to "Non classés" (empty group_id and group_name)
	if err := app.DeleteDeviceGroup(g1.ID); err != nil {
		t.Fatalf("failed to delete group: %v", err)
	}
	var devAfterGroupDelete models.Device
	_ = db.DB.First(&devAfterGroupDelete, "id = ?", d1.ID)
	if devAfterGroupDelete.GroupID != "" || devAfterGroupDelete.GroupName != "" {
		t.Fatalf("device was not moved to unassigned on group deletion: %+v", devAfterGroupDelete)
	}

	// Make sure device d1 was NOT deleted
	if devAfterGroupDelete.IP != "10.0.1.1" {
		t.Fatalf("device itself should not be deleted: %+v", devAfterGroupDelete)
	}
	_ = d3
}

func TestImportPreservesAndRestoresGroups(t *testing.T) {
	app := setupTestApp(t)

	// Import devices with groups
	devices := []models.Device{
		{IP: "172.16.1.1", Hostname: "core-site1", GroupName: "Site Alpha", GroupID: "alpha-1"},
		{IP: "172.16.1.2", Hostname: "acc-site1", GroupName: "Site Alpha"},
		{IP: "172.16.2.1", Hostname: "core-site2"}, // no group -> Unassigned
	}

	imported, err := mergeImportedDevices(db.DB, devices)
	if err != nil {
		t.Fatalf("failed to merge imported devices: %v", err)
	}
	if imported != 3 {
		t.Fatalf("expected 3 imported devices, got %d", imported)
	}

	// Verify group "Site Alpha" was automatically created
	groups, err := app.GetDeviceGroups()
	if err != nil {
		t.Fatalf("error getting groups: %v", err)
	}
	if len(groups) != 1 || groups[0].Name != "Site Alpha" {
		t.Fatalf("expected 1 group 'Site Alpha', got: %+v", groups)
	}

	// Verify device group assignments
	var dev1, dev2, dev3 models.Device
	_ = db.DB.First(&dev1, "ip = ?", "172.16.1.1")
	_ = db.DB.First(&dev2, "ip = ?", "172.16.1.2")
	_ = db.DB.First(&dev3, "ip = ?", "172.16.2.1")

	if dev1.GroupName != "Site Alpha" || dev1.GroupID == "" {
		t.Fatalf("dev1 group not preserved: %+v", dev1)
	}
	if dev2.GroupName != "Site Alpha" || dev2.GroupID == "" {
		t.Fatalf("dev2 group not preserved: %+v", dev2)
	}
	if dev3.GroupName != "" || dev3.GroupID != "" {
		t.Fatalf("dev3 should be unassigned: %+v", dev3)
	}
}

func TestTaskCancellationManager(t *testing.T) {
	app := setupTestApp(t)

	// Initially nothing running
	if status := app.StopAllTasks(); status != "nothing_running" {
		t.Fatalf("expected nothing_running, got %s", status)
	}

	// Register multiple cancellable tasks
	pbCancelled := false
	_, pbCancel := context.WithCancel(context.Background())
	app.registerTaskCancel("playbook", func() {
		pbCancelled = true
		pbCancel()
	})

	backupCancelled := false
	_, bkCancel := context.WithCancel(context.Background())
	app.registerTaskCancel("backup", func() {
		backupCancelled = true
		bkCancel()
	})

	// Cancel only playbook: backup should NOT be cancelled
	if !app.CancelPlaybook() {
		t.Fatal("expected CancelPlaybook to return true")
	}
	if !pbCancelled {
		t.Fatal("playbook was not cancelled")
	}
	if backupCancelled {
		t.Fatal("backup should NOT have been cancelled when cancelling playbook")
	}

	// StopAllTasks cancels all remaining tasks (e.g. backup)
	status := app.StopAllTasks()
	if status != "stopped" {
		t.Fatalf("expected 'stopped', got '%s'", status)
	}
	if !backupCancelled {
		t.Fatal("backup was not cancelled by StopAllTasks")
	}

	// After stop, no tasks running
	if status := app.StopAllTasks(); status != "nothing_running" {
		t.Fatalf("expected nothing_running, got %s", status)
	}
}
