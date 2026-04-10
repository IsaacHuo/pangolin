<template>
  <div
    class="chat-message"
    :class="[`chat-message--${message.role}`, { 'chat-message--verdict': isVerdict }]"
  >
    <v-avatar size="32" class="chat-message__avatar">
      <v-icon>{{ avatarIcon }}</v-icon>
    </v-avatar>

    <!-- ═══ VERDICT CARD ═══ -->
    <div
      v-if="isVerdict"
      class="verdict-card"
      :class="`verdict-card--${decision!.decision.toLowerCase()}`"
    >
      <v-expansion-panels variant="accordion" elevation="0" class="bg-transparent w-100">
        <v-expansion-panel elevation="0" class="bg-transparent" style="background: transparent">
          <v-expansion-panel-title class="pa-0 min-height-0" style="min-height: auto">
            <!-- 1 · VERDICT — first and loudest -->
            <div class="verdict-card__header mb-0 w-100">
              <v-icon class="verdict-card__status-icon" size="24">{{ verdictIcon }}</v-icon>
              <div class="verdict-card__headline">
                <span class="verdict-card__word">{{ verdictWord }}</span>
                <span class="verdict-card__dash text-medium-emphasis">—</span>
                <span class="verdict-card__short-reason text-medium-emphasis">{{ verdictReason }}</span>
              </div>
            </div>
          </v-expansion-panel-title>
          
          <v-expansion-panel-text class="px-0 pt-3 pb-0">
            <!-- 2 · HUMAN-READABLE REASON -->
            <p v-if="humanReason" class="verdict-card__explain">
              {{ humanReason }}
            </p>

            <!-- 3 · SECURITY SUMMARY — compact secondary row -->
            <div class="verdict-card__meta">
              <div class="verdict-card__kv">
                <span class="verdict-card__label">Risk</span>
                <span class="text-caption font-weight-bold" :class="riskTextClass">{{ riskPercent }}%</span>
              </div>
              <v-progress-linear
                :model-value="decision!.riskScore * 100"
                :color="riskBarColor"
                height="3"
                rounded
                class="verdict-card__bar"
              />
              <div class="verdict-card__kv">
                <span class="verdict-card__label">Action</span>
                <v-chip size="x-small" label variant="outlined" class="verdict-card__action-chip">
                  {{ decision!.decision }}
                </v-chip>
              </div>
              <div v-if="decision!.intent" class="verdict-card__kv">
                <span class="verdict-card__label">Intent</span>
                <span class="text-caption">{{ decision!.intent }}</span>
              </div>
            </div>

            <!-- 4 · POLICY SIGNALS — chips in own labeled section -->
            <div v-if="topFlags.length" class="verdict-card__section">
              <span class="verdict-card__section-title">Matched signals</span>
              <div class="verdict-card__signals">
                <v-chip
                  v-for="f in topFlags"
                  :key="f.key"
                  :color="flagChipColor(f.key, f.value)"
                  size="x-small"
                  label
                  variant="outlined"
                >
                  {{ f.key }}
                </v-chip>
              </div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- 5 · RESPONSE CONTENT — at the bottom, quietest -->
      <div v-if="cleanContent" class="verdict-card__body mt-2">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify -->
        <div class="text-body-2 chat-message__content verdict-card__response" v-html="renderedClean" />
      </div>
    </div>

    <!-- ═══ REGULAR BUBBLE ═══ -->
    <div
      v-else
      class="d-flex flex-column"
      :style="{ alignItems: message.role === 'user' ? 'flex-end' : 'flex-start', minWidth: 0, flex: 1 }"
    >
      <v-card
        color="surface"
        variant="flat"
        class="chat-message__bubble"
      >
      <v-card-text class="text-body-1 chat-message__content px-3 py-2">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify -->
        <div v-if="renderedRaw" v-html="renderedRaw" />
        
        <!-- ═══ TOOL CALLS ═══ -->
        <div v-if="toolCards.length" :class="{ 'mt-2': renderedRaw }">
          <v-expansion-panels
            v-for="tool in toolCards"
            :key="tool.key"
            variant="accordion"
            elevation="0"
            class="tool-call-panels mb-2"
          >
            <v-expansion-panel
              elevation="0"
              rounded="lg"
              class="tool-call-panel"
              :class="tool.blocked ? 'tool-call-panel--blocked' : 'tool-call-panel--allowed'"
            >
              <v-expansion-panel-title class="tool-call-panel__title py-2 px-3">
                <div class="d-flex align-center justify-space-between w-100 ga-2">
                  <div class="d-flex align-center ga-2 min-w-0">
                    <v-icon size="small" color="primary">mdi-wrench</v-icon>
                    <span class="tool-call-panel__name text-caption">{{ tool.name }}</span>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    variant="outlined"
                    :class="[
                      'tool-call-panel__state-chip',
                      tool.blocked ? 'tool-call-panel__state-chip--blocked' : 'tool-call-panel__state-chip--allowed',
                    ]"
                  >
                    {{ tool.blocked ? 'Blocked' : 'Executed' }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>

              <v-expansion-panel-text class="tool-call-panel__body px-3 pb-3 pt-1">
                <div class="tool-call-panel__section">
                  <div class="tool-call-panel__label">Input</div>
                  <pre class="tool-call-panel__code">{{ tool.input }}</pre>
                </div>

                <div v-if="tool.output" class="tool-call-panel__section mt-2">
                  <div class="tool-call-panel__label">Output</div>
                  <pre class="tool-call-panel__code tool-call-panel__code--output">{{ tool.output }}</pre>
                </div>

                <div
                  v-if="tool.l1Patterns.length || tool.l2Confidence !== null || tool.l2Reasoning"
                  class="tool-call-panel__meta mt-2"
                >
                  <v-chip
                    v-for="pattern in tool.l1Patterns"
                    :key="pattern"
                    size="x-small"
                    label
                    color="error"
                    variant="outlined"
                  >
                    {{ pattern }}
                  </v-chip>
                  <v-chip
                    v-if="tool.l2Confidence !== null"
                    size="x-small"
                    label
                    :color="toolRiskColor(tool.l2Confidence)"
                    variant="tonal"
                  >
                    L2 {{ (tool.l2Confidence * 100).toFixed(0) }}%
                  </v-chip>
                  <div v-if="tool.l2Reasoning" class="tool-call-panel__reasoning text-caption text-medium-emphasis">
                    {{ tool.l2Reasoning }}
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </v-card-text>
    </v-card>
    
      <!-- ═══ ACTIONS ═══ -->
      <div 
        class="chat-message__actions d-flex ga-1 mt-1 px-1 text-medium-emphasis"
        :style="{ flexDirection: message.role === 'user' ? 'row-reverse' : 'row' }"
      >
        <v-btn
          v-if="message.role === 'user'"
          icon="mdi-refresh"
          size="x-small"
          variant="text"
          density="compact"
          title="Resend"
          @click="$emit('resend', message.content)"
        />
        <v-btn
          icon="mdi-content-copy"
          size="x-small"
          variant="text"
          density="compact"
          title="Copy text"
          @click="copyText(message.content)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage, ChatToolInvocation } from '~/types/api'
import {
  decisionIcon as _di,
  flagColor as _fc,
  intentLabel as _il,
} from '~/utils/colors'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps<{ message: ChatMessage }>()
defineEmits<{ 'resend': [text: string] }>()

interface ToolCardViewModel {
  key: string
  name: string
  input: string
  output: string
  blocked: boolean
  l1Patterns: string[]
  l2Confidence: number | null
  l2Reasoning: string
}

async function copyText(text: string | undefined) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    console.error('Failed to copy', e)
  }
}

