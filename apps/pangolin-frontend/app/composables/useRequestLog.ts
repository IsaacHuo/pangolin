import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { api } from '~/services/api'
import type { RequestDetail, RequestRead, PaginatedResponse, RequestFilters } from '~/types/api'

interface AuditListResponse {
  entries?: Array<Record<string, unknown>>
}

function threatToRisk(threat: unknown): number {
  const t = String(threat ?? '').toUpperCase()
  if (t === 'CRITICAL') {return 0.95}
  if (t === 'HIGH') {return 0.8}
  if (t === 'MEDIUM') {return 0.55}
  if (t === 'LOW') {return 0.25}
  return 0.05
}

function toIsoTimestamp(value: unknown): string {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return new Date().toISOString()
  }
  return new Date(numeric * 1000).toISOString()
}

function mapAuditEntryToRead(entry: Record<string, unknown>): RequestRead {
  const id = String(entry.id ?? `${entry.session_id ?? 'session'}-${entry.timestamp ?? Date.now()}`)
  const matchedPatterns = Array.isArray(entry.matched_patterns) ? entry.matched_patterns as string[] : []
  const threatLevel = entry.threat_level

  return {
    id,
    client_id: String(entry.session_id ?? 'chat-lab'),
    policy_id: 'balanced',
    policy_name: 'balanced',
    intent: String(entry.method ?? 'chat/completions'),
    prompt_preview: entry.payload_preview ? String(entry.payload_preview) : null,
    decision: String(entry.verdict ?? 'ALLOW').toUpperCase() as RequestRead['decision'],
    risk_score: threatToRisk(threatLevel),
    risk_flags: matchedPatterns.length > 0 ? { matched_patterns: matchedPatterns } : null,
    latency_ms: null,
    model_used: null,
    tokens_in: null,
    tokens_out: null,
    blocked_reason: null,
    response_masked: null,
    created_at: toIsoTimestamp(entry.timestamp),
  }
}

function mapAuditEntryToDetail(entry: Record<string, unknown>): RequestDetail {
  const base = mapAuditEntryToRead(entry)
  return {
    ...base,
    prompt_hash: null,
    scanner_results: {
      matched_patterns: Array.isArray(entry.matched_patterns) ? entry.matched_patterns : [],
      threat_level: entry.threat_level ?? 'NONE',
    },
    output_filter_results: null,
    node_timings: null,
  }
}

function applyReadFilters(items: RequestRead[], filters: RequestFilters): RequestRead[] {
  return items.filter((item) => {
    if (filters.decision && item.decision !== filters.decision) {return false}
    if (filters.policy_id && item.policy_id !== filters.policy_id) {return false}
    if (filters.intent && item.intent !== filters.intent) {return false}
    if (filters.risk_min != null && (item.risk_score ?? 0) < filters.risk_min) {return false}
    if (filters.risk_max != null && (item.risk_score ?? 0) > filters.risk_max) {return false}
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const haystack = `${item.prompt_preview ?? ''} ${item.intent ?? ''} ${item.client_id}`.toLowerCase()
      if (!haystack.includes(q)) {return false}
    }
    if (filters.from && item.created_at < filters.from) {return false}
    if (filters.to && item.created_at > filters.to) {return false}
    return true
  })
}

export function useRequestLog() {
  const _queryClient = useQueryClient()

  const filters = ref<RequestFilters>({
    decision: null,
    policy_id: null,
    intent: null,
    risk_min: null,
    risk_max: null,
    search: null,
    from: null,
    to: null,
  })

  const page = ref(1)
  const pageSize = ref(25)
  const sortBy = ref('created_at')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  const { data, isLoading, error, refetch } = useQuery<PaginatedResponse<RequestRead>>({
    queryKey: ['requests', filters, page, pageSize, sortBy, sortOrder] as const,
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('page', String(page.value))
      params.set('page_size', String(pageSize.value))
      params.set('sort', sortBy.value)
      params.set('order', sortOrder.value)

      const f = filters.value
      if (f.decision) {params.set('decision', f.decision)}
      if (f.policy_id) {params.set('policy_id', f.policy_id)}
      if (f.intent) {params.set('intent', f.intent)}
      if (f.risk_min != null) {params.set('risk_min', String(f.risk_min))}
      if (f.risk_max != null) {params.set('risk_max', String(f.risk_max))}
      if (f.search) {params.set('search', f.search)}
      if (f.from) {params.set('from', f.from)}
      if (f.to) {params.set('to', f.to)}

      try {
        const { data: resp } = await api.get<PaginatedResponse<RequestRead>>(
          `/v1/requests?${params.toString()}`,
        )
        return resp
      } catch {
        const { data: audit } = await api.get<AuditListResponse>('/api/audit', {
          params: { limit: 500, offset: 0 },
        })

        let mapped = (audit.entries ?? []).map(mapAuditEntryToRead)
        mapped = applyReadFilters(mapped, filters.value)

        mapped = [...mapped].toSorted((left, right) => {
          const leftValue = left[sortBy.value as keyof RequestRead]
          const rightValue = right[sortBy.value as keyof RequestRead]
          const leftComparable = leftValue == null ? '' : String(leftValue)
          const rightComparable = rightValue == null ? '' : String(rightValue)
          return sortOrder.value === 'asc'
            ? leftComparable.localeCompare(rightComparable)
            : rightComparable.localeCompare(leftComparable)
        })

        const start = (page.value - 1) * pageSize.value
        const end = start + pageSize.value
        const items = mapped.slice(start, end)
        const total = mapped.length

        return {
          items,
          total,
          page: page.value,
          page_size: pageSize.value,
          pages: Math.max(1, Math.ceil(total / pageSize.value)),
        }
      }
    },
    placeholderData: (prev) => prev,
  })

  async function fetchDetail(id: string): Promise<RequestDetail> {
    try {
      const { data: resp } = await api.get<RequestDetail>(`/v1/requests/${id}`)
      return resp
    } catch {
      const { data: audit } = await api.get<AuditListResponse>('/api/audit', {
        params: { limit: 500, offset: 0 },
      })
      const found = (audit.entries ?? []).find((entry) => String(entry.id ?? '') === id)
      if (!found) {
        throw new Error('Request detail not found')
      }
      return mapAuditEntryToDetail(found)
    }
  }

  function resetFilters() {
    filters.value = {
      decision: null,
      policy_id: null,
      intent: null,
      risk_min: null,
      risk_max: null,
      search: null,
      from: null,
      to: null,
    }
    page.value = 1
  }

  const hasActiveFilters = computed(() => {
    const f = filters.value
    return !!(f.decision || f.policy_id || f.intent || f.search || f.from || f.to || f.risk_min != null || f.risk_max != null)
  })

  return {
    data,
    isLoading,
    error,
    filters,
    page,
    pageSize,
    sortBy,
    sortOrder,
    fetchDetail,
    refetch,
    resetFilters,
    hasActiveFilters,
  }
}
