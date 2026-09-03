package porttracker

// Classification statuses
const (
	ClassUsed         = "USED"
	ClassInactive     = "INACTIVE"
	ClassNeverSeenUp  = "NEVER_SEEN_UP"
	ClassProbablyFree = "PROBABLY_FREE"
	ClassReserved     = "RESERVED"
	ClassInfrastructure = "INFRASTRUCTURE"
	ClassUnknown      = "UNKNOWN"
)

// Thresholds for classification
const (
	ThresholdRecentDays   = 7
	ThresholdInactiveDays = 30
)

// RawPortData represents the data collected from SNMP for a single port.
type RawPortData struct {
	IfIndex       int
	IfName        string
	IfAlias       string
	IfType        int
	AdminStatus   int // 1=up, 2=down, 3=testing
	OperStatus    int // 1=up, 2=down, ...
	SpeedMbps     int64
	HasLLDP       bool
	MACs          []string
}
