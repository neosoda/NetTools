package snmp

import (
	"context"
	"encoding/binary"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
)

// ScanParams defines the parameters for a network scan
type ScanParams struct {
	CIDR        string
	Community   string
	Version     string // "v2c" | "v3"
	Port        uint16
	Timeout     time.Duration
	Workers     int
	// SNMPv3 fields
	Username    string
	AuthProto   string
	AuthKey     string
	PrivProto   string
	PrivKey     string
}

// ScanResult holds the result for one IP
type ScanResult struct {
	IP       string
	Reachable bool
	Data     map[string]string // OID name -> value
	Error    error
}

// DefaultOIDs are the standard OIDs to collect during a scan
var DefaultOIDs = []string{
	"1.3.6.1.2.1.1.1.0",    // sysDescr
	"1.3.6.1.2.1.1.2.0",    // sysObjectID
	"1.3.6.1.2.1.1.3.0",    // sysUpTime
	"1.3.6.1.2.1.1.4.0",    // sysContact
	"1.3.6.1.2.1.1.5.0",    // sysName
	"1.3.6.1.2.1.1.6.0",    // sysLocation
	"1.3.6.1.2.1.17.1.1.0", // dot1dBaseBridgeAddress (MAC)
}

var oidNames = map[string]string{
	"1.3.6.1.2.1.1.1.0":    "sysDescr",
	"1.3.6.1.2.1.1.2.0":    "sysObjectID",
	"1.3.6.1.2.1.1.3.0":    "sysUpTime",
	"1.3.6.1.2.1.1.4.0":    "sysContact",
	"1.3.6.1.2.1.1.5.0":    "sysName",
	"1.3.6.1.2.1.1.6.0":    "sysLocation",
	"1.3.6.1.2.1.17.1.1.0": "sysMACAddress",
}

func Scan(ctx context.Context, params ScanParams, progressCb func(ip string, done, total int)) ([]ScanResult, error) {
	ips, err := cidrToIPs(params.CIDR)
	if err != nil {
		return nil, fmt.Errorf("invalid CIDR %s: %w", params.CIDR, err)
	}

	workers := params.Workers
	if workers <= 0 {
		workers = 50
	}
	if workers > 200 {
		workers = 200
	}

	jobs := make(chan string, len(ips))
	results := make(chan ScanResult, len(ips))

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ip := range jobs {
				select {
				case <-ctx.Done():
					return
				default:
					result := probeIP(ctx, ip, params)
					results <- result
				}
			}
		}()
	}

	for _, ip := range ips {
		jobs <- ip
	}
	close(jobs)

	go func() {
		wg.Wait()
		close(results)
	}()

	var allResults []ScanResult
	done := 0
	total := len(ips)
	for r := range results {
		done++
		if progressCb != nil {
			progressCb(r.IP, done, total)
		}
		allResults = append(allResults, r)
	}

	return allResults, nil
}

// snmpAttempt tries one SNMP GET against ip with the given community and version.
// Returns the parsed data map and whether any real data was returned.
func snmpAttempt(ip string, port uint16, community string, version gosnmp.SnmpVersion, timeout time.Duration, params ScanParams) (map[string]string, error) {
	g := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      port,
		Community: community,
		Version:   version,
		Timeout:   timeout,
		Retries:   0,
		MaxOids:   gosnmp.MaxOids,
	}

	if version == gosnmp.Version3 {
		g.SecurityModel = gosnmp.UserSecurityModel
		g.MsgFlags = gosnmp.AuthPriv
		g.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 params.Username,
			AuthenticationProtocol:   parseAuthProto(params.AuthProto),
			AuthenticationPassphrase: params.AuthKey,
			PrivacyProtocol:          parsePrivProto(params.PrivProto),
			PrivacyPassphrase:        params.PrivKey,
		}
	}

	if err := g.Connect(); err != nil {
		return nil, err
	}
	defer g.Conn.Close()

	oids, err := g.Get(DefaultOIDs)
	if err != nil {
		return nil, err
	}

	data := make(map[string]string)
	hasData := false
	for _, pdu := range oids.Variables {
		if pdu.Type == gosnmp.NoSuchObject || pdu.Type == gosnmp.NoSuchInstance || pdu.Type == gosnmp.Null {
			continue
		}
		oidKey := strings.TrimPrefix(pdu.Name, ".")
		name := oidNames[oidKey]
		if name == "" {
			name = oidKey
		}
		val := fmt.Sprintf("%v", pdu.Value)
		if pdu.Type == gosnmp.OctetString {
			if b, ok := pdu.Value.([]byte); ok {
				if name == "sysMACAddress" {
					val = formatMAC(b)
				} else {
					val = string(b)
				}
			}
		}
		data[name] = val
		hasData = true
	}

	if !hasData {
		return nil, fmt.Errorf("no data returned")
	}
	return data, nil
}

