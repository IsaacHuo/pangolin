<template>
  <div class="sync-monitor">
    <header class="monitor-header">
      <div>
        <h2>Backend Command Sync</h2>
        <p>
          Real-time inbound and outbound backend events with full payload visibility.
        </p>
      </div>
      <div class="header-actions">
        <span class="status-badge" :class="{ connected }">
          {{ connected ? 'Live' : 'Reconnecting' }}
        </span>
        <label class="auto-scroll-toggle">
          <input v-model="autoScroll" type="checkbox" />
          Auto Scroll
        </label>
        <button class="btn-secondary" @click="clearLogs">Clear</button>
      </div>
    </header>

    <section class="health-grid">
      <article class="health-card" :class="backendHealthClass">
        <div class="health-title-row">
          <h3>Backend Health</h3>
          <span class="health-pill" :class="backendHealthClass">
            {{ monitor?.backend.ok ? 'HEALTHY' : 'DOWN' }}
          </span>
        </div>
        <p class="health-main">{{ monitor?.backend.status || 'checking' }}</p>
        <p class="health-meta">Last Check: {{ formatMonitorTime(monitor?.backend.lastChecked) }}</p>
      </article>

      <article class="health-card" :class="gatewayHealthClass">
        <div class="health-title-row">
          <h3>Gateway Token</h3>
          <span class="health-pill" :class="gatewayHealthClass">
            {{ gatewayStatusLabel }}
          </span>
        </div>
        <p class="health-main">{{ monitor?.gateway.status || 'unknown' }}</p>
        <p class="health-message">{{ gatewayStatusMessage }}</p>
        <p class="health-meta">{{ gatewayStatusMeta }}</p>
      </article>
    </section>

    <section class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">Total</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Inbound</span>
        <strong class="stat-value inbound">{{ stats.inbound }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Outbound</span>
        <strong class="stat-value outbound">{{ stats.outbound }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Error</span>
        <strong class="stat-value error">{{ stats.error }}</strong>
      </article>
    </section>

    <section class="toolbar">
      <div class="filters">
        <button
          v-for="filter in filters"
          :key="filter.id"
          class="filter-chip"
          :class="{ active: activeFilter === filter.id }"
          @click="activeFilter = filter.id"
        >
          {{ filter.label }}
          <span>{{ filter.count }}</span>
        </button>
      </div>
      <input
        v-model="searchQuery"
        class="search-input"
        type="text"
        placeholder="Search path, source, status, payload..."
      />
    </section>

    <section class="monitor-layout">
      <div ref="logContainer" class="event-list">
        <div v-if="filteredEvents.length === 0" class="empty-state">
          <p>No events yet for current filter.</p>
          <small>Use All filter or clear search to restore full stream.</small>
        </div>
        <button
          v-for="event in filteredEvents"
          :key="event.id"
          class="event-row"
          :class="[
            `direction-${event.direction}`,
            { selected: selectedEventId === event.id, error: isErrorEvent(event) },
          ]"
          @click="selectedEventId = event.id"
        >
          <div class="event-top">
            <span class="direction-badge" :class="event.direction">
              {{ directionLabel(event.direction) }}
            </span>
            <span class="kind-chip">{{ event.kind.toUpperCase() }}</span>
            <span class="event-time">{{ formatEventTime(event) }}</span>
          </div>
          <p class="event-summary">{{ event.summary }}</p>
          <div class="event-meta">
            <span>{{ event.source }}</span>
            <span v-if="event.method && event.path">{{ event.method }} {{ event.path }}</span>
            <span v-else-if="event.path">{{ event.path }}</span>
            <span v-if="event.peer">{{ event.peer }}</span>
            <span v-if="event.statusCode" :class="statusClass(event.statusCode)">
              {{ event.statusCode }} {{ event.statusText || '' }}
            </span>
          </div>
        </button>
      </div>

      <aside class="event-detail">
        <template v-if="selectedEvent">
          <h3>Event Detail</h3>
          <dl class="detail-grid">
            <div>
              <dt>Direction</dt>
              <dd>{{ directionLabel(selectedEvent.direction) }}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{{ selectedEvent.kind }}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{{ selectedEvent.level }}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{{ selectedEvent.source }}</dd>
            </div>
            <div>
              <dt>Peer</dt>
              <dd>{{ selectedEvent.peer || '-' }}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{{ selectedEvent.path || '-' }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {{
                  selectedEvent.statusCode
                    ? `${selectedEvent.statusCode} ${selectedEvent.statusText || ''}`.trim()
                    : '-'
                }}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{{ formatEventTime(selectedEvent) }}</dd>
            </div>
          </dl>
          <h4>Raw Payload</h4>
          <pre class="raw-block">{{ selectedEvent.raw }}</pre>
        </template>
        <div v-else class="detail-empty">
          Select an event from the left stream to inspect complete backend in/out details.
        </div>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:9090'

type EventDirection = 'inbound' | 'outbound' | 'internal'
type EventKind = 'http' | 'websocket' | 'service' | 'runtime'
type EventFilter = 'all' | EventDirection | 'error'
type GatewayProbeStatus =
  | 'ok'
  | 'pairing_required'
  | 'invalid_token'
  | 'missing_token'
  | 'not_configured'
  | 'rejected'
  | 'timeout'
  | 'unreachable'
  | 'unknown'

interface StreamEvent {
  id: string
  receivedAt: string
  timestamp: string | null
  direction: EventDirection
  kind: EventKind
  level: string
  source: string
  peer: string | null
  method: string | null
  path: string | null
  statusCode: number | null
  statusText: string | null
  summary: string
  raw: string
}

interface MonitorBackend {
  ok: boolean
  status: string
  service: string
  lastChecked: string
}

interface MonitorGateway {
  configured: boolean
  status: GatewayProbeStatus
  tokenValid: boolean | null
  pairingRequired: boolean
  message: string
  wsUrl: string | null
  configPath: string | null
  hasToken: boolean
  hasPassword: boolean
  lastChecked: string
}

interface MonitorPayload {
  backend: MonitorBackend
  gateway: MonitorGateway
}

const HTTP_ACCESS_RE = /^(?<level>[A-Z]+):\s+(?<peer>[^ ]+)\s-\s"(?<method>[A-Z]+)\s(?<path>[^\"]+)\sHTTP\/[^\"]+"\s(?<status>\d{3})(?:\s(?<statusText>.*))?$/
const WS_ACCESS_RE = /^(?<level>[A-Z]+):\s+(?<peer>[^ ]+)\s-\s"WebSocket\s(?<path>[^\"]+)"\s\[(?<state>[^\]]+)\]$/
const APP_LOG_RE = /^(?<timestamp>\d{4}-\d{2}-\d{2}T[^ ]+)\s+\[(?<level>[A-Z]+)\]\s+(?<source>[^:]+):\s+(?<message>.*)$/
const CONNECTION_RE = /^(?<level>[A-Z]+):\s+connection\s(?<state>open|closed)$/

const logs = ref<StreamEvent[]>([])
const connected = ref(false)
const autoScroll = ref(true)
const activeFilter = ref<EventFilter>('all')
const searchQuery = ref('')
const monitor = ref<MonitorPayload | null>(null)
const monitorError = ref<string | null>(null)
const monitorLoading = ref(false)
const logContainer = ref<HTMLElement | null>(null)
const selectedEventId = ref<string | null>(null)
let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let monitorTimer: ReturnType<typeof setInterval> | null = null
let localSeq = 0

const backendHealthClass = computed(() => {
  if (!monitor.value) return 'health-neutral'
  return monitor.value.backend.ok ? 'health-ok' : 'health-error'
})

const gatewayHealthClass = computed(() => {
  const status = monitor.value?.gateway.status || 'unknown'
  if (status === 'ok') return 'health-ok'
  if (status === 'pairing_required') return 'health-warn'
  if (status === 'not_configured' || status === 'missing_token') return 'health-neutral'
  return 'health-error'
})

const gatewayStatusLabel = computed(() => {
  const status = monitor.value?.gateway.status || 'unknown'
  if (status === 'ok') return 'TOKEN OK'
  if (status === 'pairing_required') return 'PAIRING'
  if (status === 'invalid_token') return 'INVALID'
  if (status === 'missing_token') return 'MISSING'
  if (status === 'not_configured') return 'UNSET'
  if (status === 'unreachable') return 'OFFLINE'
  if (status === 'timeout') return 'TIMEOUT'
  return 'ERROR'
})

const gatewayStatusMessage = computed(() => {
  if (monitorError.value) return monitorError.value
  if (!monitor.value) return 'Waiting for monitor response...'
  return monitor.value.gateway.message || 'No gateway message'
})

const gatewayStatusMeta = computed(() => {
  if (!monitor.value) return 'Checking gateway...'
  const parts: string[] = []
  if (monitor.value.gateway.wsUrl) {
    parts.push(`WS: ${monitor.value.gateway.wsUrl}`)
  }
  if (monitor.value.gateway.configPath) {
    parts.push(`Config: ${monitor.value.gateway.configPath}`)
  }
  parts.push(`Last Check: ${formatMonitorTime(monitor.value.gateway.lastChecked)}`)
  return parts.join(' | ')
})

const stats = computed(() => {
  const total = logs.value.length
  const inbound = logs.value.filter(event => event.direction === 'inbound').length
  const outbound = logs.value.filter(event => event.direction === 'outbound').length
  const error = logs.value.filter(event => isErrorEvent(event)).length
  return { total, inbound, outbound, error }
})

const filters = computed(() => [
  { id: 'all' as EventFilter, label: 'All', count: stats.value.total },
  { id: 'inbound' as EventFilter, label: 'Inbound', count: stats.value.inbound },
  { id: 'outbound' as EventFilter, label: 'Outbound', count: stats.value.outbound },
  {
    id: 'internal' as EventFilter,
    label: 'Internal',
    count: logs.value.filter(event => event.direction === 'internal').length,
  },
  { id: 'error' as EventFilter, label: 'Error', count: stats.value.error },
])

const filteredEvents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return logs.value.filter(event => {
    if (activeFilter.value === 'error') {
      if (!isErrorEvent(event)) return false
    } else if (activeFilter.value !== 'all' && event.direction !== activeFilter.value) {
      return false
    }

    if (!query) return true

    const searchable = [
      event.summary,
      event.source,
      event.peer || '',
      event.path || '',
      event.method || '',
      event.statusCode?.toString() || '',
      event.statusText || '',
      event.raw,
    ].join(' ').toLowerCase()

    return searchable.includes(query)
  })
})

