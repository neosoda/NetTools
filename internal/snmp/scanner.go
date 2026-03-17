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
	"1.3.6.1.2.1.1.1.0", // sysDescr
	"1.3.6.1.2.1.1.2.0", // sysObjectID
	"1.3.6.1.2.1.1.3.0", // sysUpTime
	"1.3.6.1.2.1.1.4.0", // sysContact
	"1.3.6.1.2.1.1.5.0", // sysName
	"1.3.6.1.2.1.1.6.0", // sysLocation
}

var oidNames = map[string]string{
	"1.3.6.1.2.1.1.1.0": "sysDescr",
	"1.3.6.1.2.1.1.2.0": "sysObjectID",
	"1.3.6.1.2.1.1.3.0": "sysUpTime",
	"1.3.6.1.2.1.1.4.0": "sysContact",
	"1.3.6.1.2.1.1.5.0": "sysName",
	"1.3.6.1.2.1.1.6.0": "sysLocation",
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

func probeIP(ctx context.Context, ip string, params ScanParams) ScanResult {
	result := ScanResult{IP: ip}

	timeout := params.Timeout
	if timeout == 0 {
		timeout = 3 * time.Second
	}

	var version gosnmp.SnmpVersion
	switch params.Version {
	case "v3":
		version = gosnmp.Version3
	default:
		version = gosnmp.Version2c
	}

	g := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      params.Port,
		Community: params.Community,
		Version:   version,
		Timeout:   timeout,
		Retries:   1,
		MaxOids:   gosnmp.MaxOids,
	}

	if params.Port == 0 {
		g.Port = 161
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
		result.Error = err
		return result
	}
	defer g.Conn.Close()

	oids, err := g.Get(DefaultOIDs)
	if err != nil {
		result.Error = err
		return result
	}

	// Check that at least one variable was returned with a real value
	hasData := false
	result.Data = make(map[string]string)
	for _, pdu := range oids.Variables {
		if pdu.Type == gosnmp.NoSuchObject || pdu.Type == gosnmp.NoSuchInstance || pdu.Type == gosnmp.Null {
			continue
		}
		// gosnmp prefixes OID names with a leading dot — strip it for lookup
		oidKey := strings.TrimPrefix(pdu.Name, ".")
		name := oidNames[oidKey]
		if name == "" {
			name = oidKey
		}
		val := fmt.Sprintf("%v", pdu.Value)
		// gosnmp returns byte slices for OctetString — convert to readable string
		if pdu.Type == gosnmp.OctetString {
			if b, ok := pdu.Value.([]byte); ok {
				val = string(b)
			}
		}
		result.Data[name] = val
		hasData = true
	}

	result.Reachable = hasData
	return result
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
