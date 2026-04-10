import { useQuery } from '@tanstack/vue-query'
import { api } from '~/services/api'
import type {
  AnalyticsSummary,
  TimelineBucket,
  PolicyStatsRow,
  RiskFlagCount,
  IntentCount,
} from '~/types/api'

interface AuditEntryLite {
  timestamp?: number
  verdict?: string
  method?: string
  matched_patterns?: string[]
}

function verdictCounts(entries: AuditEntryLite[]) {
  let blocked = 0
  let modified = 0
  let allowed = 0

  for (const entry of entries) {
    const verdict = String(entry.verdict ?? 'ALLOW').toUpperCase()
    if (verdict === 'BLOCK') {
      blocked += 1
    } else if (verdict === 'MODIFY' || verdict === 'ESCALATE') {
      modified += 1
    } else {
      allowed += 1
    }
  }

  return { blocked, modified, allowed }
}

async function loadAuditEntries(hours: number): Promise<AuditEntryLite[]> {
  try {
    const response = await api.get<{ entries?: AuditEntryLite[] }>('/api/audit', {
      params: { limit: 2000, offset: 0 },
    })
    const raw = Array.isArray(response.data?.entries) ? response.data.entries : []
    const since = (Date.now() / 1000) - (hours * 3600)
    return raw.filter((entry) => Number(entry.timestamp ?? 0) >= since)
  } catch {
    return []
  }
}

function buildSummaryFromAudit(entries: AuditEntryLite[]): AnalyticsSummary {
  const total = entries.length
  const { blocked, modified, allowed } = verdictCounts(entries)

  return {
    total_requests: total,
    blocked,
    modified,
    allowed,
    block_rate: total > 0 ? blocked / total : 0,
    avg_risk: 0,
    avg_latency_ms: 0,
    top_intent: entries[0]?.method ?? null,
  }
}

function buildTimelineFromAudit(entries: AuditEntryLite[], hours: number): TimelineBucket[] {
  const bucketSeconds = hours <= 1 ? 300 : hours <= 24 ? 3600 : 86400
  const map = new Map<number, { total: number, blocked: number, modified: number, allowed: number }>()

  for (const entry of entries) {
    const ts = Number(entry.timestamp ?? 0)
    if (!ts) {continue}
    const key = Math.floor(ts / bucketSeconds) * bucketSeconds
    const slot = map.get(key) ?? { total: 0, blocked: 0, modified: 0, allowed: 0 }
    slot.total += 1

    const verdict = String(entry.verdict ?? 'ALLOW').toUpperCase()
    if (verdict === 'BLOCK') {
      slot.blocked += 1
    } else if (verdict === 'MODIFY' || verdict === 'ESCALATE') {
      slot.modified += 1
    } else {
      slot.allowed += 1
    }

    map.set(key, slot)
  }

  return [...map.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([timestamp, value]) => ({
      time: new Date(timestamp * 1000).toISOString(),
      total: value.total,
      blocked: value.blocked,
      modified: value.modified,
      allowed: value.allowed,
    }))
}

function buildByPolicyFromAudit(entries: AuditEntryLite[]): PolicyStatsRow[] {
  const map = new Map<string, { total: number, blocked: number, modified: number, allowed: number }>()

  for (const entry of entries) {
    const key = (entry.method || 'default').toLowerCase()
    const row = map.get(key) ?? { total: 0, blocked: 0, modified: 0, allowed: 0 }
    row.total += 1

    const verdict = String(entry.verdict ?? 'ALLOW').toUpperCase()
    if (verdict === 'BLOCK') {
      row.blocked += 1
    } else if (verdict === 'MODIFY' || verdict === 'ESCALATE') {
      row.modified += 1
    } else {
      row.allowed += 1
    }

    map.set(key, row)
  }

  return [...map.entries()].map(([policyName, value]) => ({
    policy_id: policyName,
    policy_name: policyName,
    total: value.total,
    blocked: value.blocked,
    modified: value.modified,
    allowed: value.allowed,
    block_rate: value.total > 0 ? value.blocked / value.total : 0,
    avg_risk: 0,
  }))
}

function buildTopFlagsFromAudit(entries: AuditEntryLite[]): RiskFlagCount[] {
  const counts = new Map<string, number>()
  let total = 0

  for (const entry of entries) {
    const patterns = Array.isArray(entry.matched_patterns) ? entry.matched_patterns : []
    for (const pattern of patterns) {
      counts.set(pattern, (counts.get(pattern) ?? 0) + 1)
      total += 1
    }
  }

  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([flag, count]) => ({
      flag,
      count,
      pct: total > 0 ? count / total : 0,
    }))
}