const selectedEvent = computed(() => {
  if (!selectedEventId.value) return null
  return filteredEvents.value.find(event => event.id === selectedEventId.value) || null
})

watch(filteredEvents, events => {
  if (events.length === 0) {
    selectedEventId.value = null
    return
  }

  if (!selectedEventId.value || !events.some(event => event.id === selectedEventId.value)) {
    selectedEventId.value = events[events.length - 1].id
  }
})

function nextLocalId() {
  localSeq += 1
  return `local-${Date.now()}-${localSeq}`
}

function normalizeDirection(value: unknown): EventDirection {
  if (value === 'inbound' || value === 'outbound' || value === 'internal') {
    return value
  }
  return 'internal'
}

function normalizeKind(value: unknown): EventKind {
  if (value === 'http' || value === 'websocket' || value === 'service' || value === 'runtime') {
    return value
  }
  return 'runtime'
}

function parseLegacyLine(rawLine: string): StreamEvent {
  const line = rawLine.trim()
  const now = new Date().toISOString()

  const httpMatch = line.match(HTTP_ACCESS_RE)
  if (httpMatch?.groups) {
    return {
      id: nextLocalId(),
      receivedAt: now,
      timestamp: null,
      direction: 'inbound',
      kind: 'http',
      level: httpMatch.groups.level,
      source: 'uvicorn.access',
      peer: httpMatch.groups.peer,
      method: httpMatch.groups.method,
      path: httpMatch.groups.path,
      statusCode: Number(httpMatch.groups.status),
      statusText: httpMatch.groups.statusText?.trim() || null,
      summary: `${httpMatch.groups.method} ${httpMatch.groups.path} -> ${httpMatch.groups.status}`,
      raw: line,
    }
  }

  const wsMatch = line.match(WS_ACCESS_RE)
  if (wsMatch?.groups) {
    return {
      id: nextLocalId(),
      receivedAt: now,
      timestamp: null,
      direction: 'inbound',
      kind: 'websocket',
      level: wsMatch.groups.level,
      source: 'uvicorn.ws',
      peer: wsMatch.groups.peer,
      method: null,
      path: wsMatch.groups.path,
      statusCode: null,
      statusText: wsMatch.groups.state,
      summary: `WebSocket ${wsMatch.groups.path} [${wsMatch.groups.state}]`,
      raw: line,
    }
  }

  const connectionMatch = line.match(CONNECTION_RE)
  if (connectionMatch?.groups) {
    return {
      id: nextLocalId(),
      receivedAt: now,
      timestamp: null,
      direction: 'internal',
      kind: 'websocket',
      level: connectionMatch.groups.level,
      source: 'uvicorn.ws',
      peer: null,
      method: null,
      path: null,
      statusCode: null,
      statusText: connectionMatch.groups.state,
      summary: `WebSocket connection ${connectionMatch.groups.state}`,
      raw: line,
    }
  }

  const appMatch = line.match(APP_LOG_RE)
  if (appMatch?.groups) {
    const message = appMatch.groups.message
    const lowered = message.toLowerCase()
    const direction: EventDirection = lowered.includes('upstream') || lowered.includes('forward')
      ? 'outbound'
      : lowered.includes('connected') || lowered.includes('request')
        ? 'inbound'
        : 'internal'

    return {
      id: nextLocalId(),
      receivedAt: now,
      timestamp: appMatch.groups.timestamp,
      direction,
      kind: 'service',
      level: appMatch.groups.level,
      source: appMatch.groups.source,
      peer: null,
      method: null,
      path: null,
      statusCode: null,
      statusText: null,
      summary: message,
      raw: line,
    }
  }

  return {
    id: nextLocalId(),
    receivedAt: now,
    timestamp: null,
    direction: 'internal',
    kind: 'runtime',
    level: /error|exception|failed/i.test(line) ? 'ERROR' : 'INFO',
    source: 'stream',
    peer: null,
    method: null,
    path: null,
    statusCode: null,
    statusText: null,
    summary: line,
    raw: line,
  }
}

