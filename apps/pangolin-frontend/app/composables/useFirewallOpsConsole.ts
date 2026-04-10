import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import type { InjectionKey } from 'vue'
import { firewallSupplementService, toErrorMessage } from '../services/firewallSupplementService'
import type {
  FirewallAuditEntry,
  FirewallDashboardEvent,
  FirewallDataset,
  FirewallGatewayInfoResponse,
  FirewallGatewayToolSummary,
  FirewallMcpServer,
  FirewallMcpServerInput,
  FirewallMonitorGatewayStatus,
  FirewallSkill,
  FirewallSkillSummary,
  FirewallSkillInput,
  FirewallTrace,
} from '../types/firewallSupplement'

export interface EscalationItem {
  requestId: string
  event: FirewallDashboardEvent
  verdict: string
}

export type DashboardViewMode = 'all' | 'alert' | 'escalate'
export type DashboardThreatFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'none'
export type EscalationThreatLevel = Exclude<DashboardThreatFilter, 'all'>
export type HumanActionType = 'allow' | 'block' | 'ack'
export type EscalationSortMode = 'risk' | 'newest' | 'oldest'

export interface DashboardFilterSnapshot {
  query: string
  viewMode: DashboardViewMode
  threatFilter: DashboardThreatFilter
  actionableOnly: boolean
  escalationSortMode: EscalationSortMode
  escalationSlaMinutes: number
}

export interface DashboardFilterPreset extends DashboardFilterSnapshot {
  id: string
  name: string
  updatedAt: number
}

interface DashboardPresetImportPayload {
  presets?: Array<Partial<DashboardFilterPreset>>
}

interface EscalationThreatSummary {
  critical: number
  high: number
  medium: number
  low: number
  none: number
}

export interface ActionHistoryItem {
  requestId: string
  action: HumanActionType
  timestamp: number
}

type ActionHistoryFilterType = 'all' | HumanActionType
type StaleEscalationLevel = 'all' | 'warning' | 'critical'
type EscalationSlaLevel = 'ok' | 'warning' | 'critical' | 'unknown'

type UnifiedTrafficSource = 'dashboard' | 'audit'
type UnifiedTrafficKind = 'mcp' | 'llm' | 'unknown'

interface UnifiedTrafficEntry {
  id: string
  source: UnifiedTrafficSource
  kind: UnifiedTrafficKind
  timestamp: number
  rawTimestamp?: number | string
  sessionId: string
  method: string
  requestId: string | null
  verdict: string
  threatLevel: string
  isAlert: boolean
  score: number | null
  payloadPreview: string | null
}

const HANDLED_REQUEST_STORAGE_KEY = 'pangolin.firewall.handled-requests.v1'
const DASHBOARD_FILTER_STORAGE_KEY = 'pangolin.firewall.dashboard-filters.v1'
const DASHBOARD_PRESET_STORAGE_KEY = 'pangolin.firewall.dashboard-presets.v1'
const ACTION_HISTORY_STORAGE_KEY = 'pangolin.firewall.action-history.v1'
const ACTION_HISTORY_LIMIT = 200
const ESCALATION_SLA_DEFAULT_MINUTES = 15
const ESCALATION_SLA_MIN_MINUTES = 1
const ESCALATION_SLA_MAX_MINUTES = 24 * 60

