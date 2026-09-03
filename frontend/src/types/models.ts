export interface Device {
  id: string;
  ip: string;
  hostname?: string;
  vendor?: string;
  model?: string;
  os_version?: string;
  uptime_seconds?: number;
  mac_address?: string;
  location?: string;
}

export interface Credential {
  id: string;
  name: string;
  username?: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasSNMPCommunity: boolean;
  snmpVersion?: string;
  snmpAuthProtocol?: string;
  snmpPrivProtocol?: string;
  snmpUsername?: string;
}

export interface AuditResult {
  id: string;
  device_id: string;
  rule_id: string;
  rule_name: string;
  passed: boolean;
  details: string;
  severity: string;
  remediation?: string;
}

export interface Playbook {
  id: string;
  name: string;
  description?: string;
  content: string; // YAML
}

export interface PortState {
  id: string;
  device_id: string;
  if_index: number;
  if_name: string;
  if_alias: string;
  if_type: number;
  admin_status: number;
  oper_status: number;
  speed_mbps: number;
  first_seen_at: string;
  last_seen_at: string;
  last_up_at?: string;
  last_down_at?: string;
  last_status_change_at?: string;
  up_transitions: number;
  down_transitions: number;
  last_mac: string;
  last_mac_seen_at?: string;
  has_lldp_neighbor: boolean;
  classification: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