func probeIP(ctx context.Context, ip string, params ScanParams) ScanResult {
	result := ScanResult{IP: ip}

	timeout := params.Timeout
	if timeout == 0 {
		timeout = 3 * time.Second
	}
	port := params.Port
	if port == 0 {
		port = 161
	}

	// Strategy (mirrors the Python script):
	// 1. Try configured community with v2c
	// 2. Try configured community with v1
	// 3. Try "public" with v1
	type attempt struct {
		community string
		version   gosnmp.SnmpVersion
	}
	attempts := []attempt{
		{params.Community, gosnmp.Version2c},
		{params.Community, gosnmp.Version1},
	}
	if params.Community != "public" {
		attempts = append(attempts, attempt{"public", gosnmp.Version1})
	}

	// For SNMPv3, skip the community fallback chain
	if params.Version == "v3" {
		attempts = []attempt{{params.Community, gosnmp.Version3}}
	}

	var lastErr error
	for _, a := range attempts {
		data, err := snmpAttempt(ip, port, a.community, a.version, timeout, params)
		if err != nil {
			lastErr = err
			continue
		}
		result.Data = data
		result.Reachable = true
		// Record which community/version worked
		result.Data["_community"] = a.community
		if a.version == gosnmp.Version1 {
			result.Data["_version"] = "v1"
		} else {
			result.Data["_version"] = "v2c"
		}
		return result
	}

	result.Error = lastErr
	return result
}

// formatMAC converts a raw []byte MAC address to "aa:bb:cc:dd:ee:ff" form.
func formatMAC(b []byte) string {
	if len(b) < 6 {
		return fmt.Sprintf("%x", b)
	}
	return fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", b[0], b[1], b[2], b[3], b[4], b[5])
}

func parseAuthProto(proto string) gosnmp.SnmpV3AuthProtocol {
	switch proto {
	case "SHA":
		return gosnmp.SHA
	case "MD5":
		return gosnmp.MD5
	default:
		return gosnmp.SHA
	}
}

func parsePrivProto(proto string) gosnmp.SnmpV3PrivProtocol {
	switch proto {
	case "AES":
		return gosnmp.AES
	case "DES":
		return gosnmp.DES
	default:
		return gosnmp.AES
	}
}

func cidrToIPs(cidr string) ([]string, error) {
	// Handle single IP
	if !contains(cidr, '/') {
		return []string{cidr}, nil
	}

	ip, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, err
	}

	var ips []string
	for ip4 := ip.Mask(ipNet.Mask); ipNet.Contains(ip4); incrementIP(ip4) {
		// Skip network and broadcast for /24 and smaller
		ones, bits := ipNet.Mask.Size()
		if bits-ones <= 1 {
			ips = append(ips, ip4.String())
			continue
		}
		// Skip first (network) and last (broadcast)
		ipInt := binary.BigEndian.Uint32(ip4.To4())
		netInt := binary.BigEndian.Uint32(ipNet.IP.To4())
		mask := ^uint32(0) >> uint(ones)
		broadcast := netInt | mask
		if ipInt != netInt && ipInt != broadcast {
			ips = append(ips, ip4.String())
		}
	}
	return ips, nil
}

func incrementIP(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}

func contains(s string, c byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return true
		}
	}
	return false
}
