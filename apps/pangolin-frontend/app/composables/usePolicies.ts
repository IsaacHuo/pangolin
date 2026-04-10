import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api } from '~/services/api'
import type { Policy } from '~/types/api'

const LOCAL_POLICIES_KEY = 'pangolin.local.policies.v1'

const BUILTIN_POLICIES: Policy[] = [
  {
    id: 'builtin-fast',
    name: 'fast',
    description: 'Low latency with minimal filtering.',
    config: {
      nodes: ['static'],
      thresholds: { max_risk: 0.95 },
    },
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-balanced',
    name: 'balanced',
    description: 'Recommended default with static + semantic checks.',
    config: {
      nodes: ['static', 'semantic'],
      thresholds: { max_risk: 0.7 },
    },
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-strict',
    name: 'strict',
    description: 'High sensitivity for adversarial and policy risks.',
    config: {
      nodes: ['static', 'semantic', 'pii'],
      thresholds: { max_risk: 0.45 },
    },
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-paranoid',
    name: 'paranoid',
    description: 'Maximum protection with aggressive blocking.',
    config: {
      nodes: ['static', 'semantic', 'pii', 'output-filter'],
      thresholds: { max_risk: 0.3 },
    },
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
]

const BUILTIN_POLICY_NAMES = new Set(BUILTIN_POLICIES.map(policy => policy.name.toLowerCase()))
const LEGACY_DEFAULT_MARKERS = new Set(['default', 'default policy'])

function nowIso(): string {
  return new Date().toISOString()
}

function isLegacyDefaultPolicy(policy: Policy): boolean {
  const id = String(policy.id ?? '').trim().toLowerCase()
  const name = String(policy.name ?? '').trim().toLowerCase()
  const description = String(policy.description ?? '').trim().toLowerCase()

  if (!name && !id) {
    return false
  }

  return (
    LEGACY_DEFAULT_MARKERS.has(name)
    || LEGACY_DEFAULT_MARKERS.has(id)
    || description.includes('default zero-trust policy')
  )
}

function isLegacyDefaultList(policies: Policy[]): boolean {
  return policies.length === 1 && isLegacyDefaultPolicy(policies[0]!)
}

function buildLocalPolicy(body: {
  name: string
  description?: string
  config?: Record<string, unknown>
  is_active?: boolean
}): Policy {
  const stamp = nowIso()
  return {
    id: `custom-${crypto.randomUUID()}`,
    name: body.name,
    description: body.description ?? null,
    config: body.config ?? {},
    is_active: body.is_active ?? true,
    version: 1,
    created_at: stamp,
    updated_at: stamp,
  }
}

function readLocalCustomPolicies(): Policy[] {
  if (typeof window === 'undefined') {return []}
  try {
    const raw = localStorage.getItem(LOCAL_POLICIES_KEY)
    if (!raw) {return []}
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return (parsed as Policy[]).filter((policy) => {
      const name = String(policy.name ?? '').trim().toLowerCase()
      if (!name) {
        return false
      }
      if (BUILTIN_POLICY_NAMES.has(name)) {
        return false
      }
      if (isLegacyDefaultPolicy(policy)) {
        return false
      }
      return true
    })
  } catch {
    return []
  }
}

function writeLocalCustomPolicies(policies: Policy[]): void {
  if (typeof window === 'undefined') {return}
  localStorage.setItem(LOCAL_POLICIES_KEY, JSON.stringify(policies))
}

function mergePolicies(custom: Policy[]): Policy[] {
  return [...BUILTIN_POLICIES, ...custom]
}

function mergeServerAndLocalPolicies(serverPolicies: Policy[]): Policy[] {
  const localCustom = readLocalCustomPolicies()
  if (!localCustom.length) {
    return serverPolicies
  }

  const mergedByName = new Map<string, Policy>()
  for (const policy of serverPolicies) {
    mergedByName.set(policy.name.trim().toLowerCase(), policy)
  }
  for (const policy of localCustom) {
    const key = policy.name.trim().toLowerCase()
    if (!mergedByName.has(key)) {
      mergedByName.set(key, policy)
    }
  }

  return [...mergedByName.values()]
}

function upsertLocalCustomPolicy(policy: Policy): Policy {
  const name = policy.name.trim().toLowerCase()
  if (!name || BUILTIN_POLICY_NAMES.has(name) || isLegacyDefaultPolicy(policy)) {
    return policy
  }

  const custom = readLocalCustomPolicies()
  const key = policy.name.trim().toLowerCase()
  const index = custom.findIndex(item => item.id === policy.id || item.name.trim().toLowerCase() === key)
  if (index >= 0) {
    custom[index] = policy
  } else {
    custom.push(policy)
  }
  writeLocalCustomPolicies(custom)
  return policy
}

function removeLocalCustomPolicy(policyId: string): void {
  const custom = readLocalCustomPolicies()
  const next = custom.filter(policy => policy.id !== policyId)
  if (next.length !== custom.length) {
    writeLocalCustomPolicies(next)
  }
}

async function loadPolicies(): Promise<Policy[]> {
  try {
    const response = await api.get<Policy[]>('/v1/policies?active_only=false')
    if (Array.isArray(response.data)) {
      if (isLegacyDefaultList(response.data)) {
        return mergePolicies(readLocalCustomPolicies())
      }
      return mergeServerAndLocalPolicies(response.data)
    }
    return mergePolicies(readLocalCustomPolicies())
  } catch {
    return mergePolicies(readLocalCustomPolicies())
  }
}

export const usePolicies = () => {
  const queryClient = useQueryClient()

  const { data: policies, isLoading, error, refetch } = useQuery<Policy[]>({
    queryKey: ['policies'],
    queryFn: loadPolicies,
    staleTime: 0,
  })

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; description?: string; config?: Record<string, unknown>; is_active?: boolean }) => {
      try {
        const created = await api.post<Policy>('/v1/policies', body).then(r => r.data)
        if (!isLegacyDefaultPolicy(created)) {
          return created
        }
      } catch {
        // Fall through to local persistence.
      }

      const fallback = buildLocalPolicy(body)
      return upsertLocalCustomPolicy(fallback)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['policies'] }) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      try {
        const updated = await api.patch<Policy>(`/v1/policies/${id}`, body).then(r => r.data)
        if (!isLegacyDefaultPolicy(updated)) {
          return updated
        }
      } catch {
        // Fall through to local persistence.
      }

      const custom = readLocalCustomPolicies()
      const foundInCustom = custom.find((policy) => policy.id === id)
      if (foundInCustom) {
        const updated = {
          ...foundInCustom,
          ...body,
          version: foundInCustom.version + 1,
          updated_at: nowIso(),
        } as Policy
        return upsertLocalCustomPolicy(updated)
      }

      const builtin = BUILTIN_POLICIES.find((policy) => policy.id === id)
      if (!builtin) {
        throw new Error('Policy not found')
      }
      return {
        ...builtin,
        ...body,
        version: builtin.version + 1,
        updated_at: nowIso(),
      } as Policy
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['policies'] }) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        const response = await api.delete(`/v1/policies/${id}`)
        removeLocalCustomPolicy(id)
        return response
      } catch {
        removeLocalCustomPolicy(id)
        return { data: { ok: true } }
      }
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['policies'] }) },
  })

  return {
    policies,
    isLoading,
    error,
    refetch,
    createPolicy: createMutation.mutateAsync,
    updatePolicy: updateMutation.mutateAsync,
    deletePolicy: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
