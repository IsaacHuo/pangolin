<template>
  <div class="traces-page">
    <div class="page-header">
      <h2>Traces</h2>
      <div class="header-actions">
        <button class="btn-secondary" :disabled="loading" @click="loadTraces">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="loading && traces.length === 0" class="loading-state">
      <p>Loading traces...</p>
    </div>

    <div v-else-if="traces.length === 0" class="empty-state">
      <p>No traces available</p>
      <p class="hint">Traces will appear here as requests are processed by the firewall</p>
    </div>

    <div v-else class="traces-container">
      <div class="traces-list">
        <div
          v-for="trace in traces"
          :key="trace.id"
          class="trace-item"
          :class="{ active: selectedTraceId === trace.id }"
          @click="selectTrace(trace.id)"
        >
          <div class="trace-header">
            <span class="trace-id">{{ trace.id.substring(0, 8) }}</span>
            <span v-if="trace.verdict" class="verdict-badge" :class="trace.verdict.toLowerCase()">
              {{ trace.verdict }}
            </span>
          </div>
          <div class="trace-meta">
            <span class="trace-time">{{ formatTime(trace.timestamp) }}</span>
            <span class="trace-messages">{{ trace.messages?.length || 0 }} messages</span>
          </div>
        </div>
      </div>

      <div class="trace-viewer">
        <TraceView
          v-if="selectedTrace"
          :trace="selectedTrace.messages || []"
          :trace-id="selectedTrace.id"
          :title="`Trace ${selectedTrace.id.substring(0, 8)}`"
          :side-by-side="false"
        />
        <div v-else class="no-selection">
          <p>Select a trace to view details</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import TraceView from './TraceView/TraceView.vue'

interface Trace {
  id: string
  session_id: string
  timestamp: number
  verdict?: string
  threat_level?: string
  messages: Array<{
    role: string
    content: string | null
    tool_calls?: any[]
    tool_call_id?: string | number | null
  }>
  analysis?: {
    verdict: string
    threat_level: string
  }
}

// State
const traces = ref<Trace[]>([])
const loading = ref(false)
const selectedTraceId = ref<string | null>(null)

// Computed
const selectedTrace = computed(() => {
  if (!selectedTraceId.value) return null
  return traces.value.find(t => t.id === selectedTraceId.value) || null
})

// Methods
async function loadTraces() {
  loading.value = true
  try {
    const response = await fetch('/api/v1/trace?limit=50')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    traces.value = data.traces || []

    // Auto-select first trace if none selected
    if (traces.value.length > 0 && !selectedTraceId.value) {
      selectedTraceId.value = traces.value[0].id
    }
  } catch (error) {
    console.error('Failed to load traces:', error)
    // Show empty state instead of alert
    traces.value = []
  } finally {
    loading.value = false
  }
}

function selectTrace(id: string) {
  selectedTraceId.value = id
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Lifecycle
onMounted(() => {
  loadTraces()
})
</script>

<style scoped>
.traces-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary, #333);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover, #e8e8e8);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary, #666);
  text-align: center;
}

.empty-state .hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-muted, #999);
}

.traces-container {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.traces-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 4px;
}

.trace-item {
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: var(--bg-primary, #ffffff);
  cursor: pointer;
  transition: all 0.2s;
}

.trace-item:hover {
  border-color: var(--primary-color, #007bff);
  background: var(--bg-hover, #f8f9fa);
}

.trace-item.active {
  border-color: var(--primary-color, #007bff);
  background: var(--accent-muted, rgba(0, 123, 255, 0.05));
}

.trace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.trace-id {
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.verdict-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.verdict-badge.allow {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.verdict-badge.block {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.verdict-badge.escalate {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.trace-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.trace-viewer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #666);
  font-size: 14px;
}
</style>