function normalizeStreamEvent(payload: unknown): StreamEvent {
  if (!payload || typeof payload !== 'object') {
    return parseLegacyLine(String(payload || ''))
  }

  const candidate = payload as Record<string, unknown>
  const raw = String(candidate.raw || candidate.summary || '')
  return {
    id: typeof candidate.id === 'string' ? candidate.id : nextLocalId(),
    receivedAt: typeof candidate.receivedAt === 'string' ? candidate.receivedAt : new Date().toISOString(),
    timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : null,
    direction: normalizeDirection(candidate.direction),
    kind: normalizeKind(candidate.kind),
    level: typeof candidate.level === 'string' ? candidate.level : 'INFO',
    source: typeof candidate.source === 'string' ? candidate.source : 'stream',
    peer: typeof candidate.peer === 'string' ? candidate.peer : null,
    method: typeof candidate.method === 'string' ? candidate.method : null,
    path: typeof candidate.path === 'string' ? candidate.path : null,
    statusCode: typeof candidate.statusCode === 'number' ? candidate.statusCode : null,
    statusText: typeof candidate.statusText === 'string' ? candidate.statusText : null,
    summary: typeof candidate.summary === 'string' ? candidate.summary : raw,
    raw,
  }
}

function addEvent(event: StreamEvent) {
  logs.value.push(event)
  if (logs.value.length > 2000) {
    logs.value.shift()
  }

  if (autoScroll.value) {
    scrollToBottom()
  }
}

