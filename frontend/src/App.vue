<template>
  <AppLayout>
    <KeepAlive :include="['ChatLab', 'BenchmarkPage']">
      <Suspense>
        <component
          :is="activeComponent"
          :events="events"
          :rules="rulesData"
          :config="config"
          :saving="configSaving"
          :results="testResults"
          :running="testRunning"
          :entries="auditEntries"
          :loading="auditLoading"
          :hasMore="auditHasMore"
          @save="handleSaveRule"
          @delete="handleDeleteRule"
          @toggle="handleToggleRule"
          @updateMethodAction="handleUpdateMethodAction"
          @updateDefaultAction="handleUpdateDefaultAction"
          @saveConfig="handleSaveConfig"
          @run="handleRunTest"
          @runAll="handleRunAllTests"
          @clear="clearTestResults"
          @load="handleLoadAudit"
          @loadMore="handleLoadMoreAudit"
        />
      </Suspense>
    </KeepAlive>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import type { FirewallConfig, PatternRule, TestPayload, RuleAction, RateLimitConfig } from './types'
import {
  useConfig, useRules, useSecurityTest,
  useAuditLog, useNavigation, useTheme, useGateway, useWebSocket
} from './composables'

import AppLayout from './components/layout/AppLayout.vue'

// Import components properly
import ChatLab from './components/ChatLab.vue'
import SchematicDiagram from './components/SchematicDiagram.vue'
import RulesConfig from './components/RulesConfig.vue'
import GatewayConfig from './components/GatewayConfig.vue'
import EngineSettingsPage from './components/EngineSettingsPage.vue'
import SecurityTest from './components/SecurityTest.vue'
import AuditLog from './components/AuditLog.vue'
import Playground from './components/Playground.vue'
import DatasetList from './components/DatasetList.vue'
import TracesPage from './components/TracesPage.vue'
import IntegrationsPage from './components/IntegrationsPage.vue'
import PenTestEval from './components/PenTestEval.vue'
import BenchmarkPage from "./components/BenchmarkPage.vue"
import RateLimitSettings from './components/RateLimitSettings.vue'

// Provide gateway config composables init
useGateway()
const { events } = useWebSocket()
const { config, saving: configSaving, loadConfig, saveConfig } = useConfig()
const { rules: rulesData, loadRules, saveRule, deleteRule, toggleRule } = useRules()
const { results: testResults, running: testRunning, runTest, runBatch, clearResults: clearTestResults } = useSecurityTest()
const { entries: auditEntries, loading: auditLoading, hasMore: auditHasMore, loadEntries: loadAuditEntries, loadMore: loadMoreAudit } = useAuditLog()
const { currentSection } = useNavigation()

const componentMap: Record<string, unknown> = {
  chat: ChatLab,
  schematic: SchematicDiagram,
  rules: RulesConfig,
  engine: EngineSettingsPage,
  test: SecurityTest,
  audit: AuditLog,
  playground: Playground,
  datasets: DatasetList,
  traces: TracesPage,
  integrations: IntegrationsPage,
  pentest: PenTestEval,
  benchmark: BenchmarkPage
}

const activeComponent = computed(() => {
  return componentMap[currentSection.value] || ChatLab
})


// Event handlers
function handleSaveRule(rule: PatternRule) { saveRule(rule) }
function handleDeleteRule(ruleId: string) { deleteRule(ruleId) }
function handleToggleRule(ruleId: string, enabled: boolean) { toggleRule(ruleId, enabled) }
function handleUpdateMethodAction() { saveConfig({ blocked_commands: config.value?.blocked_commands }) }
function handleUpdateDefaultAction(action: RuleAction) { rulesData.value.default_action = action }
function handleSaveConfig(newConfig: Partial<FirewallConfig>) { saveConfig(newConfig) }
function handleSaveRateLimit(rateLimit: RateLimitConfig) { saveConfig({ rate_limit: rateLimit }) }
function handleRunTest(payload: TestPayload) { runTest(payload) }
function handleRunAllTests(payloads: TestPayload[]) { runBatch(payloads) }
function handleLoadAudit(options: { verdict?: string; since?: number }) { loadAuditEntries(options) }
function handleLoadMoreAudit() { loadMoreAudit() }

// Expose these bindings implicitly for the dynamically mapped components (if using wrapper components, else we'd map props via standard Vue render functions or `<component :is>` bindings)
// Wait, actually, component :is cannot easily map individual specific props out-of-the-box perfectly unless we write a render function or switch case.
// But the prompt asked for simply `<component :is="..." />`.
// I will wrap the `<component :is>` with Vue's dynamic prop bindings if necessary, but actually let's just make smaller wrapper components or pass all props.
// The easiest way is to pass all props down with v-bind, and child ignores what it doesn't need.

onMounted(() => {
  loadConfig()
  loadRules()
  loadAuditEntries({ limit: 50 })
})
</script>


