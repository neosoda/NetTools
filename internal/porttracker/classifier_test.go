package porttracker

import (
	"testing"
	"time"

	"nettools/internal/db/models"
)

func TestClassifyPort(t *testing.T) {
	now := time.Now()
	
	tests := []struct {
		name           string
		port           models.PortState
		expectedClass  string
		expectedMinConf int
	}{
		{
			name: "UP means USED",
			port: models.PortState{
				OperStatus: 1, // UP
			},
			expectedClass: ClassUsed,
			expectedMinConf: 100,
		},
		{
			name: "LLDP means INFRASTRUCTURE",
			port: models.PortState{
				OperStatus: 1,
				HasLLDPNeighbor: true,
			},
			expectedClass: ClassInfrastructure,
			expectedMinConf: 100,
		},
		{
			name: "Trunk alias means INFRASTRUCTURE",
			port: models.PortState{
				OperStatus: 2, // DOWN
				IfAlias: "UPLINK TO CORE",
			},
			expectedClass: ClassInfrastructure,
			expectedMinConf: 90,
		},
		{
			name: "Reserved alias means RESERVED",
			port: models.PortState{
				OperStatus: 2,
				IfAlias: "RESERVE",
			},
			expectedClass: ClassReserved,
			expectedMinConf: 80,
		},
		{
			name: "Never seen UP and seen recently",
			port: models.PortState{
				OperStatus: 2,
				FirstSeenAt: now.Add(-5 * 24 * time.Hour),
			},
			expectedClass: ClassNeverSeenUp,
			expectedMinConf: 10,
		},
		{
			name: "Never seen UP for 40 days",
			port: models.PortState{
				OperStatus: 2,
				FirstSeenAt: now.Add(-40 * 24 * time.Hour),
			},
			expectedClass: ClassNeverSeenUp,
			expectedMinConf: 70,
		},
		{
			name: "DOWN for 2 days",
			port: models.PortState{
				OperStatus: 2,
				LastUpAt: ptrTime(now.Add(-2 * 24 * time.Hour)),
			},
			expectedClass: ClassInactive,
			expectedMinConf: 70,
		},
		{
			name: "DOWN for 40 days, generic alias, physical port, no MAC",
			port: models.PortState{
				OperStatus: 2,
				IfType: 6,
				IfAlias: "UNUSED",
				LastUpAt: ptrTime(now.Add(-40 * 24 * time.Hour)),
			},
			expectedClass: ClassProbablyFree,
			expectedMinConf: 70,
		},
		{
			name: "DOWN for 40 days, physical port, recent MAC",
			port: models.PortState{
				OperStatus: 2,
				IfType: 6,
				IfAlias: "PORT",
				LastUpAt: ptrTime(now.Add(-40 * 24 * time.Hour)),
				LastMAC: "aa:bb:cc:dd:ee:ff",
				LastMACSeenAt: ptrTime(now.Add(-5 * 24 * time.Hour)),
			},
			expectedClass: ClassInactive,
			expectedMinConf: 40,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ClassifyPort(&tt.port, now)
			if tt.port.Classification != tt.expectedClass {
				t.Errorf("got classification %s, want %s", tt.port.Classification, tt.expectedClass)
			}
			if tt.port.Confidence < tt.expectedMinConf {
				t.Errorf("got confidence %d, want >= %d", tt.port.Confidence, tt.expectedMinConf)
			}
		})
	}
}

func ptrTime(t time.Time) *time.Time {
	return &t
}
