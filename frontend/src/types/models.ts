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
  contact?: string;
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
  status: 'compliant' | 'non_compliant' | 'not_applicable' | 'indeterminate' | 'error';
  category?: string;
  expected?: string;
  risk?: string;
  details: string;
  evidence?: string;
  severity: string;
  remediation?: string;
}

export interface Playbook {
  id: string;
  name: string;
  description?: string;
  content: string; // YAML
}
