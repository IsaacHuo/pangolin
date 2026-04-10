/**
 * Unified semantic color system for the entire product.
 *
 * Color semantics:
 *   BLOCK / danger     → error (red accent)
 *   MODIFY / caution   → warning (neutral gray)
 *   ALLOW / safe       → success (neutral gray)
 *   TOTAL / neutral    → primary / info (grayscale)
 *   Brand / navigation → secondary (grayscale)
 *
 * Hex palette (light theme reference):
 *   error:   #C53B31  — reserved for critical risk only
 *   primary: #151515  — headline neutral
 *   secondary/info/warning/success: grayscale tones
 */

// ─── Decision colors ───────────────────────────────────────
export type Decision = 'ALLOW' | 'MODIFY' | 'BLOCK' | 'REDACT'

/** Vuetify color name for a pipeline decision */
export function decisionColor(decision: string | undefined | null): string {
  switch (decision) {
    case 'BLOCK': return 'error'
    case 'MODIFY': return 'warning'
    case 'ALLOW': return 'success'
    case 'REDACT': return 'warning'
    default: return 'grey'
  }
}

/** MDI icon for a pipeline decision */
export function decisionIcon(decision: string | undefined | null): string {
  switch (decision) {
    case 'BLOCK': return 'mdi-shield-off'
    case 'MODIFY': return 'mdi-shield-edit'
    case 'ALLOW': return 'mdi-shield-check'
    default: return 'mdi-shield-outline'
  }
}

/** Human-readable label: "BLOCKED — reason" */
export function decisionLabel(decision: string | undefined | null, reason?: string | null): string {
  const base = decision === 'BLOCK' ? 'Blocked'
    : decision === 'MODIFY' ? 'Modified'
    : decision === 'ALLOW' ? 'Allowed'
    : String(decision ?? 'Unknown')
  return reason ? `${base} — ${reason}` : base
}

// ─── Risk score colors ─────────────────────────────────────
// 4-tier scale: grayscale → red (critical only)
export function riskColor(score: number | null | undefined): string {
  if (score == null) {return 'grey'}
  if (score < 0.25) {return 'success'}
  if (score < 0.50) {return 'info'}
  if (score < 0.75) {return 'warning'}
  return 'error'
}

/** CSS class variant for inline text coloring */
export function riskTextColor(score: number | null | undefined): string {
  if (score == null) {return 'text-grey'}
  if (score < 0.25) {return 'text-success'}
  if (score < 0.50) {return 'text-info'}
  if (score < 0.75) {return 'text-warning'}
  return 'text-error'
}

// ─── Risk flag colors ──────────────────────────────────────
/** Vuetify color for a risk flag chip — accent only, not screaming */
export function flagColor(key: string, val?: unknown): string {
  // High-severity security flags → red accent
  if (key.includes('injection') || key === 'promptinjection') {return 'error'}
  if (key.includes('denylist') || key.includes('custom')) {return 'error'}
  if (key.includes('jailbreak')) {return 'error'}

  // Non-critical tags use neutral hierarchy
  if (key.includes('pii')) {return 'warning'}
  if (key.includes('toxicity') || key.includes('harm')) {return 'warning'}
  if (key.includes('suspicious')) {return 'info'}
  if (key.includes('secrets')) {return 'info'}

  // Numeric score-based
  if (typeof val === 'number') {
    if (val >= 0.7) {return 'error'}
    if (val >= 0.3) {return 'warning'}
  }
  if (val === true) {return 'warning'}

  return 'grey'
}

/** Flag color for analytics flag list */
export const FLAG_COLORS: Record<string, string> = {
  denylist_hit: 'error',
  denylist: 'error',
  promptinjection: 'error',
  injection: 'error',
  jailbreak: 'error',
  pii_detected: 'warning',
  pii: 'warning',
  pii_count: 'warning',
  toxicity: 'warning',
  secrets: 'info',
  suspicious_intent: 'info',
  score_boost: 'info',
}

export function analyticsFlagColor(flag: string): string {
  return FLAG_COLORS[flag] ?? 'grey'
}

// ─── Rule action/severity colors ───────────────────────────
export function actionColor(action: string): string {
  const map: Record<string, string> = { block: 'error', flag: 'warning', score_boost: 'info' }
  return map[action] ?? 'default'
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = { critical: 'error', high: 'warning', medium: 'info', low: 'secondary' }
  return map[severity] ?? 'default'
}

// ─── Policy colors ─────────────────────────────────────────
export function policyColor(name: string): string {
  const map: Record<string, string> = {
    fast: 'success',
    balanced: 'info',
    strict: 'secondary',
    paranoid: 'primary',
  }
  return map[name] ?? 'grey'
}

// ─── Chart hex colors ──────────────────────────────────────
// These match the Vuetify theme but as hex values for ECharts
export const CHART = {
  // Decision series
  total:    '#202020',
  blocked:  '#C53B31',
  modified: '#6A6A6A',
  allowed:  '#9B9B9B',

  // Grid / axis
  gridLine:  'rgba(0, 0, 0, 0.08)',
  axisLine:  'rgba(0, 0, 0, 0.18)',
  axisLabel: 'rgba(0, 0, 0, 0.55)',

  // Policy-specific (chart bars)
  policyFast:      '#BEBEBE',
  policyBalanced:  '#8F8F8F',
  policyStrict:    '#5F5F5F',
  policyParanoid:  '#2E2E2E',
  policyDefault:   '#A7A7A7',

  // Intents donut — neutral grayscale palette
  intents: [
    '#1E1E1E',
    '#353535',
    '#4A4A4A',
    '#5D5D5D',
    '#6F6F6F',
    '#818181',
    '#949494',
    '#A8A8A8',
    '#BCBCBC',
    '#D0D0D0',
  ],
} as const

// ─── Slider / threshold color ──────────────────────────────
export function sliderColor(val: number): string {
  if (val < 0.4) {return 'success'}
  if (val < 0.7) {return 'warning'}
  return 'error'
}

// ─── Health status colors ──────────────────────────────────
export function healthStatusColor(status: string): string {
  switch (status) {
    case 'ok': return 'success'
    case 'degraded': return 'warning'
    case 'error': return 'error'
    default: return 'grey'
  }
}

export function resourceBarColor(percent: number): string {
  if (percent >= 90) {return 'error'}
  if (percent >= 70) {return 'warning'}
  return 'success'
}

// ─── Intent label ──────────────────────────────────────────
const INTENT_LABELS: Record<string, string> = {
  prompt_injection: 'prompt injection attempt',
  jailbreak: 'jailbreak attempt',
  agent_exfiltration: 'attempted data exfiltration',
  data_leak: 'data leak attempt',
  social_engineering: 'social engineering attempt',
  system_sabotage: 'system sabotage attempt',
  pii_leak: 'PII exposure detected',
  harmful_content: 'harmful content detected',
  off_topic: 'off-topic request blocked',
  suspicious_intent: 'suspicious intent detected',
  order_query: 'order query',
  excessive_agency: 'excessive agency attempt',
}

export function intentLabel(intent: string | null | undefined): string {
  if (!intent) {return 'unknown'}
  return INTENT_LABELS[intent] ?? intent.replace(/_/g, ' ')
}