function clearReconnectTimer() {
  if (!reconnectTimer) return
  clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function scheduleReconnect() {
  clearReconnectTimer()
  reconnectTimer = setTimeout(connectLogStream, 2000)
}

function normalizeGatewayStatus(value: unknown): GatewayProbeStatus {
  if (
    value === 'ok' ||
    value === 'pairing_required' ||
    value === 'invalid_token' ||
    value === 'missing_token' ||
    value === 'not_configured' ||
    value === 'rejected' ||
    value === 'timeout' ||
    value === 'unreachable'
  ) {
    return value
  }
  return 'unknown'
}

function normalizeMonitorPayload(payload: unknown): MonitorPayload {
  const now = new Date().toISOString()
  if (!payload || typeof payload !== 'object') {
    return {
      backend: { ok: false, status: 'unknown', service: 'agent-firewall', lastChecked: now },
      gateway: {
        configured: false,
        status: 'unknown',
        tokenValid: null,
        pairingRequired: false,
        message: 'Invalid monitor payload',
        wsUrl: null,
        configPath: null,
        hasToken: false,
        hasPassword: false,
        lastChecked: now,
      },
    }
  }

  const obj = payload as Record<string, unknown>
  const backend = (obj.backend || {}) as Record<string, unknown>
  const gateway = (obj.gateway || {}) as Record<string, unknown>

  return {
    backend: {
      ok: Boolean(backend.ok),
      status: typeof backend.status === 'string' ? backend.status : 'unknown',
      service: typeof backend.service === 'string' ? backend.service : 'agent-firewall',
      lastChecked: typeof backend.lastChecked === 'string' ? backend.lastChecked : now,
    },
    gateway: {
      configured: Boolean(gateway.configured),
      status: normalizeGatewayStatus(gateway.status),
      tokenValid: typeof gateway.tokenValid === 'boolean' ? gateway.tokenValid : null,
      pairingRequired: Boolean(gateway.pairingRequired),
      message: typeof gateway.message === 'string' ? gateway.message : '',
      wsUrl: typeof gateway.wsUrl === 'string' ? gateway.wsUrl : null,
      configPath: typeof gateway.configPath === 'string' ? gateway.configPath : null,
      hasToken: Boolean(gateway.hasToken),
      hasPassword: Boolean(gateway.hasPassword),
      lastChecked: typeof gateway.lastChecked === 'string' ? gateway.lastChecked : now,
    },
  }
}

async function fetchMonitorStatus() {
  if (monitorLoading.value) return
  monitorLoading.value = true
  try {
    const resp = await fetch(`${API_BASE}/api/monitor/status`)
    if (!resp.ok) {
      throw new Error(`Monitor API failed: ${resp.status} ${resp.statusText}`)
    }
    const payload = await resp.json()
    monitor.value = normalizeMonitorPayload(payload)
    monitorError.value = null
  } catch (err) {
    monitorError.value = err instanceof Error ? err.message : 'Failed to fetch monitor status'
  } finally {
    monitorLoading.value = false
  }
}

function connectLogStream() {
  clearReconnectTimer()
  eventSource = new EventSource(`${API_BASE}/api/logs/stream`)

  eventSource.onopen = () => {
    connected.value = true
  }

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      addEvent(normalizeStreamEvent(payload))
      return
    } catch {
      addEvent(parseLegacyLine(event.data))
    }
  }

  eventSource.onerror = () => {
    connected.value = false
    eventSource?.close()
    scheduleReconnect()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

function clearLogs() {
  logs.value = []
  selectedEventId.value = null
}

function statusClass(statusCode: number): string {
  if (statusCode >= 500) return 'status-error'
  if (statusCode >= 400) return 'status-warning'
  return 'status-ok'
}

function isErrorEvent(event: StreamEvent): boolean {
  return event.level === 'ERROR' || event.level === 'CRITICAL' || (event.statusCode !== null && event.statusCode >= 400)
}

function directionLabel(direction: EventDirection): string {
  if (direction === 'inbound') return 'IN'
  if (direction === 'outbound') return 'OUT'
  return 'INT'
}

function formatEventTime(event: StreamEvent): string {
  const raw = event.timestamp || event.receivedAt
  if (!raw) return '-'

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }

  return parsed.toLocaleString()
}

