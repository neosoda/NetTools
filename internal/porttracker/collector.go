package porttracker

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"nettools/internal/snmp"
	"github.com/gosnmp/gosnmp"
)

// CollectDevicePorts collects interface data, FDB MACs, and LLDP for a device
func CollectDevicePorts(ip string, port uint16, community string, version string, v3 snmp.ScanParams) ([]RawPortData, error) {
	if port == 0 {
		port = 161
	}

	snmpVersion := gosnmp.Version2c
	if version == "v3" {
		snmpVersion = gosnmp.Version3
	} else if version == "v1" {
		snmpVersion = gosnmp.Version1
	}

	g := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      port,
		Community: community,
		Version:   snmpVersion,
		Timeout:   5 * time.Second,
		Retries:   2,
		MaxOids:   gosnmp.MaxOids,
	}

	if snmpVersion == gosnmp.Version3 {
		g.SecurityModel = gosnmp.UserSecurityModel
		g.MsgFlags = gosnmp.AuthPriv
		g.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 v3.Username,
			AuthenticationProtocol:   parseAuthProto(v3.AuthProto),
			AuthenticationPassphrase: v3.AuthKey,
			PrivacyProtocol:          parsePrivProto(v3.PrivProto),
			PrivacyPassphrase:        v3.PrivKey,
		}
	}

	if err := g.Connect(); err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer g.Conn.Close()

	portMap := make(map[int]*RawPortData)
	
	getPort := func(ifIndex int) *RawPortData {
		if p, ok := portMap[ifIndex]; ok {
			return p
		}
		p := &RawPortData{IfIndex: ifIndex, MACs: []string{}}
		portMap[ifIndex] = p
		return p
	}

	// 1. Walk IF-MIB
	oids := map[string]func(int, gosnmp.SnmpPDU){
		"1.3.6.1.2.1.31.1.1.1.1":  func(idx int, pdu gosnmp.SnmpPDU) { getPort(idx).IfName = pduToString(pdu) },
		"1.3.6.1.2.1.31.1.1.1.18": func(idx int, pdu gosnmp.SnmpPDU) { getPort(idx).IfAlias = pduToString(pdu) },
		"1.3.6.1.2.1.2.2.1.3":     func(idx int, pdu gosnmp.SnmpPDU) { getPort(idx).IfType = pduToInt(pdu) },
		"1.3.6.1.2.1.2.2.1.7":     func(idx int, pdu gosnmp.SnmpPDU) { getPort(idx).AdminStatus = pduToInt(pdu) },
		"1.3.6.1.2.1.2.2.1.8":     func(idx int, pdu gosnmp.SnmpPDU) { getPort(idx).OperStatus = pduToInt(pdu) },
		"1.3.6.1.2.1.31.1.1.1.15": func(idx int, pdu gosnmp.SnmpPDU) { getPort(idx).SpeedMbps = int64(pduToInt(pdu)) },
	}

	for baseOid, handler := range oids {
		_ = g.BulkWalk(baseOid, func(pdu gosnmp.SnmpPDU) error {
			suffix := strings.TrimPrefix(pdu.Name, "."+baseOid+".")
			idx, err := strconv.Atoi(suffix)
			if err == nil {
				handler(idx, pdu)
			}
			return nil
		})
	}

	// 2. Walk BRIDGE-MIB for FDB
	// dot1dBasePortIfIndex: maps bridge port -> ifIndex
	bPortToIfIndex := make(map[int]int)
	_ = g.BulkWalk("1.3.6.1.2.1.17.1.4.1.2", func(pdu gosnmp.SnmpPDU) error {
		suffix := strings.TrimPrefix(pdu.Name, ".1.3.6.1.2.1.17.1.4.1.2.")
		bPort, err := strconv.Atoi(suffix)
		if err == nil {
			bPortToIfIndex[bPort] = pduToInt(pdu)
		}
		return nil
	})

	// dot1dTpFdbPort: maps MAC -> bridge port
	_ = g.BulkWalk("1.3.6.1.2.1.17.4.3.1.2", func(pdu gosnmp.SnmpPDU) error {
		suffix := strings.TrimPrefix(pdu.Name, ".1.3.6.1.2.1.17.4.3.1.2.")
		// suffix is decimal MAC like 0.22.61.12.33.44
		macBytes := strings.Split(suffix, ".")
		if len(macBytes) == 6 {
			var b []byte
			for _, mb := range macBytes {
				val, _ := strconv.Atoi(mb)
				b = append(b, byte(val))
			}
			macStr := fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", b[0], b[1], b[2], b[3], b[4], b[5])
			bPort := pduToInt(pdu)
			ifIndex, ok := bPortToIfIndex[bPort]
			if ok {
				p := getPort(ifIndex)
				// check if already has it
				found := false
				for _, m := range p.MACs {
					if m == macStr {
						found = true
						break
					}
				}
				if !found {
					p.MACs = append(p.MACs, macStr)
				}
			}
		}
		return nil
	})

	// 3. LLDP
	lldpLinks, err := snmp.CollectLLDPNeighbors(ip, port, community, version, v3)
	if err == nil {
		for _, link := range lldpLinks {
			// Try to match LLDP LocalPortDesc to ifName if possible
			// If not, use LocalPortNum (sometimes it's the ifIndex, sometimes not)
			var matchedIdx = -1
			for idx, p := range portMap {
				if strings.EqualFold(p.IfName, link.LocalPortID) || strings.EqualFold(p.IfName, link.LocalPortDesc) {
					matchedIdx = idx
					break
				}
			}
			if matchedIdx == -1 {
				// Fallback to localPortNum matching ifIndex
				if _, ok := portMap[link.LocalPortNum]; ok {
					matchedIdx = link.LocalPortNum
				}
			}
			if matchedIdx != -1 {
				portMap[matchedIdx].HasLLDP = true
			}
		}
	}

	var results []RawPortData
	for _, p := range portMap {
		results = append(results, *p)
	}
	return results, nil
}

func parseAuthProto(proto string) gosnmp.SnmpV3AuthProtocol {
	switch proto {
	case "SHA": return gosnmp.SHA
	case "MD5": return gosnmp.MD5
	default: return gosnmp.SHA
	}
}

func parsePrivProto(proto string) gosnmp.SnmpV3PrivProtocol {
	switch proto {
	case "AES": return gosnmp.AES
	case "DES": return gosnmp.DES
	default: return gosnmp.AES
	}
}

func pduToString(pdu gosnmp.SnmpPDU) string {
	if pdu.Type == gosnmp.OctetString {
		if b, ok := pdu.Value.([]byte); ok {
			return string(b)
		}
	}
	return fmt.Sprintf("%v", pdu.Value)
}

func pduToInt(pdu gosnmp.SnmpPDU) int {
	return int(gosnmp.ToBigInt(pdu.Value).Int64())
}