<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root, [data-theme="dark"] {
  --bg-primary: #0c111b;
  --bg-secondary: #121a28;
  --bg-elevated: #182235;
  --bg-surface: #131d2d;
  --bg-hover: rgba(255,255,255,0.06);
  --bg-active: rgba(255,255,255,0.1);
  --overlay-bg: rgba(0,0,0,0.75);
  --backdrop-blur: blur(16px);
  --border: #25344f;
  --border-hover: #37507a;
  --border-active: #4f6ca1;
  --border-subtle: #20304b;
  --text-primary: #f6f8fe;
  --text-secondary: #b8c4de;
  --text-muted: #8ea1c6;
  --text-dim: #60769e;
  --text-disabled: #445b83;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-muted: rgba(59,130,246,0.22);
  --accent-red: #ef4444;
  --accent-red-muted: rgba(239,68,68,0.15);
  --accent-green: #10b981;
  --accent-green-muted: rgba(16,185,129,0.15);
  --accent-yellow: #f59e0b;
  --accent-yellow-muted: rgba(245,158,11,0.15);
  --accent-orange: #f97316;
  --accent-purple: #8b5cf6;
  --accent-cyan: #06b6d4;
  --danger: #ef4444;
  --toggle-bg: #3f3f46;
  --toggle-bg-active: #10b981;
  --toggle-knob: #ffffff;
  --rail-bg: #0f1624;
  --rail-border: #26344f;
  --scrollbar-thumb: rgba(255,255,255,0.1);
  --scrollbar-thumb-hover: rgba(255,255,255,0.2);
  --font-sans: "Avenir Next", "SF Pro Display", "Segoe UI", "Noto Sans", sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

[data-theme="light"] {
  --bg-primary: #f2f6fb;
  --bg-secondary: #ffffff;
  --bg-elevated: #ffffff;
  --bg-surface: #ffffff;
  --bg-hover: rgba(30,58,138,0.06);
  --bg-active: rgba(0,0,0,0.06);
  --overlay-bg: rgba(0,0,0,0.4);
  --border: #d7e1f0;
  --border-hover: #c1d0e6;
  --border-active: #8ea4ca;
  --border-subtle: #e6ecf6;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #5b6f94;
  --text-dim: #7f8fad;
  --text-disabled: #d4d4d8;
  --accent: #2563eb;
  --accent-hover: #3b82f6;
  --accent-muted: rgba(37,99,235,0.1);
  --accent-red: #dc2626;
  --accent-red-muted: rgba(220,38,38,0.1);
  --accent-green: #059669;
  --accent-green-muted: rgba(5,150,105,0.1);
  --accent-yellow: #d97706;
  --accent-yellow-muted: rgba(217,119,6,0.1);
  --accent-orange: #ea580c;
  --accent-purple: #7c3aed;
  --accent-cyan: #0891b2;
  --danger: #dc2626;
  --toggle-bg: #e4e4e7;
  --toggle-bg-active: #059669;
  --toggle-knob: #ffffff;
  --rail-bg: #e8eef8;
  --rail-border: #d1dceb;
  --scrollbar-thumb: rgba(0,0,0,0.15);
  --scrollbar-thumb-hover: rgba(0,0,0,0.25);
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  font-size: 14px;
  line-height: 1.5;
  transition: background 0.3s, color 0.3s;
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
::selection { background: var(--accent-muted); color: var(--text-primary); }
input, textarea, select, button { font-family: inherit; font-size: inherit; }

/* ── Global styles for sub-page components ── */
.content-main .page-header h2 { font-size: 18px; font-weight: 600; margin-bottom: 4px; color: var(--text-primary); }
.content-main .subtitle { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; }
.content-main .page-header { margin-bottom: 20px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 16px; }
.content-main h3 { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.content-main h4 { font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px; }

/* Page-level padding */
.content-main .rules-page,
.content-main .engine-page,
.content-main .rate-limit-page,
.content-main .test-page,
.content-main .audit-page,
.content-main .skills-page,
.content-main .agents-page,
.content-main .config-page { padding: 24px; max-width: 1200px; margin: 0 auto; width: 100%; }

.content-main .merged-settings-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-main .merged-settings-page .settings-page {
  height: auto;
  overflow: visible;
  padding-top: 0;
}

/* Cards & panels */
.content-main .stat-card,
.content-main .card,
.content-main .settings-card,
.content-main .section-content,
.content-main .panel,
.content-main .payload-card,
.content-main .skill-card {
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, border-color 0.2s;
}
.content-main .card:hover { border-color: var(--border-hover); box-shadow: var(--shadow-md); }

.content-main .card-header { padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; }
.content-main .card-body { padding: 16px; }

/* Buttons */
.content-main .btn,
.content-main .btn-primary,
.content-main .btn-secondary,
.content-main .btn-sm,
.content-main .action-btn {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* Form controls */
.content-main .form-group { margin-bottom: 16px; }
.content-main .form-group label { font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block; color: var(--text-secondary); }
.content-main .form-input,
.content-main .form-input-sm,
.content-main .form-select,
.content-main .filter-input,
.content-main .filter-select,
.content-main .field-input,
.content-main .search-input {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
}
.content-main .form-input:focus,
.content-main .form-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
.content-main .form-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* Tabs */
.content-main .rule-tab,
.content-main .cat-tab,
.content-main .mode-btn,
.content-main .section-nav-item { font-size: 11px !important; padding: 6px 12px !important; }

/* Tables */
.content-main .audit-table { font-size: 11px !important; }
.content-main .audit-table th { font-size: 10px !important; padding: 8px 10px !important; }
.content-main .audit-table td { padding: 6px 10px !important; }

/* Badges & chips */
.content-main .badge,
.content-main .chip,
.content-main .verdict-tag,
.content-main .threat-tag { font-size: 9px !important; padding: 1px 6px !important; }

/* Info fields (agents/skills) */
.content-main .info-label { font-size: 10px !important; }
.content-main .info-value { font-size: 12px !important; }
.content-main .agent-name,
.content-main .skill-name,
.content-main .rule-name,
.content-main .method-name { font-size: 12px !important; }
.content-main .skill-description,
.content-main .rule-description,
.content-main .card-description { font-size: 11px !important; }
.content-main .payload-name { font-size: 12px !important; }
.content-main .payload-code { font-size: 10px !important; }

/* Misc text */
.content-main .engine-name,
.content-main .alert-method { font-size: 11px !important; }
.content-main .bucket-label { font-size: 12px !important; }
.content-main .tool-name,
.content-main .skill-row-name { font-size: 11px !important; }
.content-main .raw-editor { font-size: 11px !important; }
</style>