export function useFirewallOpsConsole() {
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)
  const operationError = ref<string | null>(null)
  const operationMessage = ref<string | null>(null)
  const lastUpdated = ref<Date | null>(null)

  const auditEntries = ref<FirewallAuditEntry[]>([])
  const traces = ref<FirewallTrace[]>([])
  const datasets = ref<FirewallDataset[]>([])
  const skills = ref<FirewallSkill[]>([])
  const mcpServers = ref<FirewallMcpServer[]>([])
  const gatewayInfo = ref<FirewallGatewayInfoResponse | null>(null)
  const gatewayMonitor = ref<FirewallMonitorGatewayStatus | null>(null)
  const gatewayToolsCatalog = ref<FirewallGatewayToolSummary[]>([])
  const gatewaySkillsCatalog = ref<FirewallSkillSummary[]>([])
  const gatewayManagementError = ref<string | null>(null)
  const gatewayRefreshLoading = ref(false)

  const dashboardConnected = ref(false)
  const dashboardError = ref<string | null>(null)
  const dashboardEvents = ref<FirewallDashboardEvent[]>([])
  let dashboardSocket: WebSocket | null = null
  const dashboardActionPendingId = ref<string | null>(null)
  const dashboardBatchActionPending = ref(false)
  const handledRequestIds = ref<string[]>([])
  const dashboardReconnectAttempts = ref(0)
  const dashboardReconnectDelaySeconds = ref<number | null>(null)
  const keepDashboardReconnect = ref(true)
  let dashboardReconnectTimer: ReturnType<typeof setTimeout> | null = null

  const savingSkill = ref(false)
  const deletingSkillId = ref<string | null>(null)
  const savingServer = ref(false)
  const deletingServerId = ref<string | null>(null)
  const streamPaused = ref(false)
  const dashboardViewMode = ref<DashboardViewMode>('all')
  const dashboardThreatFilter = ref<DashboardThreatFilter>('all')
  const dashboardActionableOnly = ref(false)
  const escalationSortMode = ref<EscalationSortMode>('risk')
  const escalationSlaMinutes = ref<number>(ESCALATION_SLA_DEFAULT_MINUTES)
  const dashboardQuery = ref('')
  const dashboardFilterPresets = ref<DashboardFilterPreset[]>([])
  const dashboardPresetName = ref('')
  const selectedDashboardPresetId = ref<string | null>(null)
  const dashboardPresetImportPending = ref(false)
  const actionHistory = ref<ActionHistoryItem[]>([])
  const actionHistoryQuery = ref('')
  const actionHistoryFilterType = ref<ActionHistoryFilterType>('all')
  const unifiedTrafficQuery = ref('')
  const unifiedTrafficSourceFilter = ref<'all' | UnifiedTrafficSource>('all')
  const unifiedTrafficKindFilter = ref<'all' | UnifiedTrafficKind>('all')
  const unifiedTrafficAlertsOnly = ref(false)

  const actionHistoryFilterOptions: Array<{ title: string; value: ActionHistoryFilterType }> = [
    { title: 'All Actions', value: 'all' },
    { title: 'ALLOW', value: 'allow' },
    { title: 'BLOCK', value: 'block' },
    { title: 'ACK', value: 'ack' },
  ]

  const dashboardThreatFilterOptions: Array<{ title: string; value: DashboardThreatFilter }> = [
    { title: 'All Threat Levels', value: 'all' },
    { title: 'Critical', value: 'critical' },
    { title: 'High', value: 'high' },
    { title: 'Medium', value: 'medium' },
    { title: 'Low', value: 'low' },
    { title: 'None', value: 'none' },
  ]

  const escalationSortModeOptions: Array<{ title: string; value: EscalationSortMode }> = [
    { title: 'Risk First', value: 'risk' },
    { title: 'Newest First', value: 'newest' },
    { title: 'Oldest First', value: 'oldest' },
  ]

  const unifiedTrafficSourceOptions: Array<{ title: string; value: 'all' | UnifiedTrafficSource }> = [
    { title: 'All Sources', value: 'all' },
    { title: 'Dashboard Stream', value: 'dashboard' },
    { title: 'Audit Log', value: 'audit' },
  ]

  const unifiedTrafficKindOptions: Array<{ title: string; value: 'all' | UnifiedTrafficKind }> = [
    { title: 'All Protocols', value: 'all' },
    { title: 'MCP', value: 'mcp' },
    { title: 'LLM', value: 'llm' },
    { title: 'Unknown', value: 'unknown' },
  ]

  const dashboardPresetOptions = computed(() => {
    return dashboardFilterPresets.value
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .map((preset) => ({
        title: preset.name,
        value: preset.id,
      }))
  })

  const newSkill = ref<FirewallSkillInput>({ id: '', name: '', description: '' })
  const newServer = ref<FirewallMcpServerInput>({ id: '', name: '', transport: 'sse', url: '' })
  const transportOptions = ['sse', 'stdio', 'http', 'websocket']

  const totalAudit = computed(() => auditEntries.value.length)
  const totalTraces = computed(() => traces.value.length)
  const totalDatasets = computed(() => datasets.value.length)
  const totalSkills = computed(() => skills.value.length)
  const totalServers = computed(() => mcpServers.value.length)
  const totalGatewayCatalogTools = computed(() => gatewayToolsCatalog.value.length)
  const totalGatewayCatalogSkills = computed(() => gatewaySkillsCatalog.value.length)
  const gatewayConfigured = computed(() => Boolean(gatewayInfo.value?.configured || gatewayMonitor.value?.configured))
  const gatewayEffectivePort = computed(() => {
    return gatewayMonitor.value?.effectivePort
      ?? gatewayInfo.value?.port
      ?? gatewayInfo.value?.configuredPort
      ?? gatewayMonitor.value?.configuredPort
      ?? null
  })
  const gatewayWsEndpoint = computed(() => cleanText(gatewayMonitor.value?.wsUrl))
  const gatewayMonitorStatus = computed(() => {
    if (gatewayMonitor.value?.status) {
      return gatewayMonitor.value.status
    }
    if (gatewayConfigured.value) {
      return 'configured'
    }
    return 'not_configured'
  })
  const gatewayMonitorMessage = computed(() => cleanText(gatewayMonitor.value?.message))
  const dashboardEventCount = computed(() => dashboardEvents.value.length)
  const normalizedDashboardQuery = computed(() => dashboardQuery.value.trim().toLowerCase())
  const hasActiveDashboardFilters = computed(() => {
    return (
      normalizedDashboardQuery.value.length > 0
      || dashboardViewMode.value !== 'all'
      || dashboardThreatFilter.value !== 'all'
      || dashboardActionableOnly.value
      || escalationSortMode.value !== 'risk'
      || escalationSlaMinutes.value !== ESCALATION_SLA_DEFAULT_MINUTES
    )
  })
  const activeDashboardFilterCount = computed(() => {
    let count = 0
    if (normalizedDashboardQuery.value.length > 0) {
      count += 1
    }
    if (dashboardViewMode.value !== 'all') {
      count += 1
    }
    if (dashboardThreatFilter.value !== 'all') {
      count += 1
    }
    if (dashboardActionableOnly.value) {
      count += 1
    }
    if (escalationSortMode.value !== 'risk') {
      count += 1
    }
    if (escalationSlaMinutes.value !== ESCALATION_SLA_DEFAULT_MINUTES) {
      count += 1
    }
    return count
  })
  const filteredDashboardEvents = computed(() => {
    const query = normalizedDashboardQuery.value
    const threatFilter = dashboardThreatFilter.value
    const modeFilteredEvents =
      dashboardViewMode.value === 'alert'
        ? dashboardEvents.value.filter((event) => event.is_alert)
        : dashboardViewMode.value === 'escalate'
          ? dashboardEvents.value.filter((event) => dashboardVerdict(event) === 'ESCALATE')
          : dashboardEvents.value

    const threatFilteredEvents = threatFilter === 'all'
      ? modeFilteredEvents
      : modeFilteredEvents.filter((event) => eventMatchesThreatFilter(event, threatFilter))

    const actionableFilteredEvents = dashboardActionableOnly.value
      ? threatFilteredEvents.filter((event) => canResolveEvent(event))
      : threatFilteredEvents

    if (!query) {
      return actionableFilteredEvents
    }

    return actionableFilteredEvents.filter((event) => eventMatchesQuery(event, query))
  })
  const recentDashboardEvents = computed(() => filteredDashboardEvents.value.slice(0, 12))
  const visibleDashboardEventCount = computed(() => filteredDashboardEvents.value.length)

  const escalationItems = computed<EscalationItem[]>(() => {
    const latestByRequest = new Map<string, EscalationItem>()
    for (const event of dashboardEvents.value) {
      const requestId = dashboardRequestId(event)
      if (!requestId || latestByRequest.has(requestId)) {
        continue
      }
      latestByRequest.set(requestId, {
        requestId,
        event,
        verdict: dashboardVerdict(event),
      })
    }
    return Array.from(latestByRequest.values())
  })

  const pendingEscalations = computed(() => {
    const filtered = escalationItems.value.filter(
      (item) => item.verdict === 'ESCALATE' && !handledRequestIds.value.includes(item.requestId),
    )

    const sortMode = escalationSortMode.value
    if (sortMode === 'newest') {
      return filtered.toSorted((left, right) => dashboardEventTimestamp(right.event) - dashboardEventTimestamp(left.event))
    }

    if (sortMode === 'oldest') {
      return filtered.toSorted((left, right) => dashboardEventTimestamp(left.event) - dashboardEventTimestamp(right.event))
    }

    return filtered.toSorted((left, right) => {
      const threatDelta = threatRank(dashboardThreat(right.event)) - threatRank(dashboardThreat(left.event))
      if (threatDelta !== 0) {
        return threatDelta
      }
      return dashboardEventTimestamp(right.event) - dashboardEventTimestamp(left.event)
    })
  })

  const totalPendingEscalations = computed(() => pendingEscalations.value.length)
  const visiblePendingEscalations = computed(() => {
    const query = normalizedDashboardQuery.value
    const threatFilter = dashboardThreatFilter.value
    const threatFilteredEscalations = threatFilter === 'all'
      ? pendingEscalations.value
      : pendingEscalations.value.filter((item) => eventMatchesThreatFilter(item.event, threatFilter))

    if (!query) {
      return threatFilteredEscalations
    }
    return threatFilteredEscalations.filter((item) => escalationMatchesQuery(item, query))
  })
  const visiblePendingEscalationCount = computed(() => visiblePendingEscalations.value.length)
  const escalationSlaSeconds = computed(() => escalationSlaMinutes.value * 60)
  const visibleEscalationThreatSummary = computed<EscalationThreatSummary>(() => {
    const summary: EscalationThreatSummary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    }

    for (const item of visiblePendingEscalations.value) {
      const threat = dashboardThreat(item.event).toLowerCase()
      if (threat === 'critical') {
        summary.critical += 1
      } else if (threat === 'high') {
        summary.high += 1
      } else if (threat === 'medium') {
        summary.medium += 1
      } else if (threat === 'low') {
        summary.low += 1
      } else {
        summary.none += 1
      }
    }

    return summary
  })
  const oldestVisibleEscalationAgeSeconds = computed<number | null>(() => {
    let maxAge: number | null = null
    const nowSeconds = Date.now() / 1000

    for (const item of visiblePendingEscalations.value) {
      const timestamp = dashboardEventTimestamp(item.event)
      if (timestamp <= 0) {
        continue
      }
      const age = Math.max(0, nowSeconds - timestamp)
      if (maxAge == null || age > maxAge) {
        maxAge = age
      }
    }

    return maxAge
  })
  const oldestVisibleEscalationAgeLabel = computed(() => {
    const seconds = oldestVisibleEscalationAgeSeconds.value
    if (seconds == null) {
      return 'n/a'
    }
    return formatDurationSeconds(seconds)
  })
  const staleVisibleEscalationCount = computed(() => {
    const threshold = escalationSlaSeconds.value
    let staleCount = 0
    const nowSeconds = Date.now() / 1000

    for (const item of visiblePendingEscalations.value) {
      const age = escalationAgeSeconds(item, nowSeconds)
      if (age == null) {
        continue
      }
      if (age >= threshold) {
        staleCount += 1
      }
    }

    return staleCount
  })
  const staleCriticalVisibleEscalationCount = computed(() => {
    const criticalThreshold = escalationSlaSeconds.value * 2
    let count = 0
    const nowSeconds = Date.now() / 1000

    for (const item of visiblePendingEscalations.value) {
      const age = escalationAgeSeconds(item, nowSeconds)
      if (age != null && age >= criticalThreshold) {
        count += 1
      }
    }

    return count
  })
  const staleWarningVisibleEscalationCount = computed(() => {
    return Math.max(0, staleVisibleEscalationCount.value - staleCriticalVisibleEscalationCount.value)
  })
  const hasVisibleEscalationSlaBreach = computed(() => staleVisibleEscalationCount.value > 0)
  const actionHistoryCount = computed(() => actionHistory.value.length)
  const normalizedActionHistoryQuery = computed(() => actionHistoryQuery.value.trim().toLowerCase())
  const hasActionHistoryFilters = computed(() => {
    return normalizedActionHistoryQuery.value.length > 0 || actionHistoryFilterType.value !== 'all'
  })
  const filteredActionHistory = computed(() => {
    const query = normalizedActionHistoryQuery.value
    const typeFilter = actionHistoryFilterType.value

    return actionHistory.value.filter((item) => {
      const typeMatch = typeFilter === 'all' || item.action === typeFilter
      if (!typeMatch) {
        return false
      }
      if (!query) {
        return true
      }
      return item.requestId.toLowerCase().includes(query)
    })
  })
  const visibleActionHistoryCount = computed(() => filteredActionHistory.value.length)
  const canUndoAction = computed(() => actionHistory.value.length > 0)
  const recentActionHistory = computed(() => filteredActionHistory.value.slice(0, 12))
  const normalizedUnifiedTrafficQuery = computed(() => unifiedTrafficQuery.value.trim().toLowerCase())
  const unifiedTrafficEntries = computed<UnifiedTrafficEntry[]>(() => {
    const dashboardRows = dashboardEvents.value.map((event, index) => {
      const method = dashboardMethod(event)
      const verdict = dashboardVerdict(event)
      const threatLevel = dashboardThreat(event)
      const timestamp = dashboardEventTimestamp(event)
      const requestId = dashboardRequestId(event)

      return {
        id: `dashboard-${requestId ?? event.session_id ?? index}-${timestamp}-${index}`,
        source: 'dashboard',
        kind: inferTrafficKind(method),
        timestamp,
        rawTimestamp: event.timestamp,
        sessionId: String(event.session_id ?? 'n/a'),
        method,
        requestId,
        verdict,
        threatLevel,
        isAlert: event.is_alert === true || verdict === 'ESCALATE' || verdict === 'BLOCK',
        score: typeof event.analysis?.score === 'number' ? event.analysis.score : null,
        payloadPreview: cleanText(event.payload_preview) ?? null,
      }
    })

    const auditRows = auditEntries.value.map((entry, index) => {
      const method = String(entry.method || 'event')
      const verdict = String(entry.verdict || 'UNKNOWN').toUpperCase()
      const threatLevel = String(entry.threat_level || 'NONE').toUpperCase()
      const timestamp = normalizeTimestampSeconds(entry.timestamp)

      return {
        id: `audit-${entry.id || index}-${timestamp}-${index}`,
        source: 'audit',
        kind: inferTrafficKind(method),
        timestamp,
        rawTimestamp: entry.timestamp,
        sessionId: String(entry.session_id || 'n/a'),
        method,
        requestId: null,
        verdict,
        threatLevel,
        isAlert: verdict === 'ESCALATE' || verdict === 'BLOCK' || threatLevel === 'CRITICAL' || threatLevel === 'HIGH',
        score: null,
        payloadPreview: cleanText(entry.payload_preview) ?? null,
      }
    })

    return [...dashboardRows, ...auditRows].toSorted((left, right) => right.timestamp - left.timestamp)
  })
  const hasUnifiedTrafficFilters = computed(() => {
    return (
      normalizedUnifiedTrafficQuery.value.length > 0
      || unifiedTrafficSourceFilter.value !== 'all'
      || unifiedTrafficKindFilter.value !== 'all'
      || unifiedTrafficAlertsOnly.value
    )
  })
  const filteredUnifiedTrafficEntries = computed(() => {
    const query = normalizedUnifiedTrafficQuery.value

    return unifiedTrafficEntries.value.filter((entry) => {
      if (unifiedTrafficSourceFilter.value !== 'all' && entry.source !== unifiedTrafficSourceFilter.value) {
        return false
      }
      if (unifiedTrafficKindFilter.value !== 'all' && entry.kind !== unifiedTrafficKindFilter.value) {
        return false
      }
      if (unifiedTrafficAlertsOnly.value && !entry.isAlert) {
        return false
      }
      if (!query) {
        return true
      }

      return (
        entry.method.toLowerCase().includes(query)
        || entry.verdict.toLowerCase().includes(query)
        || entry.threatLevel.toLowerCase().includes(query)
        || entry.sessionId.toLowerCase().includes(query)
        || String(entry.requestId ?? '').toLowerCase().includes(query)
      )
    })
  })
  const visibleUnifiedTrafficCount = computed(() => filteredUnifiedTrafficEntries.value.length)
  const recentUnifiedTrafficEntries = computed(() => filteredUnifiedTrafficEntries.value.slice(0, 40))

  const canAddSkill = computed(() => newSkill.value.id.trim().length > 0)
  const canAddServer = computed(() => newServer.value.id.trim().length > 0)
  const canSaveDashboardPreset = computed(() => dashboardPresetName.value.trim().length > 0)
  const selectedDashboardPreset = computed(() => {
    const presetId = selectedDashboardPresetId.value
    if (!presetId) {
      return null
    }
    return dashboardFilterPresets.value.find((item) => item.id === presetId) ?? null
  })
  const selectedDashboardPresetDirty = computed(() => {
    const preset = selectedDashboardPreset.value
    if (!preset) {
      return false
    }
    const snapshot = getDashboardFilterSnapshot()
    return (
      snapshot.query !== preset.query
      || snapshot.viewMode !== preset.viewMode
      || snapshot.threatFilter !== preset.threatFilter
      || snapshot.actionableOnly !== preset.actionableOnly
      || snapshot.escalationSortMode !== preset.escalationSortMode
      || snapshot.escalationSlaMinutes !== preset.escalationSlaMinutes
    )
  })
  const canUpdateSelectedDashboardPreset = computed(() => selectedDashboardPresetDirty.value)

  function verdictColor(verdict?: string): string {
    switch ((verdict ?? '').toUpperCase()) {
      case 'BLOCK':
        return 'error'
      case 'ESCALATE':
        return 'warning'
      case 'ALLOW':
        return 'success'
      default:
        return 'grey'
    }
  }

  function threatColor(level?: string): string {
    switch ((level ?? '').toUpperCase()) {
      case 'CRITICAL':
        return 'error'
      case 'HIGH':
        return 'warning'
      case 'MEDIUM':
        return 'info'
      case 'LOW':
        return 'secondary'
      default:
        return 'grey'
    }
  }

  function gatewayStatusColor(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'ok':
        return 'success'
      case 'pairing_required':
      case 'timeout':
        return 'warning'
      case 'not_configured':
      case 'missing_token':
        return 'grey'
      case 'invalid_token':
      case 'rejected':
      case 'unreachable':
        return 'error'
      default:
        return gatewayConfigured.value ? 'primary' : 'grey'
    }
  }

  function gatewayStatusLabel(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'ok':
        return 'Connected'
      case 'pairing_required':
        return 'Pairing Required'
      case 'missing_token':
        return 'Missing Token'
      case 'invalid_token':
        return 'Invalid Token'
      case 'rejected':
        return 'Rejected'
      case 'unreachable':
        return 'Unreachable'
      case 'timeout':
        return 'Timeout'
      case 'not_configured':
        return 'Not Configured'
      default:
        return status ? status.toUpperCase() : 'Unknown'
    }
  }

  function normalizeTimestampSeconds(timestamp?: number | string): number {
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      if (timestamp > 10 ** 12) {
        return timestamp / 1000
      }
      return timestamp
    }

    if (typeof timestamp === 'string') {
      const parsed = Date.parse(timestamp)
      if (!Number.isNaN(parsed)) {
        return parsed / 1000
      }
    }

    return 0
  }

  function formatTimestamp(timestamp?: number | string): string {
    if (timestamp == null) {return 'n/a'}

    const epochSeconds = normalizeTimestampSeconds(timestamp)
    if (epochSeconds <= 0) {return String(timestamp)}

    const value = epochSeconds * 1000
    if (Number.isNaN(value)) {return String(timestamp)}

    return new Date(value).toLocaleString()
  }

  function formatDurationSeconds(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds))
    if (safeSeconds < 60) {
      return `${safeSeconds}s`
    }

    const minutes = Math.floor(safeSeconds / 60)
    const remainSeconds = safeSeconds % 60
    if (minutes < 60) {
      return remainSeconds > 0 ? `${minutes}m ${remainSeconds}s` : `${minutes}m`
    }

    const hours = Math.floor(minutes / 60)
    const remainMinutes = minutes % 60
    if (hours < 24) {
      return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`
    }

    const days = Math.floor(hours / 24)
    const remainHours = hours % 24
    return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
  }

  function escalationAgeSeconds(item: EscalationItem, nowSeconds = Date.now() / 1000): number | null {
    const timestamp = dashboardEventTimestamp(item.event)
    if (timestamp <= 0) {
      return null
    }
    return Math.max(0, nowSeconds - timestamp)
  }

  function escalationAgeLabel(item: EscalationItem): string {
    const age = escalationAgeSeconds(item)
    if (age == null) {
      return 'n/a'
    }
    return formatDurationSeconds(age)
  }

  function escalationSlaLevel(item: EscalationItem, nowSeconds = Date.now() / 1000): EscalationSlaLevel {
    const age = escalationAgeSeconds(item, nowSeconds)
    if (age == null) {
      return 'unknown'
    }

    const warningThreshold = escalationSlaSeconds.value
    const criticalThreshold = warningThreshold * 2
    if (age >= criticalThreshold) {
      return 'critical'
    }
    if (age >= warningThreshold) {
      return 'warning'
    }
    return 'ok'
  }

  function staleEscalationLevelLabel(level: StaleEscalationLevel): string {
    if (level === 'critical') {
      return 'critical stale'
    }
    if (level === 'warning') {
      return 'warning stale'
    }
    return 'stale'
  }

  function traceIdentifier(trace: FirewallTrace): string {
    return trace.id ?? trace.trace_id ?? trace.session_id ?? 'unknown'
  }

  function traceCreatedAt(trace: FirewallTrace): string {
    return formatTimestamp(trace.created_at)
  }

  function skillLabel(skill: FirewallSkill): string {
    return skill.name ?? skill.id
  }

  function serverLabel(server: FirewallMcpServer): string {
    return server.name ?? server.id
  }

  function inferTrafficKind(method: string): UnifiedTrafficKind {
    const normalized = method.toLowerCase()
    if (
      normalized.includes('mcp')
      || normalized.includes('tool')
      || normalized.includes('skill')
      || normalized.includes('agent/')
    ) {
      return 'mcp'
    }
    if (
      normalized.includes('chat')
      || normalized.includes('completion')
      || normalized.includes('response')
      || normalized.includes('llm')
      || normalized.includes('openai')
    ) {
      return 'llm'
    }
    return 'unknown'
  }

  function unifiedTrafficSourceLabel(source: UnifiedTrafficSource): string {
    if (source === 'dashboard') {
      return 'Dashboard'
    }
    return 'Audit'
  }

  function unifiedTrafficSourceColor(source: UnifiedTrafficSource): string {
    if (source === 'dashboard') {
      return 'primary'
    }
    return 'secondary'
  }

  function unifiedTrafficKindLabel(kind: UnifiedTrafficKind): string {
    if (kind === 'mcp') {
      return 'MCP'
    }
    if (kind === 'llm') {
      return 'LLM'
    }
    return 'UNKNOWN'
  }

  function unifiedTrafficKindColor(kind: UnifiedTrafficKind): string {
    if (kind === 'mcp') {
      return 'info'
    }
    if (kind === 'llm') {
      return 'warning'
    }
    return 'grey'
  }

  function clearUnifiedTrafficFilters(): void {
    unifiedTrafficQuery.value = ''
    unifiedTrafficSourceFilter.value = 'all'
    unifiedTrafficKindFilter.value = 'all'
    unifiedTrafficAlertsOnly.value = false
  }

  function scrollToSection(sectionId: string): void {
    if (!import.meta.client) {
      return
    }

    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function focusEscalationQueueByRequest(requestId: string | null, sessionId?: string | null): void {
    clearOperationFeedback()

    const query = cleanText(requestId ?? undefined) ?? cleanText(sessionId ?? undefined)
    if (!query) {
      operationError.value = 'Cannot locate queue item without request_id or session_id'
      return
    }

    dashboardQuery.value = query
    dashboardViewMode.value = 'escalate'
    dashboardActionableOnly.value = false
    scrollToSection('mcp-escalation-queue-card')
    operationMessage.value = `Focused escalation queue on ${query}`
  }

  function focusActionHistoryByRequestId(requestId: string | null): void {
    clearOperationFeedback()

    const query = cleanText(requestId ?? undefined)
    if (!query) {
      operationError.value = 'Cannot locate action history without request_id'
      return
    }

    actionHistoryQuery.value = query
    actionHistoryFilterType.value = 'all'
    scrollToSection('mcp-action-history-card')
    operationMessage.value = `Focused action history on ${query}`
  }

  function focusUnifiedTrafficByRequestId(requestId: string, alertsOnly = false): void {
    const normalized = requestId.trim()
    if (!normalized) {
      return
    }

    unifiedTrafficQuery.value = normalized
    unifiedTrafficSourceFilter.value = 'all'
    unifiedTrafficKindFilter.value = 'all'
    unifiedTrafficAlertsOnly.value = alertsOnly
    operationMessage.value = `Focused unified feed on ${normalized}`
  }

  function applyUnifiedTrafficEntryToDashboard(entry: UnifiedTrafficEntry): void {
    clearOperationFeedback()

    const queryCandidate = entry.requestId ?? entry.sessionId
    const query = queryCandidate && queryCandidate !== 'n/a' ? queryCandidate : entry.method
    dashboardQuery.value = query

    if (entry.verdict === 'ESCALATE') {
      dashboardViewMode.value = 'escalate'
      dashboardActionableOnly.value = true
    } else if (entry.isAlert) {
      dashboardViewMode.value = 'alert'
      dashboardActionableOnly.value = false
    } else {
      dashboardViewMode.value = 'all'
      dashboardActionableOnly.value = false
    }

    const threat = entry.threatLevel.toLowerCase()
    if (threat === 'critical' || threat === 'high' || threat === 'medium' || threat === 'low' || threat === 'none') {
      dashboardThreatFilter.value = threat
    } else {
      dashboardThreatFilter.value = 'all'
    }

    operationMessage.value = `Applied triage context from ${unifiedTrafficSourceLabel(entry.source)} entry`
  }

  function dashboardVerdict(event: FirewallDashboardEvent): string {
    return String(event.analysis?.verdict ?? event.verdict ?? 'UNKNOWN').toUpperCase()
  }

  function dashboardThreat(event: FirewallDashboardEvent): string {
    return String(event.analysis?.threat_level ?? 'NONE').toUpperCase()
  }

  function dashboardMethod(event: FirewallDashboardEvent): string {
    return event.method ?? event.event_type ?? 'event'
  }

  function dashboardRequestId(event: FirewallDashboardEvent): string | null {
    const requestId = cleanText(event.analysis?.request_id)
    return requestId ?? null
  }

  function canResolveEvent(event: FirewallDashboardEvent): boolean {
    return dashboardVerdict(event) === 'ESCALATE' && dashboardRequestId(event) != null
  }

  function includesQuery(value: string | null | undefined, query: string): boolean {
    return String(value ?? '').toLowerCase().includes(query)
  }

  function eventMatchesQuery(event: FirewallDashboardEvent, query: string): boolean {
    return (
      includesQuery(dashboardRequestId(event), query)
      || includesQuery(dashboardMethod(event), query)
      || includesQuery(dashboardVerdict(event), query)
      || includesQuery(dashboardThreat(event), query)
      || includesQuery(event.session_id, query)
    )
  }

  function escalationMatchesQuery(item: EscalationItem, query: string): boolean {
    return includesQuery(item.requestId, query) || eventMatchesQuery(item.event, query)
  }

  function eventMatchesThreatFilter(event: FirewallDashboardEvent, filter: DashboardThreatFilter): boolean {
    if (filter === 'all') {
      return true
    }
    return dashboardThreat(event).toLowerCase() === filter
  }

  function isEscalationThreatLevel(value: string): value is EscalationThreatLevel {
    return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' || value === 'none'
  }

  function normalizeEscalationSlaMinutes(value: unknown): number {
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN
    if (!Number.isFinite(numeric)) {
      return ESCALATION_SLA_DEFAULT_MINUTES
    }

    const clamped = Math.round(Math.min(ESCALATION_SLA_MAX_MINUTES, Math.max(ESCALATION_SLA_MIN_MINUTES, numeric)))
    return clamped
  }

  function formatThreatLevelsLabel(levels: EscalationThreatLevel[]): string {
    const order: EscalationThreatLevel[] = ['critical', 'high', 'medium', 'low', 'none']
    const unique = new Set(Array.from(new Set(levels)))
    const sorted = order.filter((level) => unique.has(level))
    if (sorted.length === 0) {
      return 'selected'
    }
    if (sorted.length === 1) {
      return sorted[0].toUpperCase()
    }
    return sorted.map((level) => level.toUpperCase()).join('/')
  }

  function clearOperationFeedback(): void {
    operationError.value = null
    operationMessage.value = null
  }

  function getDashboardFilterSnapshot(): DashboardFilterSnapshot {
    return {
      query: dashboardQuery.value,
      viewMode: dashboardViewMode.value,
      threatFilter: dashboardThreatFilter.value,
      actionableOnly: dashboardActionableOnly.value,
      escalationSortMode: escalationSortMode.value,
      escalationSlaMinutes: escalationSlaMinutes.value,
    }
  }

  function applyDashboardFilterSnapshot(snapshot: DashboardFilterSnapshot): void {
    dashboardQuery.value = snapshot.query
    dashboardViewMode.value = snapshot.viewMode
    dashboardThreatFilter.value = snapshot.threatFilter
    dashboardActionableOnly.value = snapshot.actionableOnly
    escalationSortMode.value = snapshot.escalationSortMode
    escalationSlaMinutes.value = normalizeEscalationSlaMinutes(snapshot.escalationSlaMinutes)
  }

  function dashboardEventTimestamp(event: FirewallDashboardEvent): number {
    return normalizeTimestampSeconds(event.timestamp)
  }

  function threatRank(level: string): number {
    const rank: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
      NONE: 0,
    }
    return rank[level] ?? 0
  }

  function actionLabel(action: HumanActionType): string {
    if (action === 'allow') {return 'ALLOW'}
    if (action === 'block') {return 'BLOCK'}
    return 'ACK'
  }

  function actionColor(action: HumanActionType): string {
    if (action === 'allow') {return 'success'}
    if (action === 'block') {return 'error'}
    return 'grey'
  }

  function pushActionHistory(action: HumanActionType, requestId: string): void {
    actionHistory.value = [{ action, requestId, timestamp: Date.now() / 1000 }, ...actionHistory.value].slice(0, ACTION_HISTORY_LIMIT)
  }

  function loadActionHistoryFromStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      const raw = localStorage.getItem(ACTION_HISTORY_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return
      }

      const normalized: ActionHistoryItem[] = []
      for (const item of parsed) {
        if (!item || typeof item !== 'object') {
          continue
        }

        const requestId = cleanText((item as { requestId?: string }).requestId)
        if (!requestId) {
          continue
        }

        const action = (item as { action?: unknown }).action
        if (action !== 'allow' && action !== 'block' && action !== 'ack') {
          continue
        }

        const timestampRaw = (item as { timestamp?: unknown }).timestamp
        const timestamp =
          typeof timestampRaw === 'number' && Number.isFinite(timestampRaw)
            ? timestampRaw
            : Date.now() / 1000

        normalized.push({
          requestId,
          action,
          timestamp,
        })
      }

      actionHistory.value = normalized.slice(0, ACTION_HISTORY_LIMIT)
    } catch {
      // Ignore local storage parsing failures.
    }
  }

  function persistActionHistoryToStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      localStorage.setItem(ACTION_HISTORY_STORAGE_KEY, JSON.stringify(actionHistory.value.slice(0, ACTION_HISTORY_LIMIT)))
    } catch {
      // Ignore storage quota errors.
    }
  }

  function undoLastAction(): void {
    clearOperationFeedback()

    const [latest, ...rest] = actionHistory.value
    if (!latest) {
      operationMessage.value = 'No actions to undo'
      return
    }

    actionHistory.value = rest

    const stillHandledInHistory = rest.some((item) => item.requestId === latest.requestId)
    if (!stillHandledInHistory) {
      handledRequestIds.value = handledRequestIds.value.filter((id) => id !== latest.requestId)
    }

    operationMessage.value = `Undid ${actionLabel(latest.action)} for ${latest.requestId}`
  }

  function clearActionHistory(): void {
    clearOperationFeedback()

    if (actionHistory.value.length === 0) {
      operationMessage.value = 'Action history is already empty'
      return
    }

    actionHistory.value = []
    operationMessage.value = 'Cleared action history'
  }

  function clearActionHistoryFilters(): void {
    actionHistoryQuery.value = ''
    actionHistoryFilterType.value = 'all'
  }

  function loadHandledRequestIdsFromStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      const raw = localStorage.getItem(HANDLED_REQUEST_STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        handledRequestIds.value = parsed.filter((value): value is string => typeof value === 'string').slice(0, 200)
      }
    } catch {
      // Ignore local storage parsing failures.
    }
  }

  function persistHandledRequestIdsToStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      localStorage.setItem(HANDLED_REQUEST_STORAGE_KEY, JSON.stringify(handledRequestIds.value.slice(0, 200)))
    } catch {
      // Ignore storage quota errors.
    }
  }

  function loadDashboardFiltersFromStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      const raw = localStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as {
        query?: string
        viewMode?: DashboardViewMode
        threatFilter?: DashboardThreatFilter
        actionableOnly?: boolean
        escalationSortMode?: EscalationSortMode
        escalationSlaMinutes?: number
      }

      if (typeof parsed.query === 'string') {
        dashboardQuery.value = parsed.query.slice(0, 120)
      }
      if (parsed.viewMode === 'all' || parsed.viewMode === 'alert' || parsed.viewMode === 'escalate') {
        dashboardViewMode.value = parsed.viewMode
      }
      if (dashboardThreatFilterOptions.some((option) => option.value === parsed.threatFilter)) {
        dashboardThreatFilter.value = parsed.threatFilter as DashboardThreatFilter
      }
      if (typeof parsed.actionableOnly === 'boolean') {
        dashboardActionableOnly.value = parsed.actionableOnly
      }
      if (parsed.escalationSortMode === 'risk' || parsed.escalationSortMode === 'newest' || parsed.escalationSortMode === 'oldest') {
        escalationSortMode.value = parsed.escalationSortMode
      }
      if (typeof parsed.escalationSlaMinutes === 'number' && Number.isFinite(parsed.escalationSlaMinutes)) {
        escalationSlaMinutes.value = normalizeEscalationSlaMinutes(parsed.escalationSlaMinutes)
      }
    } catch {
      // Ignore local storage parsing failures.
    }
  }

  function loadDashboardPresetsFromStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      const raw = localStorage.getItem(DASHBOARD_PRESET_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as {
        presets?: Array<Partial<DashboardFilterPreset>>
        selectedPresetId?: string | null
      }

      if (Array.isArray(parsed.presets)) {
        dashboardFilterPresets.value = parsed.presets
          .map((preset) => sanitizeDashboardPreset(preset))
          .filter((preset): preset is DashboardFilterPreset => preset != null)
          .slice(0, 30)
      }

      if (typeof parsed.selectedPresetId === 'string' || parsed.selectedPresetId === null) {
        selectedDashboardPresetId.value = parsed.selectedPresetId
      }
    } catch {
      // Ignore local storage parsing failures.
    }
  }

  function persistDashboardFiltersToStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      localStorage.setItem(
        DASHBOARD_FILTER_STORAGE_KEY,
        JSON.stringify({
          query: dashboardQuery.value,
          viewMode: dashboardViewMode.value,
          threatFilter: dashboardThreatFilter.value,
          actionableOnly: dashboardActionableOnly.value,
          escalationSortMode: escalationSortMode.value,
          escalationSlaMinutes: escalationSlaMinutes.value,
        }),
      )
    } catch {
      // Ignore storage quota errors.
    }
  }

  function persistDashboardPresetsToStorage(): void {
    if (!import.meta.client) {
      return
    }

    try {
      localStorage.setItem(
        DASHBOARD_PRESET_STORAGE_KEY,
        JSON.stringify({
          presets: dashboardFilterPresets.value.slice(0, 30),
          selectedPresetId: selectedDashboardPresetId.value,
        }),
      )
    } catch {
      // Ignore storage quota errors.
    }
  }

  function sanitizeDashboardPreset(preset: Partial<DashboardFilterPreset>): DashboardFilterPreset | null {
    const id = cleanText(preset.id)
    const name = cleanText(preset.name)
    if (!id || !name) {
      return null
    }

    const viewMode =
      preset.viewMode === 'alert' || preset.viewMode === 'escalate' || preset.viewMode === 'all'
        ? preset.viewMode
        : 'all'
    const threatFilter =
      preset.threatFilter && dashboardThreatFilterOptions.some((option) => option.value === preset.threatFilter)
        ? preset.threatFilter
        : 'all'
    const escalationSortMode =
      preset.escalationSortMode === 'newest' || preset.escalationSortMode === 'oldest' || preset.escalationSortMode === 'risk'
        ? preset.escalationSortMode
        : 'risk'
    const escalationSlaMinutes = normalizeEscalationSlaMinutes(preset.escalationSlaMinutes)

    return {
      id,
      name,
      query: String(preset.query ?? ''),
      viewMode,
      threatFilter,
      actionableOnly: Boolean(preset.actionableOnly),
      escalationSortMode,
      escalationSlaMinutes,
      updatedAt: typeof preset.updatedAt === 'number' && Number.isFinite(preset.updatedAt)
        ? preset.updatedAt
        : Date.now(),
    }
  }

  function reserveUniqueDashboardPresetName(
    requestedName: string,
    presetId: string,
    ownerByName: Map<string, string>,
  ): string {
    const baseName = requestedName.trim() || 'Preset'
    const baseKey = baseName.toLowerCase()
    const baseOwner = ownerByName.get(baseKey)

    if (!baseOwner || baseOwner === presetId) {
      ownerByName.set(baseKey, presetId)
      return baseName
    }

    let suffix = 2
    while (true) {
      const candidate = `${baseName} (${suffix})`
      const candidateKey = candidate.toLowerCase()
      const candidateOwner = ownerByName.get(candidateKey)
      if (!candidateOwner || candidateOwner === presetId) {
        ownerByName.set(candidateKey, presetId)
        return candidate
      }
      suffix += 1
    }
  }

  function toggleStreamPaused(): void {
    streamPaused.value = !streamPaused.value
  }

  function setDashboardViewMode(mode: DashboardViewMode): void {
    dashboardViewMode.value = mode
  }

  function resetDashboardFilters(): void {
    dashboardQuery.value = ''
    dashboardViewMode.value = 'all'
    dashboardThreatFilter.value = 'all'
    dashboardActionableOnly.value = false
    escalationSortMode.value = 'risk'
    escalationSlaMinutes.value = ESCALATION_SLA_DEFAULT_MINUTES
  }

  function setEscalationSortMode(mode: EscalationSortMode): void {
    escalationSortMode.value = mode
  }

  function setEscalationSlaMinutes(value: unknown): void {
    escalationSlaMinutes.value = normalizeEscalationSlaMinutes(value)
  }

  function saveDashboardPreset(): void {
    clearOperationFeedback()

    const name = dashboardPresetName.value.trim()
    if (!name) {
      operationError.value = 'Preset name is required'
      return
    }

    const snapshot = getDashboardFilterSnapshot()
    const existingIndex = dashboardFilterPresets.value.findIndex(
      (preset) => preset.name.toLowerCase() === name.toLowerCase(),
    )

    if (existingIndex >= 0) {
      const existing = dashboardFilterPresets.value[existingIndex]
      if (!existing) {
        operationError.value = 'Preset state is out of sync, please retry'
        return
      }
      const updatedPreset: DashboardFilterPreset = {
        id: existing.id,
        ...snapshot,
        name,
        updatedAt: Date.now(),
      }
      dashboardFilterPresets.value = dashboardFilterPresets.value.map((preset, index) =>
        index === existingIndex ? updatedPreset : preset,
      )
      selectedDashboardPresetId.value = updatedPreset.id
      operationMessage.value = `Updated preset ${name}`
    } else {
      const newPreset: DashboardFilterPreset = {
        id: `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        ...snapshot,
        updatedAt: Date.now(),
      }
      dashboardFilterPresets.value = [newPreset, ...dashboardFilterPresets.value].slice(0, 30)
      selectedDashboardPresetId.value = newPreset.id
      operationMessage.value = `Saved preset ${name}`
    }

    dashboardPresetName.value = ''
  }

  function applySelectedDashboardPreset(): void {
    clearOperationFeedback()

    const presetId = selectedDashboardPresetId.value
    if (!presetId) {
      operationError.value = 'Select a preset to load'
      return
    }

    const preset = dashboardFilterPresets.value.find((item) => item.id === presetId)
    if (!preset) {
      operationError.value = 'Selected preset no longer exists'
      selectedDashboardPresetId.value = null
      return
    }

    applyDashboardFilterSnapshot(preset)
    operationMessage.value = `Loaded preset ${preset.name}`
  }

  function deleteSelectedDashboardPreset(): void {
    clearOperationFeedback()

    const presetId = selectedDashboardPresetId.value
    if (!presetId) {
      operationError.value = 'Select a preset to delete'
      return
    }

    const preset = dashboardFilterPresets.value.find((item) => item.id === presetId)
    if (!preset) {
      selectedDashboardPresetId.value = null
      operationError.value = 'Selected preset no longer exists'
      return
    }

    dashboardFilterPresets.value = dashboardFilterPresets.value.filter((item) => item.id !== presetId)
    selectedDashboardPresetId.value = null
    operationMessage.value = `Deleted preset ${preset.name}`
  }

  function updateSelectedDashboardPreset(): void {
    clearOperationFeedback()

    const preset = selectedDashboardPreset.value
    if (!preset) {
      operationError.value = 'Select a preset to update'
      return
    }
    if (!selectedDashboardPresetDirty.value) {
      operationMessage.value = `Preset ${preset.name} is already up to date`
      return
    }

    const snapshot = getDashboardFilterSnapshot()
    dashboardFilterPresets.value = dashboardFilterPresets.value.map((item) => {
      if (item.id !== preset.id) {
        return item
      }
      return {
        ...item,
        ...snapshot,
        updatedAt: Date.now(),
      }
    })

    operationMessage.value = `Updated preset ${preset.name}`
  }

  function exportDashboardPresets(): void {
    clearOperationFeedback()

    if (!import.meta.client) {
      operationError.value = 'Preset export is only available in browser context'
      return
    }

    if (dashboardFilterPresets.value.length === 0) {
      operationError.value = 'No presets available to export'
      return
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      presets: dashboardFilterPresets.value,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `firewall-filter-presets-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    operationMessage.value = `Exported ${dashboardFilterPresets.value.length} preset(s)`
  }

  async function importDashboardPresets(file: File | null): Promise<void> {
    clearOperationFeedback()

    if (!file) {
      operationError.value = 'Select a JSON file to import'
      return
    }

    dashboardPresetImportPending.value = true
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as DashboardPresetImportPayload | Array<Partial<DashboardFilterPreset>>
      const rawPresets = Array.isArray(parsed) ? parsed : parsed.presets
      if (!Array.isArray(rawPresets)) {
        operationError.value = 'Invalid preset file format'
        return
      }

      const sanitizedPresets = rawPresets
        .map((preset) => sanitizeDashboardPreset(preset))
        .filter((preset): preset is DashboardFilterPreset => preset != null)

      if (sanitizedPresets.length === 0) {
        operationError.value = 'No valid presets found in file'
        return
      }

      const mergedById = new Map<string, DashboardFilterPreset>()
      const presetNameOwners = new Map<string, string>()
      for (const preset of dashboardFilterPresets.value) {
        mergedById.set(preset.id, preset)
        presetNameOwners.set(preset.name.toLowerCase(), preset.id)
      }

      let importedCount = 0
      let updatedCount = 0
      let renamedCount = 0
      for (const preset of sanitizedPresets) {
        const existing = mergedById.get(preset.id)
        if (existing) {
          updatedCount += 1
        } else {
          importedCount += 1
        }

        if (existing) {
          const existingNameKey = existing.name.toLowerCase()
          if (presetNameOwners.get(existingNameKey) === existing.id) {
            presetNameOwners.delete(existingNameKey)
          }
        }

        const resolvedName = reserveUniqueDashboardPresetName(preset.name, preset.id, presetNameOwners)
        if (resolvedName !== preset.name) {
          renamedCount += 1
        }

        mergedById.set(preset.id, {
          ...preset,
          name: resolvedName,
          updatedAt: Date.now(),
        })
      }

      dashboardFilterPresets.value = Array.from(mergedById.values())
        .toSorted((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 30)

      if (sanitizedPresets[0]) {
        selectedDashboardPresetId.value = sanitizedPresets[0].id
      }

      const renamedSummary = renamedCount > 0 ? `, renamed ${renamedCount}` : ''
      operationMessage.value = `Imported ${importedCount} preset(s), updated ${updatedCount}${renamedSummary}`
    } catch {
      operationError.value = 'Failed to import preset file'
    } finally {
      dashboardPresetImportPending.value = false
    }
  }

  function clearDashboardReconnectTimer(): void {
    if (dashboardReconnectTimer) {
      clearTimeout(dashboardReconnectTimer)
      dashboardReconnectTimer = null
    }
    dashboardReconnectDelaySeconds.value = null
  }

  function scheduleDashboardReconnect(): void {
    if (!keepDashboardReconnect.value) {
      return
    }

    clearDashboardReconnectTimer()
    dashboardReconnectAttempts.value += 1
    const delayMs = Math.min(1000 * 2 ** Math.min(dashboardReconnectAttempts.value, 4), 15000)
    dashboardReconnectDelaySeconds.value = Math.ceil(delayMs / 1000)

    dashboardReconnectTimer = setTimeout(() => {
      dashboardReconnectTimer = null
      dashboardReconnectDelaySeconds.value = null
      openDashboardStream()
    }, delayMs)
  }

  function cleanText(value?: string): string | undefined {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  }

  function pushDashboardEvent(event: FirewallDashboardEvent): void {
    if (streamPaused.value) {
      return
    }
    dashboardEvents.value = [event, ...dashboardEvents.value].slice(0, 50)
  }

  function closeDashboardStream(): void {
    clearDashboardReconnectTimer()
    if (dashboardSocket) {
      dashboardSocket.close()
      dashboardSocket = null
    }
    dashboardConnected.value = false
  }

  function openDashboardStream(): void {
    if (!import.meta.client) {
      return
    }

    closeDashboardStream()
    dashboardError.value = null

    const socket = new WebSocket(firewallSupplementService.dashboardWsURL)
    dashboardSocket = socket

    socket.addEventListener('open', () => {
      clearDashboardReconnectTimer()
      dashboardReconnectAttempts.value = 0
      dashboardConnected.value = true
      dashboardError.value = null
    })

    socket.addEventListener('close', () => {
      if (dashboardSocket !== socket) {
        return
      }
      dashboardSocket = null
      dashboardConnected.value = false
      scheduleDashboardReconnect()
    })

    socket.addEventListener('error', () => {
      dashboardError.value = 'Dashboard WebSocket connection error'
    })

    socket.addEventListener('message', (message) => {
      try {
        const parsed = JSON.parse(String(message.data)) as FirewallDashboardEvent
        pushDashboardEvent(parsed)
      } catch {
        // Ignore malformed events from mixed environments.
      }
    })
  }

  function reconnectDashboardStream(): void {
    keepDashboardReconnect.value = true
    dashboardReconnectAttempts.value = 0
    openDashboardStream()
  }

  function markEscalationHandled(requestId: string): void {
    if (!handledRequestIds.value.includes(requestId)) {
      handledRequestIds.value = [requestId, ...handledRequestIds.value].slice(0, 200)
    }
  }

  function clearEscalationQueue(): void {
    const queueIds = pendingEscalations.value.map((item) => item.requestId)
    handledRequestIds.value = Array.from(new Set([...queueIds, ...handledRequestIds.value])).slice(0, 200)
    operationMessage.value = `Cleared ${queueIds.length} pending escalation(s)`
  }

  function escalationSubtitle(item: EscalationItem): string {
    return `${dashboardMethod(item.event)} · ${dashboardThreat(item.event)} · ${formatTimestamp(item.event.timestamp)}`
  }

  function resolveEscalation(item: EscalationItem, action: 'allow' | 'block'): void {
    void sendDashboardAction(action, item.requestId)
  }

  function acknowledgeEscalation(item: EscalationItem): void {
    markEscalationHandled(item.requestId)
    pushActionHistory('ack', item.requestId)
    operationMessage.value = `Acknowledged ${item.requestId}`
  }

  function visibleEscalationRequestIds(levels?: EscalationThreatLevel[]): string[] {
    if (!levels || levels.length === 0) {
      return Array.from(new Set(visiblePendingEscalations.value.map((item) => item.requestId)))
    }

    const levelSet = new Set(levels)
    return Array.from(
      new Set(
        visiblePendingEscalations.value
          .filter((item) => {
            const level = dashboardThreat(item.event).toLowerCase()
            return isEscalationThreatLevel(level) && levelSet.has(level)
          })
          .map((item) => item.requestId),
      ),
    )
  }

  function staleVisibleEscalationRequestIds(level: StaleEscalationLevel = 'all'): string[] {
    const nowSeconds = Date.now() / 1000
    return Array.from(
      new Set(
        visiblePendingEscalations.value
          .filter((item) => {
            const slaLevel = escalationSlaLevel(item, nowSeconds)
            if (level === 'critical') {
              return slaLevel === 'critical'
            }
            if (level === 'warning') {
              return slaLevel === 'warning'
            }
            return slaLevel === 'warning' || slaLevel === 'critical'
          })
          .map((item) => item.requestId),
      ),
    )
  }

  async function resolveVisibleEscalations(action: 'allow' | 'block'): Promise<void> {
    clearOperationFeedback()

    const requestIds = visibleEscalationRequestIds()
    if (requestIds.length === 0) {
      operationMessage.value = 'No visible escalations to resolve'
      return
    }

    if (!dashboardSocket || dashboardSocket.readyState !== WebSocket.OPEN) {
      operationError.value = 'Dashboard WebSocket is not connected'
      return
    }

    dashboardBatchActionPending.value = true
    let sentCount = 0

    try {
      for (const requestId of requestIds) {
        dashboardSocket.send(JSON.stringify({ action, request_id: requestId }))
        markEscalationHandled(requestId)
        pushActionHistory(action, requestId)
        sentCount += 1
      }

      operationMessage.value = `Sent ${action.toUpperCase()} for ${sentCount} visible escalation(s)`
    } catch {
      operationError.value = `Failed after sending ${sentCount}/${requestIds.length} actions`
    } finally {
      dashboardBatchActionPending.value = false
    }
  }

  function acknowledgeVisibleEscalations(): void {
    clearOperationFeedback()

    const requestIds = visibleEscalationRequestIds()
    if (requestIds.length === 0) {
      operationMessage.value = 'No visible escalations to acknowledge'
      return
    }

    for (const requestId of requestIds) {
      markEscalationHandled(requestId)
      pushActionHistory('ack', requestId)
    }

    operationMessage.value = `Acknowledged ${requestIds.length} visible escalation(s)`
  }

  async function resolveStaleVisibleEscalations(
    action: 'allow' | 'block',
    level: StaleEscalationLevel = 'all',
  ): Promise<void> {
    clearOperationFeedback()

    const requestIds = staleVisibleEscalationRequestIds(level)
    if (requestIds.length === 0) {
      operationMessage.value = `No ${staleEscalationLevelLabel(level)} escalations to resolve`
      return
    }

    if (!dashboardSocket || dashboardSocket.readyState !== WebSocket.OPEN) {
      operationError.value = 'Dashboard WebSocket is not connected'
      return
    }

    dashboardBatchActionPending.value = true
    let sentCount = 0

    try {
      for (const requestId of requestIds) {
        dashboardSocket.send(JSON.stringify({ action, request_id: requestId }))
        markEscalationHandled(requestId)
        pushActionHistory(action, requestId)
        sentCount += 1
      }

      operationMessage.value = `Sent ${action.toUpperCase()} for ${sentCount} ${staleEscalationLevelLabel(level)} escalation(s)`
    } catch {
      operationError.value = `Failed after sending ${sentCount}/${requestIds.length} actions`
    } finally {
      dashboardBatchActionPending.value = false
    }
  }

  function acknowledgeStaleVisibleEscalations(level: StaleEscalationLevel = 'all'): void {
    clearOperationFeedback()

    const requestIds = staleVisibleEscalationRequestIds(level)
    if (requestIds.length === 0) {
      operationMessage.value = `No ${staleEscalationLevelLabel(level)} escalations to acknowledge`
      return
    }

    for (const requestId of requestIds) {
      markEscalationHandled(requestId)
      pushActionHistory('ack', requestId)
    }

    operationMessage.value = `Acknowledged ${requestIds.length} ${staleEscalationLevelLabel(level)} escalation(s)`
  }

  async function resolveVisibleEscalationsByThreat(
    action: 'allow' | 'block',
    levels: EscalationThreatLevel[],
  ): Promise<void> {
    clearOperationFeedback()

    const requestIds = visibleEscalationRequestIds(levels)
    if (requestIds.length === 0) {
      operationMessage.value = `No visible ${formatThreatLevelsLabel(levels)} escalations to resolve`
      return
    }

    if (!dashboardSocket || dashboardSocket.readyState !== WebSocket.OPEN) {
      operationError.value = 'Dashboard WebSocket is not connected'
      return
    }

    const levelsLabel = formatThreatLevelsLabel(levels)
    dashboardBatchActionPending.value = true
    let sentCount = 0

    try {
      for (const requestId of requestIds) {
        dashboardSocket.send(JSON.stringify({ action, request_id: requestId }))
        markEscalationHandled(requestId)
        pushActionHistory(action, requestId)
        sentCount += 1
      }

      operationMessage.value = `Sent ${action.toUpperCase()} for ${sentCount} visible ${levelsLabel} escalation(s)`
    } catch {
      operationError.value = `Failed after sending ${sentCount}/${requestIds.length} actions`
    } finally {
      dashboardBatchActionPending.value = false
    }
  }

  function acknowledgeVisibleEscalationsByThreat(levels: EscalationThreatLevel[]): void {
    clearOperationFeedback()

    const requestIds = visibleEscalationRequestIds(levels)
    if (requestIds.length === 0) {
      operationMessage.value = `No visible ${formatThreatLevelsLabel(levels)} escalations to acknowledge`
      return
    }

    for (const requestId of requestIds) {
      markEscalationHandled(requestId)
      pushActionHistory('ack', requestId)
    }

    operationMessage.value = `Acknowledged ${requestIds.length} visible ${formatThreatLevelsLabel(levels)} escalation(s)`
  }

  async function sendDashboardAction(action: 'allow' | 'block', requestId: string): Promise<void> {
    clearOperationFeedback()

    if (!dashboardSocket || dashboardSocket.readyState !== WebSocket.OPEN) {
      operationError.value = 'Dashboard WebSocket is not connected'
      return
    }

    dashboardActionPendingId.value = requestId
    try {
      dashboardSocket.send(JSON.stringify({ action, request_id: requestId }))
      markEscalationHandled(requestId)
      pushActionHistory(action, requestId)
      operationMessage.value = `Sent ${action.toUpperCase()} for ${requestId}`
    } catch {
      operationError.value = 'Failed to send dashboard action'
    } finally {
      dashboardActionPendingId.value = null
    }
  }

  function onHumanAction(event: FirewallDashboardEvent, action: 'allow' | 'block'): void {
    const requestId = dashboardRequestId(event)
    if (!requestId) {
      operationError.value = 'request_id missing for this event'
      return
    }
    void sendDashboardAction(action, requestId)
  }

  async function refreshGatewayManagement(): Promise<void> {
    gatewayRefreshLoading.value = true
    gatewayManagementError.value = null

    try {
      const [gateway, monitor, toolsCatalog] = await Promise.all([
        firewallSupplementService.getGatewayInfo(),
        firewallSupplementService.getMonitorStatus(),
        firewallSupplementService.getMcpToolsCatalog(),
      ])

      gatewayInfo.value = gateway
      gatewayMonitor.value = monitor.gateway ?? null
      gatewayToolsCatalog.value = toolsCatalog.gateway_tools ?? []
      gatewaySkillsCatalog.value = toolsCatalog.skills ?? []
    } catch (error) {
      gatewayInfo.value = null
      gatewayMonitor.value = null
      gatewayToolsCatalog.value = []
      gatewaySkillsCatalog.value = []
      gatewayManagementError.value = toErrorMessage(error)
    } finally {
      gatewayRefreshLoading.value = false
    }
  }

  async function refresh(): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const gatewayRefreshTask = refreshGatewayManagement()
      const [audit, traceList, datasetList, customConfig] = await Promise.all([
        firewallSupplementService.getAudit(25),
        firewallSupplementService.getTraces(25),
        firewallSupplementService.getDatasets(10),
        firewallSupplementService.getCustomConfig(),
      ])

      auditEntries.value = audit.entries ?? []
      traces.value = traceList.traces ?? []
      datasets.value = datasetList.datasets ?? []
      skills.value = customConfig.skills ?? []
      mcpServers.value = customConfig.mcp_servers ?? []
      await gatewayRefreshTask
      lastUpdated.value = new Date()
    } catch (error) {
      errorMessage.value = toErrorMessage(error)
    } finally {
      loading.value = false
    }
  }

  async function addSkill(): Promise<void> {
    const id = newSkill.value.id.trim()
    if (!id) {
      operationError.value = 'Skill id is required'
      return
    }

    clearOperationFeedback()
    savingSkill.value = true
    try {
      await firewallSupplementService.upsertSkill({
        id,
        name: cleanText(newSkill.value.name),
        description: cleanText(newSkill.value.description),
      })
      operationMessage.value = `Skill ${id} saved`
      newSkill.value = { id: '', name: '', description: '' }
      await refresh()
    } catch (error) {
      operationError.value = toErrorMessage(error)
    } finally {
      savingSkill.value = false
    }
  }

  async function removeSkill(skillId: string): Promise<void> {
    clearOperationFeedback()
    deletingSkillId.value = skillId
    try {
      await firewallSupplementService.deleteSkill(skillId)
      operationMessage.value = `Skill ${skillId} deleted`
      await refresh()
    } catch (error) {
      operationError.value = toErrorMessage(error)
    } finally {
      deletingSkillId.value = null
    }
  }

  async function addMcpServer(): Promise<void> {
    const id = newServer.value.id.trim()
    if (!id) {
      operationError.value = 'MCP server id is required'
      return
    }

    clearOperationFeedback()
    savingServer.value = true
    try {
      await firewallSupplementService.upsertMcpServer({
        id,
        name: cleanText(newServer.value.name),
        transport: cleanText(newServer.value.transport),
        url: cleanText(newServer.value.url),
      })
      operationMessage.value = `MCP server ${id} saved`
      newServer.value = { id: '', name: '', transport: 'sse', url: '' }
      await refresh()
    } catch (error) {
      operationError.value = toErrorMessage(error)
    } finally {
      savingServer.value = false
    }
  }

  async function removeMcpServer(serverId: string): Promise<void> {
    clearOperationFeedback()
    deletingServerId.value = serverId
    try {
      await firewallSupplementService.deleteMcpServer(serverId)
      operationMessage.value = `MCP server ${serverId} deleted`
      await refresh()
    } catch (error) {
      operationError.value = toErrorMessage(error)
    } finally {
      deletingServerId.value = null
    }
  }

  onMounted(() => {
    loadHandledRequestIdsFromStorage()
    loadActionHistoryFromStorage()
    loadDashboardFiltersFromStorage()
    loadDashboardPresetsFromStorage()
    void refresh()
    openDashboardStream()
  })

  watch(handledRequestIds, () => {
    persistHandledRequestIdsToStorage()
  })

  watch(actionHistory, () => {
    persistActionHistoryToStorage()
  })

  watch([dashboardQuery, dashboardViewMode, dashboardThreatFilter, dashboardActionableOnly, escalationSortMode, escalationSlaMinutes], () => {
    persistDashboardFiltersToStorage()
  })

  watch(dashboardFilterPresets, () => {
    persistDashboardPresetsToStorage()
  })

  watch(selectedDashboardPresetId, () => {
    persistDashboardPresetsToStorage()
  })

  onBeforeUnmount(() => {
    keepDashboardReconnect.value = false
    closeDashboardStream()
  })

  return {
    firewallSupplementService,
    loading,
    errorMessage,
    operationError,
    operationMessage,
    lastUpdated,
    auditEntries,
    traces,
    datasets,
    skills,
    mcpServers,
    gatewayInfo,
    gatewayMonitor,
    gatewayToolsCatalog,
    gatewaySkillsCatalog,
    gatewayManagementError,
    gatewayRefreshLoading,
    dashboardConnected,
    dashboardError,
    dashboardEvents,
    dashboardActionPendingId,
    dashboardBatchActionPending,
    dashboardReconnectAttempts,
    dashboardReconnectDelaySeconds,
    streamPaused,
    dashboardViewMode,
    dashboardThreatFilter,
    dashboardActionableOnly,
    escalationSortMode,
    escalationSlaMinutes,
    dashboardQuery,
    unifiedTrafficQuery,
    unifiedTrafficSourceFilter,
    unifiedTrafficKindFilter,
    unifiedTrafficAlertsOnly,
    dashboardFilterPresets,
    dashboardPresetName,
    selectedDashboardPresetId,
    dashboardPresetImportPending,
    selectedDashboardPreset,
    selectedDashboardPresetDirty,
    dashboardThreatFilterOptions,
    escalationSortModeOptions,
    unifiedTrafficSourceOptions,
    unifiedTrafficKindOptions,
    dashboardPresetOptions,
    actionHistory,
    actionHistoryQuery,
    actionHistoryFilterType,
    actionHistoryFilterOptions,
    newSkill,
    newServer,
    transportOptions,
    totalAudit,
    totalTraces,
    totalDatasets,
    totalSkills,
    totalServers,
    totalGatewayCatalogTools,
    totalGatewayCatalogSkills,
    gatewayConfigured,
    gatewayEffectivePort,
    gatewayWsEndpoint,
    gatewayMonitorStatus,
    gatewayMonitorMessage,
    dashboardEventCount,
    visibleDashboardEventCount,
    recentDashboardEvents,
    recentUnifiedTrafficEntries,
    filteredUnifiedTrafficEntries,
    visibleUnifiedTrafficCount,
    hasUnifiedTrafficFilters,
    pendingEscalations,
    visiblePendingEscalations,
    visiblePendingEscalationCount,
    visibleEscalationThreatSummary,
    oldestVisibleEscalationAgeSeconds,
    oldestVisibleEscalationAgeLabel,
    staleVisibleEscalationCount,
    staleWarningVisibleEscalationCount,
    staleCriticalVisibleEscalationCount,
    hasVisibleEscalationSlaBreach,
    actionHistoryCount,
    visibleActionHistoryCount,
    hasActionHistoryFilters,
    canUndoAction,
    totalPendingEscalations,
    hasActiveDashboardFilters,
    activeDashboardFilterCount,
    recentActionHistory,
    canAddSkill,
    canAddServer,
    canSaveDashboardPreset,
    canUpdateSelectedDashboardPreset,
    verdictColor,
    threatColor,
    gatewayStatusColor,
    gatewayStatusLabel,
    formatTimestamp,
    formatDurationSeconds,
    escalationAgeLabel,
    escalationSlaLevel,
    traceIdentifier,
    traceCreatedAt,
    skillLabel,
    serverLabel,
    unifiedTrafficSourceLabel,
    unifiedTrafficSourceColor,
    unifiedTrafficKindLabel,
    unifiedTrafficKindColor,
    applyUnifiedTrafficEntryToDashboard,
    focusEscalationQueueByRequest,
    focusActionHistoryByRequestId,
    dashboardVerdict,
    dashboardThreat,
    dashboardMethod,
    dashboardRequestId,
    canResolveEvent,
    actionLabel,
    actionColor,
    undoLastAction,
    clearActionHistory,
    clearActionHistoryFilters,
    clearUnifiedTrafficFilters,
    focusUnifiedTrafficByRequestId,
    toggleStreamPaused,
    setDashboardViewMode,
    setEscalationSortMode,
    setEscalationSlaMinutes,
    resetDashboardFilters,
    saveDashboardPreset,
    applySelectedDashboardPreset,
    deleteSelectedDashboardPreset,
    updateSelectedDashboardPreset,
    exportDashboardPresets,
    importDashboardPresets,
    reconnectDashboardStream,
    clearEscalationQueue,
    escalationSubtitle,
    resolveEscalation,
    acknowledgeEscalation,
    resolveVisibleEscalations,
    acknowledgeVisibleEscalations,
    resolveStaleVisibleEscalations,
    acknowledgeStaleVisibleEscalations,
    resolveVisibleEscalationsByThreat,
    acknowledgeVisibleEscalationsByThreat,
    onHumanAction,
    refresh,
    refreshGatewayManagement,
    addSkill,
    removeSkill,
    addMcpServer,
    removeMcpServer,
    savingSkill,
    deletingSkillId,
    savingServer,
    deletingServerId,
  }
}

export type FirewallOpsConsoleState = ReturnType<typeof useFirewallOpsConsole>

const firewallOpsConsoleKey: InjectionKey<FirewallOpsConsoleState> = Symbol('firewall-ops-console')

export function provideFirewallOpsConsole(state: FirewallOpsConsoleState): void {
  provide(firewallOpsConsoleKey, state)
}

export function useInjectedFirewallOpsConsole(): FirewallOpsConsoleState {
  const state = inject(firewallOpsConsoleKey)
  if (!state) {
    throw new Error('Firewall ops console context is not available')
  }
  return state
}