function buildIntentsFromAudit(entries: AuditEntryLite[]): IntentCount[] {
  const counts = new Map<string, number>()

  for (const entry of entries) {
    const intent = (entry.method || 'unknown').toLowerCase()
    counts.set(intent, (counts.get(intent) ?? 0) + 1)
  }

  const total = entries.length || 1
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([intent, count]) => ({
      intent,
      count,
      pct: count / total,
    }))
}

export function useAnalytics() {
  const selectedRange = ref(1)

  const timeRanges = [
    { label: '5m', value: 5 / 60 },
    { label: '15m', value: 0.25 },
    { label: '1h', value: 1 },
    { label: '24h', value: 24 },
    { label: '7d', value: 168 },
    { label: '30d', value: 720 },
  ]

  /** Adaptive polling interval: shorter ranges → faster refresh. */
  const pollInterval = computed(() => {
    const h = selectedRange.value
    if (h <= 0.25) {return 5_000}   // 5m/15m → poll every 5s
    if (h <= 1) {return 10_000}     // 1h     → poll every 10s
    return 30_000                 // 24h+   → poll every 30s
  })

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary', selectedRange],
    queryFn: async () => {
      try {
        return await api.get<AnalyticsSummary>(`/v1/analytics/summary?hours=${selectedRange.value}`).then(r => r.data)
      } catch {
        const entries = await loadAuditEntries(selectedRange.value)
        return buildSummaryFromAudit(entries)
      }
    },
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  })

  const { data: timeline, isLoading: timelineLoading, refetch: refetchTimeline } = useQuery<TimelineBucket[]>({
    queryKey: ['analytics', 'timeline', selectedRange],
    queryFn: async () => {
      try {
        return await api.get<TimelineBucket[]>(`/v1/analytics/timeline?hours=${selectedRange.value}`).then(r => r.data)
      } catch {
        const entries = await loadAuditEntries(selectedRange.value)
        return buildTimelineFromAudit(entries, selectedRange.value)
      }
    },
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  })

  const { data: byPolicy, isLoading: byPolicyLoading, refetch: refetchByPolicy } = useQuery<PolicyStatsRow[]>({
    queryKey: ['analytics', 'by-policy', selectedRange],
    queryFn: async () => {
      try {
        return await api.get<PolicyStatsRow[]>(`/v1/analytics/by-policy?hours=${selectedRange.value}`).then(r => r.data)
      } catch {
        const entries = await loadAuditEntries(selectedRange.value)
        return buildByPolicyFromAudit(entries)
      }
    },
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  })

  const { data: topFlags, isLoading: topFlagsLoading, refetch: refetchTopFlags } = useQuery<RiskFlagCount[]>({
    queryKey: ['analytics', 'top-flags', selectedRange],
    queryFn: async () => {
      try {
        return await api.get<RiskFlagCount[]>(`/v1/analytics/top-flags?hours=${selectedRange.value}`).then(r => r.data)
      } catch {
        const entries = await loadAuditEntries(selectedRange.value)
        return buildTopFlagsFromAudit(entries)
      }
    },
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  })

  const { data: intents, isLoading: intentsLoading, refetch: refetchIntents } = useQuery<IntentCount[]>({
    queryKey: ['analytics', 'intents', selectedRange],
    queryFn: async () => {
      try {
        return await api.get<IntentCount[]>(`/v1/analytics/intents?hours=${selectedRange.value}`).then(r => r.data)
      } catch {
        const entries = await loadAuditEntries(selectedRange.value)
        return buildIntentsFromAudit(entries)
      }
    },
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  })

  function refreshAll() {
    void refetchSummary()
    void refetchTimeline()
    void refetchByPolicy()
    void refetchTopFlags()
    void refetchIntents()
  }

  const isRefreshing = computed(() =>
    summaryLoading.value || timelineLoading.value || byPolicyLoading.value
    || topFlagsLoading.value || intentsLoading.value,
  )

  return {
    selectedRange,
    timeRanges,
    summary,
    summaryLoading,
    timeline,
    timelineLoading,
    byPolicy,
    byPolicyLoading,
    topFlags,
    topFlagsLoading,
    intents,
    intentsLoading,
    refreshAll,
    isRefreshing,
  }
}
