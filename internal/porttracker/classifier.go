package porttracker

import (
	"strings"
	"time"
	"nettools/internal/db/models"
)

func ClassifyPort(port *models.PortState, now time.Time) {
	// Base classification and confidence
	class := ClassUnknown
	confidence := 0

	// Check if it's a physical ethernet port (IfType == 6)
	isPhysical := port.IfType == 6

	// Check for infrastructure hints
	isInfra := port.HasLLDPNeighbor || isInfraString(port.IfName) || isInfraString(port.IfAlias)
	isReserved := isReservedString(port.IfAlias)
	hasSignificantAlias := port.IfAlias != "" && !isGenericAlias(port.IfAlias)

	daysSinceUp := -1
	if port.LastUpAt != nil {
		daysSinceUp = int(now.Sub(*port.LastUpAt).Hours() / 24)
	}
	daysSinceMAC := -1
	if port.LastMACSeenAt != nil {
		daysSinceMAC = int(now.Sub(*port.LastMACSeenAt).Hours() / 24)
	}
	daysSinceFirstSeen := int(now.Sub(port.FirstSeenAt).Hours() / 24)

	if isInfra {
		class = ClassInfrastructure
		confidence = 90
		if port.HasLLDPNeighbor {
			confidence = 100
		}
	} else if isReserved {
		class = ClassReserved
		confidence = 80
	} else if port.OperStatus == 1 {
		// UP
		class = ClassUsed
		confidence = 100
	} else {
		// DOWN
		if port.LastUpAt == nil {
			class = ClassNeverSeenUp
			// Confidence grows the longer we've observed it without it being UP
			if daysSinceFirstSeen > 30 {
				confidence = 80
			} else if daysSinceFirstSeen > 7 {
				confidence = 50
			} else {
				confidence = 20
			}
		} else {
			if daysSinceUp < ThresholdRecentDays {
				class = ClassInactive
				confidence = 80 // Recently used, highly confident it's just inactive temporarily
			} else if daysSinceUp < ThresholdInactiveDays {
				class = ClassInactive
				confidence = 60
			} else {
				// > 30 days DOWN
				if isPhysical && !hasSignificantAlias && (daysSinceMAC < 0 || daysSinceMAC >= ThresholdInactiveDays) {
					class = ClassProbablyFree
					// Base 70, +10 for no MAC ever, +10 for very old (e.g. > 90 days)
					confidence = 70
					if port.LastMAC == "" {
						confidence += 15
					}
					if daysSinceUp > 90 {
						confidence += 15
					}
				} else {
					class = ClassInactive
					// It's down for a long time but has a significant alias or recent MAC
					confidence = 50
				}
			}
		}
	}

	if confidence > 100 {
		confidence = 100
	}
	if confidence < 0 {
		confidence = 0
	}

	port.Classification = class
	port.Confidence = confidence
}

func isInfraString(s string) bool {
	upper := strings.ToUpper(s)
	keywords := []string{"UPLINK", "TRUNK", "LAG", "PORT-CHANNEL", "STACK", "FIREWALL", "ROUTEUR", "ROUTER", "INTER-SWITCH", "INTERSWITCH"}
	for _, kw := range keywords {
		if strings.Contains(upper, kw) {
			return true
		}
	}
	return false
}

func isReservedString(s string) bool {
	upper := strings.ToUpper(s)
	keywords := []string{"RESERVED", "RESERVE", "SPARE", "MAINTENANCE"}
	for _, kw := range keywords {
		if strings.Contains(upper, kw) {
			return true
		}
	}
	return false
}

func isGenericAlias(s string) bool {
	upper := strings.TrimSpace(strings.ToUpper(s))
	if upper == "" {
		return true
	}
	// Many vendors put default port names in alias if empty, or just generic things
	keywords := []string{"DEFAULT", "PORT", "INTERFACE", "ETHERNET", "UNASSIGNED", "UNUSED"}
	for _, kw := range keywords {
		if upper == kw {
			return true
		}
	}
	return false
}
