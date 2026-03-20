package topology

import (
	"fmt"
	"net"
	"strings"

	"networktools/internal/db"
	"networktools/internal/db/models"
)

// Node represents a device in the topology graph
type Node struct {
	ID       string     `json:"id"`
	Label    string     `json:"label"`
	IP       string     `json:"ip"`
	Vendor   string     `json:"vendor"`
	Model    string     `json:"model"`
	Hint     RenderHint `json:"hint"`
	Location string     `json:"location"`
	Status   string     `json:"status"` // "online"|"offline"|"unknown"
}

// Edge represents a connection between two nodes
type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"`
}

// Graph holds the full topology
type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// RenderHint provides rendering instructions for the topology UI
type RenderHint struct {
	TerminalColor string `json:"terminal_color"` // "green"|"blue"|"none"
	ShowPoEIcon   bool   `json:"show_poe_icon"`
	TerminalIndex int    `json:"terminal_index"` // 43=PoE, -1=classic
}

// GetRenderHint returns the visual rendering hint for a device model
func GetRenderHint(model string) RenderHint {
	upper := strings.ToUpper(model)
	switch {
	case matchAny(upper, "MPX", "GP", " PS", "PSM"):
		return RenderHint{TerminalColor: "green", ShowPoEIcon: true, TerminalIndex: 43}
	case matchAny(upper, " MX", "8000S", "GSX"):
		return RenderHint{TerminalColor: "blue", ShowPoEIcon: false, TerminalIndex: -1}
	case matchAny(upper, "EX1-1-1-CDR", "EX1-1-2"):
		return RenderHint{TerminalColor: "none", ShowPoEIcon: false, TerminalIndex: -1}
	case matchAny(upper, "EX1-2-3", "EX1-3-1"):
		return RenderHint{TerminalColor: "blue", ShowPoEIcon: true, TerminalIndex: 43}
	default:
		return RenderHint{TerminalColor: "blue", ShowPoEIcon: false, TerminalIndex: -1}
	}
}

func matchAny(s string, patterns ...string) bool {
	for _, p := range patterns {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

// Build constructs the topology graph from the device inventory
func Build() (*Graph, error) {
	var devices []models.Device
	if err := db.DB.Find(&devices).Error; err != nil {
		return nil, err
	}

	graph := &Graph{
		Nodes: make([]Node, 0, len(devices)),
		Edges: make([]Edge, 0),
	}

	for _, d := range devices {
		label := d.Hostname
		if label == "" {
			label = d.IP
		}
		node := Node{
			ID:       d.ID,
			Label:    label,
			IP:       d.IP,
			Vendor:   d.Vendor,
			Model:    d.Model,
			Hint:     GetRenderHint(d.Model),
			Location: d.Location,
			Status:   "unknown",
		}
		if d.LastSeenAt != nil {
			node.Status = "online"
		}
		graph.Nodes = append(graph.Nodes, node)
	}

	// Detect edges: devices sharing the same /24 subnet are considered linked
	graph.Edges = detectSubnetEdges(devices)

	return graph, nil
}

// detectSubnetEdges creates edges between devices on the same /24 subnet.
// This is a heuristic: devices on the same subnet are likely connected via the same switch/router.
func detectSubnetEdges(devices []models.Device) []Edge {
	type subnetGroup struct {
		subnet string
		ids    []string
	}

	subnets := make(map[string][]string) // /24 prefix -> device IDs
	for _, d := range devices {
		ip := net.ParseIP(d.IP)
		if ip == nil {
			continue
		}
		ip4 := ip.To4()
		if ip4 == nil {
			continue
		}
		prefix := fmt.Sprintf("%d.%d.%d.0/24", ip4[0], ip4[1], ip4[2])
		subnets[prefix] = append(subnets[prefix], d.ID)
	}

	var edges []Edge
	edgeID := 0
	for prefix, ids := range subnets {
		if len(ids) < 2 {
			continue
		}
		// Star topology: first device is the "hub", others connect to it
		hub := ids[0]
		for _, id := range ids[1:] {
			edgeID++
			edges = append(edges, Edge{
				ID:     fmt.Sprintf("e-%d", edgeID),
				Source: hub,
				Target: id,
				Label:  prefix,
			})
		}
	}
	return edges
}