function formatToolPayload(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return '{}'
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      return trimmed
    }
  }

  if (value == null) {
    return '{}'
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function fromToolEvent(tool: ChatToolInvocation, index: number): ToolCardViewModel {
  return {
    key: `${tool.tool_name}-${index}`,
    name: tool.tool_name || 'Tool Call',
    input: formatToolPayload(tool.arguments),
    output: typeof tool.result_preview === 'string' ? tool.result_preview.trim() : '',
    blocked: Boolean(tool.blocked),
    l1Patterns: tool.l1_patterns ?? [],
    l2Confidence: typeof tool.l2_confidence === 'number' ? tool.l2_confidence : null,
    l2Reasoning: typeof tool.l2_reasoning === 'string' ? tool.l2_reasoning : '',
  }
}

const toolCards = computed<ToolCardViewModel[]>(() => {
  if (props.message.tool_events?.length) {
    return props.message.tool_events.map((tool, index) => fromToolEvent(tool, index))
  }

  if (props.message.tool_calls?.length) {
    return props.message.tool_calls.map((tool, index) => ({
      key: `${tool.id || tool.function?.name || 'tool'}-${index}`,
      name: tool.function?.name || 'Tool Call',
      input: formatToolPayload(tool.function?.arguments ?? '{}'),
      output: '',
      blocked: false,
      l1Patterns: [],
      l2Confidence: null,
      l2Reasoning: '',
    }))
  }

  return []
})

function toolRiskColor(score: number | null): string {
  return scoreToneColor(score)
}

function scoreToneColor(score: number | null | undefined): string {
  if (score == null) {return 'grey'}
  if (score < 0.25) {return 'green-darken-2'}
  if (score < 0.5) {return 'light-green-darken-1'}
  if (score < 0.75) {return 'amber-darken-2'}
  return 'red-darken-2'
}

// ── core state ──
const decision = computed(() => props.message.decision ?? null)
const isVerdict = computed(() => !!decision.value && props.message.role === 'assistant')

// ── icons ──
const avatarIcon = computed(() => {
  if (isVerdict.value) return _di(decision.value?.decision)
  if (props.message.role === 'tool') return 'mdi-wrench'
  if (props.message.content?.startsWith('⛔')) return 'mdi-shield-alert'
  return props.message.role === 'user' ? 'mdi-account-circle' : 'mdi-robot'
})
const verdictIcon = computed(() => _di(decision.value?.decision))

// ── colors ──
const riskBarColor = computed(() => scoreToneColor(decision.value?.riskScore))
const riskTextClass = computed(() => {
  const score = decision.value?.riskScore
  if (score == null) {return 'verdict-card__risk-text verdict-card__risk-text--unknown'}
  if (score < 0.25) {return 'verdict-card__risk-text verdict-card__risk-text--low'}
  if (score < 0.5) {return 'verdict-card__risk-text verdict-card__risk-text--medium'}
  if (score < 0.75) {return 'verdict-card__risk-text verdict-card__risk-text--elevated'}
  return 'verdict-card__risk-text verdict-card__risk-text--high'
})
const riskPercent = computed(() => Math.round((decision.value?.riskScore ?? 0) * 100))

// ── verdict text ──
const verdictWord = computed(() => {
  switch (decision.value?.decision) {
    case 'BLOCK': return 'Blocked'
    case 'MODIFY': return 'Modified'
    case 'ALLOW': return 'Allowed'
    default: return 'Processed'
  }
})

const verdictReason = computed(() => {
  if (!decision.value) return ''
  if (decision.value.decision === 'ALLOW') return 'no threats detected'
  if (decision.value.decision === 'MODIFY') return 'response sanitized by pipeline'
  // BLOCK — best human reason for the headline (never show raw numbers)
  // 1. Intent label (most descriptive)
  const label = _il(decision.value.intent)
  if (label !== 'unknown') return label
  // 2. Blocked reason (only if truly specific, not generic/numeric)
  if (decision.value.blockedReason) {
    const br = decision.value.blockedReason
    const isGeneric = /^(request )?(blocked|denied)/i.test(br) || /^risk[\s:.]/i.test(br) || br.length < 12
    if (!isGeneric) {
      const first = (br.split(/[.!]/)[0] ?? '').trim()
      if (first.length > 0 && first.length < 60) return first.toLowerCase()
    }
  }
  // 3. Derive from top risk flag
  const flags = decision.value.riskFlags ? Object.keys(decision.value.riskFlags) : []
  if (flags.length && flags[0]) return flags[0].replace(/_/g, ' ')
  return 'unsafe content detected'
})

const humanReason = computed(() => {
  if (!decision.value) return ''
  if (decision.value.decision === 'BLOCK') {
    if (decision.value.blockedReason && !/^risk[\s:.]/i.test(decision.value.blockedReason)) {
      return decision.value.blockedReason
    }
    const label = _il(decision.value.intent)
    if (label !== 'unknown') return `This request was blocked because it matched a ${label} pattern.`
    return 'This request was blocked before reaching the model.'
  }
  if (decision.value.decision === 'MODIFY') {
    return 'The response was adjusted by the security pipeline before delivery.'
  }
  if (decision.value.decision === 'ALLOW') {
    return 'No security threats were detected. The request passed all pipeline checks.'
  }
  return ''
})

// ── flags (top 4 by score) ──
const topFlags = computed(() => {
  if (!decision.value?.riskFlags) return []
  return Object.entries(decision.value.riskFlags)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 4)
    .map(([key, value]) => ({ key, value: Number(value) }))
})