function formatMonitorTime(raw: string | undefined): string {
  if (!raw) return '-'
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleTimeString()
}

onMounted(() => {
  connectLogStream()
  void fetchMonitorStatus()
  monitorTimer = setInterval(fetchMonitorStatus, 5000)
})

onUnmounted(() => {
  eventSource?.close()
  clearReconnectTimer()
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
})
</script>

<style scoped>
.sync-monitor {
  padding: 24px;
  height: calc(100vh - 72px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.monitor-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.monitor-header p {
  margin: 6px 0 0;
  color: var(--text-secondary, #64748b);
  font-size: 13px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-scroll-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
}

.status-badge.connected {
  background: rgba(16, 185, 129, 0.15);
  color: #059669;
}

.btn-secondary {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn-secondary:hover {
  background: var(--bg-hover, #f5f5f5);
}

.health-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.health-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  padding: 12px;
  background: color-mix(in srgb, var(--panel-bg, #ffffff) 94%, #0f172a 6%);
}

.health-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.health-title-row h3 {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}

.health-pill {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}

.health-main {
  margin: 8px 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.health-message {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  word-break: break-word;
}

.health-meta {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  word-break: break-all;
}

.health-ok {
  border-color: rgba(5, 150, 105, 0.35);
}

.health-ok.health-pill {
  background: rgba(5, 150, 105, 0.14);
  color: #047857;
}

.health-warn {
  border-color: rgba(217, 119, 6, 0.35);
}

.health-warn.health-pill {
  background: rgba(217, 119, 6, 0.14);
  color: #b45309;
}

.health-error {
  border-color: rgba(220, 38, 38, 0.35);
}

.health-error.health-pill {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.health-neutral {
  border-color: rgba(71, 85, 105, 0.35);
}

.health-neutral.health-pill {
  background: rgba(71, 85, 105, 0.15);
  color: #475569;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.stat-card {
  padding: 12px 14px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-bg, #ffffff) 94%, #0f172a 6%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.stat-value.inbound {
  color: #0369a1;
}

.stat-value.outbound {
  color: #2563eb;
}

.stat-value.error {
  color: #dc2626;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  border: 1px solid var(--border-color, #d1d5db);
  background: var(--panel-bg, #ffffff);
  color: var(--text-secondary, #64748b);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}

.filter-chip span {
  background: var(--bg-muted, #f1f5f9);
  border-radius: 999px;
  min-width: 18px;
  text-align: center;
  padding: 0 4px;
  color: var(--text-primary, #0f172a);
}

.filter-chip.active {
  border-color: #0ea5e9;
  color: #0369a1;
  background: rgba(14, 165, 233, 0.08);
}

.search-input {
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 280px;
  font-size: 13px;
  color: var(--text-primary, #111827);
  background: var(--panel-bg, #ffffff);
}

.monitor-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 12px;
}

.event-list {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-bg, #ffffff) 96%, #0f172a 4%);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #64748b);
  text-align: center;
  gap: 6px;
}

.empty-state p {
  margin: 0;
  font-weight: 600;
}

.empty-state small {
  color: var(--text-secondary, #94a3b8);
}

.event-row {
  text-align: left;
  border: 1px solid var(--border-color, #e2e8f0);
  border-left: 4px solid transparent;
  border-radius: 10px;
  background: var(--panel-bg, #ffffff);
  cursor: pointer;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-row:hover {
  border-color: #93c5fd;
}

.event-row.selected {
  border-color: #0284c7;
  box-shadow: 0 0 0 1px rgba(2, 132, 199, 0.2);
}

.event-row.direction-inbound {
  border-left-color: #0ea5e9;
}

.event-row.direction-outbound {
  border-left-color: #2563eb;
}

.event-row.direction-internal {
  border-left-color: #94a3b8;
}

.event-row.error {
  border-left-color: #dc2626;
}

.event-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.direction-badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.direction-badge.inbound {
  background: rgba(14, 165, 233, 0.16);
  color: #0369a1;
}

.direction-badge.outbound {
  background: rgba(37, 99, 235, 0.16);
  color: #1d4ed8;
}

.direction-badge.internal {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}

.kind-chip {
  font-size: 10px;
  border-radius: 999px;
  padding: 2px 7px;
  border: 1px solid var(--border-color, #cbd5e1);
  color: var(--text-secondary, #64748b);
  letter-spacing: 0.04em;
}

.event-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary, #64748b);
}

.event-summary {
  margin: 0;
  color: var(--text-primary, #0f172a);
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-secondary, #64748b);
}

.status-ok {
  color: #059669;
}

.status-warning {
  color: #d97706;
}

.status-error {
  color: #dc2626;
}

.event-detail {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-bg, #ffffff) 96%, #0f172a 4%);
  padding: 14px;
  overflow-y: auto;
}

.event-detail h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--text-primary, #0f172a);
}

.event-detail h4 {
  margin: 14px 0 8px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.detail-grid div {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 8px;
  background: var(--panel-bg, #ffffff);
}

.detail-grid dt {
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-grid dd {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-primary, #0f172a);
  word-break: break-word;
}

.raw-block {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e2e8f0);
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}

.detail-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-secondary, #64748b);
  padding: 20px;
  line-height: 1.5;
}

@media (max-width: 1200px) {
  .monitor-layout {
    grid-template-columns: 1fr;
  }

  .event-detail {
    max-height: 360px;
  }
}

@media (max-width: 900px) {
  .health-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search-input {
    min-width: 220px;
    width: 100%;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .sync-monitor {
    padding: 16px;
    height: auto;
    min-height: calc(100vh - 72px);
  }

  .monitor-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
