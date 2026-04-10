export interface FirewallAuditEntry {
  id: string
  timestamp: number
  session_id: string
  agent_id: string
  method: string
  verdict: string
  threat_level: string
  matched_patterns: string[]
  payload_hash: string
  payload_preview: string
}

export interface FirewallAuditResponse {
  entries: FirewallAuditEntry[]
  has_more: boolean
}

export interface FirewallTrace {
  id?: string
  trace_id?: string
  session_id?: string
  created_at?: string | number
  analysis?: {
    verdict?: string
    threat_level?: string
    score?: number
  }
}

export interface FirewallTraceListResponse {
  traces: FirewallTrace[]
  total: number
}

export interface FirewallDataset {
  id?: string
  name?: string
  description?: string
  is_public?: boolean
  traces?: string[]
  policies?: string[]
}

export interface FirewallDatasetListResponse {
  datasets: FirewallDataset[]
  total: number
}

export interface FirewallSkill {
  id: string
  name?: string
  description?: string
}

export interface FirewallSkillInput {
  id: string
  name?: string
  description?: string
}

export interface FirewallMcpServer {
  id: string
  name?: string
  transport?: string
  url?: string
}

export interface FirewallMcpServerInput {
  id: string
  name?: string
  transport?: string
  url?: string
}

export interface FirewallCustomConfigResponse {
  mcp_servers: FirewallMcpServer[]
  skills: FirewallSkill[]
}

export interface FirewallGatewayInfoResponse {
  configured: boolean
  port?: number
  configuredPort?: number
  bind?: string
  mode?: string
  configPath?: string
  token?: string
  hasPassword?: boolean
  allowedOrigins?: string[]
}

export interface FirewallMonitorBackendStatus {
  ok?: boolean
  status?: string
  service?: string
  lastChecked?: string
}

export interface FirewallMonitorGatewayStatus {
  configured?: boolean
  status?: string
  tokenValid?: boolean | null
  pairingRequired?: boolean
  message?: string
  port?: number
  configuredPort?: number
  effectivePort?: number
  bind?: string
  configPath?: string
  wsUrl?: string
  protocol?: number
  role?: string
  hasToken?: boolean
  hasPassword?: boolean
  lastChecked?: string
}

export interface FirewallMonitorStatusResponse {
  backend?: FirewallMonitorBackendStatus
  gateway?: FirewallMonitorGatewayStatus
}

export interface FirewallGatewayToolSummary {
  name: string
  description?: string
  source?: string
}

export interface FirewallSkillSummary {
  name: string
  description?: string
  emoji?: string
  bins?: string[]
  source?: string
}

export interface FirewallMcpToolsResponse {
  tools: Array<Record<string, unknown>>
  count: number
  gateway_tools: FirewallGatewayToolSummary[]
  skills: FirewallSkillSummary[]
}

export interface FirewallDashboardEvent {
  event_type?: string
  timestamp?: number
  session_id?: string
  method?: string
  payload_preview?: string
  verdict?: string
  is_alert?: boolean
  analysis?: {
    request_id?: string
    verdict?: string
    threat_level?: string
    score?: number
  }
}