function flagChipColor(key: string, value: number): string {
  return _fc(key, value)
}

// ── content ──
const cleanContent = computed(() => {
  const c = (props.message.content ?? '').replace(/^⛔\s*/, '').trim()
  return c || ''
})
const renderedClean = computed(() => renderMarkdown(cleanContent.value))
const renderedRaw = computed(() => renderMarkdown(props.message.content ?? ''))
</script>

<style lang="scss" scoped>
/* ═══ Message wrapper ═══ */
.chat-message {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  &--user {
    flex-direction: row-reverse;

    .chat-message__bubble {
      background: rgba(var(--v-theme-primary), 0.08) !important;
    }
  }

  &--verdict {
    margin-bottom: 16px;
  }

  &__avatar {
    flex-shrink: 0;
  }

  &__bubble {
    width: fit-content;
    max-width: 85%;
    border-radius: 12px !important;
    background: rgb(var(--v-theme-surface)) !important;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
  }
  
  &__actions {
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  
  &:hover &__actions {
    opacity: 1;
  }

  &__content {
    :deep(p) {
      margin-top: 0;
      margin-bottom: 0.4em;
      &:last-child { margin-bottom: 0; }
    }

    :deep(strong), :deep(b) { font-weight: 700; }

    :deep(code) {
      font-family: 'Lora', 'Noto Serif SC', serif;
      font-size: 0.85em;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(var(--v-theme-on-surface), 0.1);
    }

    :deep(pre) {
      font-family: 'Lora', 'Noto Serif SC', serif;
      font-size: 0.85em;
      padding: 8px 12px;
      border-radius: 6px;
      background: rgba(var(--v-theme-on-surface), 0.08);
      overflow-x: auto;
      margin: 0.5em 0;
      code { padding: 0; background: none; }
    }

    :deep(ul), :deep(ol) { padding-left: 1.4em; margin: 0.3em 0; }

    :deep(blockquote) {
      border-left: 3px solid rgba(var(--v-theme-primary), 0.4);
      margin: 0.4em 0;
      padding: 0.2em 0.8em;
      opacity: 0.85;
    }

    :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
      margin: 0.5em 0 0.3em;
      font-size: 1em;
      font-weight: 700;
    }

    :deep(a) {
      color: rgb(var(--v-theme-primary));
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    :deep(table) {
      border-collapse: collapse;
      margin: 0.5em 0;
      font-size: 0.9em;
    }

    :deep(th), :deep(td) {
      border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
      padding: 4px 8px;
    }
  }
}

.tool-call-panels {
  background: transparent;
}

.tool-call-panel {
  background: rgba(var(--v-theme-on-surface), 0.03) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.tool-call-panel--allowed {
  border-left: 3px solid rgba(46, 125, 50, 0.75);
}

.tool-call-panel--blocked {
  border-left: 3px solid rgba(var(--v-theme-error), 0.8);
}

.tool-call-panel__title {
  min-height: 38px !important;
}

.tool-call-panel__name {
  font-family: 'Lora', 'Noto Serif SC', serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-call-panel__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-call-panel__label {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 600;
}

.tool-call-panel__code {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-on-surface), 0.04);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Lora', 'Noto Serif SC', serif;
  font-size: 0.75rem;
  line-height: 1.45;
}

.tool-call-panel__code--output {
  max-height: 260px;
  overflow: auto;
}

.tool-call-panel__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-call-panel__reasoning {
  width: 100%;
  margin-top: 2px;
  line-height: 1.4;
}

/* ═══ Verdict card ═══ */
.verdict-card {
  --verdict-tone: 120, 120, 120;
  width: fit-content;
  min-width: 280px;
  flex: 0 1 auto;
  max-width: 520px;
  padding: 8px 12px 10px;
  border-radius: 8px;
  border-left: 4px solid transparent;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.06);

  :deep(.v-expansion-panel-title) {
    min-height: 0 !important;
    padding: 0 !important;
  }

  :deep(.v-expansion-panel-title__overlay) {
    display: none;
  }

  :deep(.v-expansion-panel-text) {
    padding: 0 !important;
  }

  :deep(.v-expansion-panel-text__wrapper) {
    padding: 6px 0 0 !important;
  }

  &--block {
    --verdict-tone: 197, 59, 49;
    border-left-color: rgb(var(--v-theme-error));
    background: linear-gradient(135deg, rgba(var(--v-theme-error), 0.04) 0%, rgb(var(--v-theme-surface)) 50%);
  }

  &--allow {
    --verdict-tone: 46, 125, 50;
    border-left-color: rgb(var(--verdict-tone));
    background: linear-gradient(135deg, rgba(var(--verdict-tone), 0.08) 0%, rgb(var(--v-theme-surface)) 55%);
  }

  &--modify {
    --verdict-tone: 176, 120, 24;
    border-left-color: rgb(var(--verdict-tone));
    background: linear-gradient(135deg, rgba(var(--verdict-tone), 0.08) 0%, rgb(var(--v-theme-surface)) 55%);
  }

  &__header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__status-icon {
    color: rgb(var(--verdict-tone));
    margin-top: 1px;
  }

  &__headline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }

  &__word {
    font-size: 0.98rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.2;
    color: rgb(var(--verdict-tone));
  }

  &__dash {
    font-size: 1rem;
    font-weight: 400;
  }

  &__short-reason {
    font-size: 0.78rem;
    font-weight: 400;
    opacity: 0.7;
    line-height: 1.3;
  }

  &__explain {
    margin: 0 0 8px;
    padding-left: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }

  &__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 8px;
    padding: 6px 8px;
    background: rgba(var(--v-theme-on-surface), 0.04);
    border-radius: 8px;
  }

  &__kv {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  &__label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.45;
    font-weight: 600;
  }

  &__bar {
    flex: 1;
    max-width: 84px;
  }

  &__section {
    margin-bottom: 8px;
  }

  &__section-title {
    display: block;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.4;
    font-weight: 600;
    margin-bottom: 6px;
  }

  &__signals {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__body {
    margin-top: 4px;
  }

  &__response {
    opacity: 0.88;
  }

  &__action-chip {
    color: rgb(var(--verdict-tone)) !important;
    border-color: rgba(var(--verdict-tone), 0.45) !important;
    background: rgba(var(--verdict-tone), 0.08) !important;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  &__risk-text {
    font-weight: 700;
  }

  &__risk-text--low {
    color: #2e7d32;
  }

  &__risk-text--medium {
    color: #558b2f;
  }

  &__risk-text--elevated {
    color: #b7791f;
  }

  &__risk-text--high {
    color: #c53b31;
  }

  &__risk-text--unknown {
    color: rgba(var(--v-theme-on-surface), 0.65);
  }
}

.tool-call-panel__state-chip {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.tool-call-panel__state-chip--allowed {
  color: #2e7d32 !important;
  border-color: rgba(46, 125, 50, 0.42) !important;
  background: rgba(46, 125, 50, 0.1) !important;
}

.tool-call-panel__state-chip--blocked {
  color: #c53b31 !important;
  border-color: rgba(197, 59, 49, 0.42) !important;
  background: rgba(197, 59, 49, 0.1) !important;
}
</style>
