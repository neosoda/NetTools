package porttracker

import (
	"context"
	"fmt"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"
	"nettools/internal/logger"
	"nettools/internal/secret"
	"nettools/internal/snmp"
	"gorm.io/gorm"
	"github.com/google/uuid"
)

// RunScan orchestrates a full port tracking scan for all devices or specific devices
func RunScan(ctx context.Context, deviceIDs []string) error {
	var devices []models.Device
	query := db.DB.Model(&models.Device{})
	if len(deviceIDs) > 0 {
		query = query.Where("id IN ?", deviceIDs)
	}
	if err := query.Find(&devices).Error; err != nil {
		return err
	}

	for _, d := range devices {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			err := ScanDevice(d)
			if err != nil {
				logger.Error(fmt.Sprintf("PortTracker scan failed for device %s (IP: %s)", d.ID, d.IP), err)
			}
		}
	}
	return nil
}

// ScanDevice scans a single device and updates its port states
func ScanDevice(d models.Device) error {
	var cred models.Credential
	if d.CredentialID != "" {
		db.DB.First(&cred, "id = ?", d.CredentialID)
	}

	secMgr := secret.New()
	
	comm, _ := secMgr.Decrypt(cred.SNMPCommunityEnc)
	if comm == "" {
		comm = "public"
	}
	authKey, _ := secMgr.Decrypt(cred.SNMPAuthEnc)
	privKey, _ := secMgr.Decrypt(cred.SNMPPrivEnc)

	v3Params := snmp.ScanParams{
		Username:  cred.SNMPUsername,
		AuthProto: cred.SNMPAuthProtocol,
		AuthKey:   authKey,
		PrivProto: cred.SNMPPrivProtocol,
		PrivKey:   privKey,
	}

	version := d.SNMPVersion
	if version == "" {
		version = "v2c"
	}

	port := uint16(d.SNMPPort)
	if port == 0 {
		port = 161
	}

	rawPorts, err := CollectDevicePorts(d.IP, port, comm, version, v3Params)
	if err != nil {
		return fmt.Errorf("collect device ports: %w", err)
	}

	// Fetch sysUpTime to detect reboots
	devInfo, err := snmp.CollectDeviceInfo(d.IP, comm, version, port, 5*time.Second)
	var currentUptimeMs int64
	if err == nil && devInfo != nil {
		currentUptimeMs = devInfo.UptimeMs
	}

	now := time.Now()

	err = db.DB.Transaction(func(tx *gorm.DB) error {
		for _, rp := range rawPorts {
			// Find existing port
			var state models.PortState
			res := tx.Where("device_id = ? AND if_index = ?", d.ID, rp.IfIndex).First(&state)
			isNew := res.Error != nil

			if isNew {
				state = models.PortState{
					ID:              uuid.New().String(),
					DeviceID:        d.ID,
					IfIndex:         rp.IfIndex,
					FirstSeenAt:     now,
					CreatedAt:       now,
					UpTransitions:   0,
					DownTransitions: 0,
				}
			}

			// Update static/current fields
			state.IfName = rp.IfName
			state.IfAlias = rp.IfAlias
			state.IfType = rp.IfType
			state.AdminStatus = rp.AdminStatus
			state.SpeedMbps = rp.SpeedMbps
			state.HasLLDPNeighbor = rp.HasLLDP
			state.LastSeenAt = now

			// Reboot detection: if UptimeMs is less than d.UptimeSeconds * 1000, 
			// it probably rebooted. But we don't clear history anyway.
			
			// Transitions and LastUp/LastDown logic
			statusChanged := false
			if state.OperStatus != rp.OperStatus {
				statusChanged = true
				state.OperStatus = rp.OperStatus
				state.LastStatusChangeAt = &now

				if rp.OperStatus == 1 { // UP
					state.UpTransitions++
				} else if rp.OperStatus == 2 { // DOWN
					state.DownTransitions++
				}
			}

			if rp.OperStatus == 1 {
				state.LastUpAt = &now
			} else if rp.OperStatus == 2 {
				// Only update LastDownAt if it just went down or if we don't have one
				if statusChanged || state.LastDownAt == nil {
					state.LastDownAt = &now
				}
			}

			// MACs
			if len(rp.MACs) > 0 {
				state.LastMAC = rp.MACs[0] // take first MAC
				state.LastMACSeenAt = &now
			}

			// Classify
			ClassifyPort(&state, now)

			if isNew {
				if err := tx.Create(&state).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Save(&state).Error; err != nil {
					return err
				}
			}
		}
		
		// Update device Uptime
		if currentUptimeMs > 0 {
			tx.Model(&models.Device{}).Where("id = ?", d.ID).Update("uptime_seconds", currentUptimeMs/1000)
		}
		
		return nil
	})

	return err
}
