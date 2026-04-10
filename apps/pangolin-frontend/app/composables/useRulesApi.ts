import { api } from '~/services/api'
import type { Rule, RuleCreate, RuleTestResult, RuleUpdate } from '~/types/api'

interface BackendPatternRule {
  id: string
  name?: string
  pattern: string
  type?: string
  action?: string
  threat_level?: string
  description?: string
  created_at?: number
  updated_at?: number
}

interface BackendRulesPayload {
  pattern_rules?: BackendPatternRule[]
}

interface BackendV1RulesPayload {
  items?: Rule[]
}

function fromEpoch(value: number | undefined): string {
  if (!value) {return new Date().toISOString()}
  return new Date(value * 1000).toISOString()
}

function toAction(value: string | undefined): Rule['action'] {
  const upper = (value ?? '').toUpperCase()
  if (upper === 'BLOCK') {return 'block'}
  if (upper === 'FLAG') {return 'flag'}
  return 'score_boost'
}

function toSeverity(value: string | undefined): Rule['severity'] {
  const lower = (value ?? 'medium').toLowerCase()
  if (lower === 'low' || lower === 'medium' || lower === 'high' || lower === 'critical') {
    return lower
  }
  return 'medium'
}

function toBackendAction(value: Rule['action'] | undefined): string {
  if (value === 'flag') {return 'FLAG'}
  if (value === 'score_boost') {return 'SCORE_BOOST'}
  return 'BLOCK'
}

function toBackendThreat(value: Rule['severity'] | undefined): string {
  return (value ?? 'medium').toUpperCase()
}

function mapBackendRule(rule: BackendPatternRule): Rule {
  return {
    id: rule.id,
    policy_id: 'balanced',
    phrase: rule.pattern,
    category: rule.name || 'custom',
    is_regex: (rule.type ?? 'literal').toLowerCase() === 'regex',
    action: toAction(rule.action),
    severity: toSeverity(rule.threat_level),
    description: rule.description ?? '',
    created_at: fromEpoch(rule.created_at),
    updated_at: fromEpoch(rule.updated_at),
  }
}

function applyFilters(rules: Rule[], params?: { category?: string, action?: string, search?: string }): Rule[] {
  if (!params) {return rules}
  return rules.filter((rule) => {
    if (params.category && rule.category !== params.category) {return false}
    if (params.action && rule.action !== params.action) {return false}
    if (params.search) {
      const q = params.search.toLowerCase()
      if (!rule.phrase.toLowerCase().includes(q) && !rule.description.toLowerCase().includes(q) && !rule.category.toLowerCase().includes(q)) {
        return false
      }
    }
    return true
  })
}

function normalizeV1RulesPayload(payload: Rule[] | BackendV1RulesPayload): Rule[] {
  if (Array.isArray(payload)) {
    return payload
  }
  if (Array.isArray(payload.items)) {
    return payload.items
  }
  return []
}

export function useRulesApi() {
  const listRules = async (params?: { category?: string, action?: string, search?: string }) => {
    try {
      const payload = await api
        .get<Rule[] | BackendV1RulesPayload>('/v1/rules', { params })
        .then(r => r.data)
      return applyFilters(normalizeV1RulesPayload(payload), params)
    } catch {
      const payload = await api.get<BackendRulesPayload>('/api/rules').then(r => r.data)
      const mapped = (payload.pattern_rules ?? []).map(mapBackendRule)
      return applyFilters(mapped, params)
    }
  }

  const createRule = async (data: RuleCreate) => {
    try {
      return await api.post<Rule>('/v1/rules', data).then(r => r.data)
    } catch {
      const created = await api.post<BackendPatternRule>('/api/rules/patterns', {
        name: data.category ?? 'custom',
        pattern: data.phrase,
        type: data.is_regex ? 'regex' : 'literal',
        action: toBackendAction(data.action),
        threat_level: toBackendThreat(data.severity),
        description: data.description ?? '',
      }).then(r => r.data)
      return mapBackendRule(created)
    }
  }

  const updateRule = async (ruleId: string, data: RuleUpdate) => {
    try {
      return await api.patch<Rule>(`/v1/rules/${ruleId}`, data).then(r => r.data)
    } catch {
      const updated = await api.put<BackendPatternRule>('/api/rules/patterns', {
        id: ruleId,
        name: data.category,
        pattern: data.phrase,
        type: data.is_regex === undefined ? undefined : data.is_regex ? 'regex' : 'literal',
        action: data.action ? toBackendAction(data.action) : undefined,
        threat_level: data.severity ? toBackendThreat(data.severity) : undefined,
        description: data.description,
      }).then(r => r.data)
      return mapBackendRule(updated)
    }
  }

  const deleteRule = async (ruleId: string) => {
    try {
      return await api.delete(`/v1/rules/${ruleId}`)
    } catch {
      return await api.delete(`/api/rules/patterns/${ruleId}`)
    }
  }

  const bulkImport = async (rules: RuleCreate[]) => {
    try {
      return await api.post<{ created: number, skipped: number }>(
        '/v1/rules/import',
        { rules },
      ).then(r => r.data)
    } catch {
      let created = 0
      let skipped = 0
      for (const rule of rules) {
        try {
          await createRule(rule)
          created += 1
        } catch {
          skipped += 1
        }
      }
      return { created, skipped }
    }
  }

  const exportRules = async () => {
    try {
      return await api.get<Rule[]>('/v1/rules/export').then(r => r.data)
    } catch {
      return await listRules()
    }
  }

  const testRules = async (text: string) => {
    try {
      return await api.post<RuleTestResult[]>(
        '/v1/rules/test',
        { text },
      ).then(r => r.data)
    } catch {
      const rules = await listRules()
      const matches: RuleTestResult[] = []

      for (const rule of rules) {
        let matched = false
        let details: string | null = null
        if (rule.is_regex) {
          try {
            const regex = new RegExp(rule.phrase, 'i')
            const result = regex.exec(text)
            matched = Boolean(result)
            details = result ? `Matched: ${result[0]}` : null
          } catch {
            matched = false
            details = 'Invalid regex pattern'
          }
        } else {
          matched = text.toLowerCase().includes(rule.phrase.toLowerCase())
          details = matched ? `Matched literal: ${rule.phrase}` : null
        }

        if (matched) {
          matches.push({
            matched: true,
            phrase: rule.phrase,
            category: rule.category,
            action: rule.action,
            severity: rule.severity,
            is_regex: rule.is_regex,
            description: rule.description,
            match_details: details,
          })
        }
      }

      return matches
    }
  }

  return { listRules, createRule, updateRule, deleteRule, bulkImport, exportRules, testRules }
}
