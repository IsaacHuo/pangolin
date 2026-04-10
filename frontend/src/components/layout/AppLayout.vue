<template>
  <div class="app-shell" :data-theme="theme">
    <!-- Icon Rail -->
    <nav class="icon-rail">
      <div class="rail-brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
      </div>

      <div class="rail-nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="rail-btn"
          :class="{ active: currentSection === item.id, separator: item.separator, primary: item.primary }"
          :title="item.label"
          @click="navigateTo(item.id)"
        >
          <span class="rail-icon" v-html="item.icon"></span>
          <span v-if="item.badge" class="rail-badge" :class="item.badgeType">{{ item.badge }}</span>
        </button>
      </div>

      <div class="rail-footer">
        <button class="rail-btn" :title="theme === 'dark' ? 'Light Mode' : 'Dark Mode'" @click="toggleTheme">
          <span class="rail-icon" v-html="theme === 'dark' ? icons.sun : icons.moon"></span>
        </button>
        <div class="rail-status" :class="{ connected }" :title="connected ? 'Firewall connected' : 'Disconnected'"></div>
      </div>
    </nav>

    <!-- Main workspace -->
    <div class="workspace">
      <!-- Top Bar -->
      <header class="top-bar">
        <div class="top-left">
          <h1 class="page-title">{{ activePageTitle }}</h1>
        </div>
        <div class="top-spacer"></div>
        <div class="top-right">
          <div v-if="stats" class="top-stats">
            <span class="stat-pill">
              <span class="stat-dot green"></span>
              {{ stats.active_sessions ?? 0 }} sessions
            </span>
            <span v-if="stats.audit?.blocked" class="stat-pill">
              <span class="stat-dot red"></span>
              {{ stats.audit.blocked }} blocked
            </span>
          </div>
          <button
            class="traffic-toggle"
            :class="{ active: showTraffic }"
            title="Toggle Traffic Panel"
            @click="showTraffic = !showTraffic"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </button>
          <a class="github-link" href="https://github.com/IsaacHuo/agent-firewall" target="_blank" rel="noopener noreferrer" title="GitHub Repository">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          </a>
        </div>
      </header>

      <!-- Content split -->
      <div class="content-split">
        <!-- Left: Active page -->
        <div class="content-main" :class="{ 'full-width': !showTraffic }">
          <slot></slot>
        </div>

        <!-- Resize handle -->
        <div v-if="showTraffic" class="resize-handle" @mousedown="startResize"></div>

        <!-- Right: Persistent Traffic Waterfall -->
        <div class="content-traffic" :class="{ collapsed: !showTraffic }">
          <TrafficWaterfall :events="events" :compact="true" @clear="clearEvents" @verdict="handleVerdict" />
        </div>
      </div>

      <!-- Status Bar -->
      <footer class="status-bar">
        <div class="status-left">
          <span class="status-item" :class="{ connected }">
            <span class="status-indicator"></span>
            {{ connected ? 'Online' : 'Offline' }}
          </span>
          <span class="status-sep">|</span>
          <span v-if="stats" class="status-item">{{ formatUptime(stats.uptime_seconds) }}</span>
        </div>
        <div class="status-right">
          <span class="status-item">{{ events.length }} events</span>
          <span class="status-sep">|</span>
          <span class="status-item mono">{{ currentSection }}</span>
        </div>
      </footer>
    </div>

    <!-- Command Palette -->
    <Teleport to="body">
      <div v-if="showCommandPalette" class="cmd-overlay" @click.self="showCommandPalette = false">
        <div class="cmd-palette">
          <input ref="cmdInput" v-model="cmdQuery" class="cmd-input" placeholder="Type a command..." @keydown.esc="showCommandPalette = false" @keydown.enter="executeCommand" />
          <div class="cmd-list">
            <button v-for="cmd in filteredCommands" :key="cmd.id" class="cmd-item" @click="executeCommand(cmd)">
              <span class="cmd-icon" v-html="cmd.icon"></span>
              <span class="cmd-label">{{ cmd.label }}</span>
              <kbd v-if="cmd.shortcut" class="cmd-shortcut">{{ cmd.shortcut }}</kbd>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast Notifications -->
    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import type { NavSection } from '../../types'
import {
  useWebSocket, useStats, useNavigation, useTheme, useToast,
} from '../../composables'

import Toast from '../common/Toast.vue'
import TrafficWaterfall from '../TrafficWaterfall.vue'

const icons = {
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  schematic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="10" y1="6.5" x2="14" y2="6.5"/><line x1="10" y1="17.5" x2="14" y2="17.5"/><line x1="6.5" y1="10" x2="6.5" y2="14"/><line x1="17.5" y1="10" x2="17.5" y2="14"/></svg>`,
  rules: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  engine: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  pentest: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  audit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  skills: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  agents: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  config: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  benchmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="20" x2="6" y2="10"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="18" y1="20" x2="18" y2="13"/><polyline points="4 4 10 9 14 6 20 10"/></svg>`,
  playground: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  datasets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h3a3 3 0 0 1 3 3v3"/><polyline points="15 10 17 10 17 8"/><path d="M13 17h-3a3 3 0 0 1-3-3v-3"/><polyline points="9 14 7 14 7 16"/></svg>`,
  traces: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
}

const { connected, events, clearEvents, sendVerdict } = useWebSocket()
const { stats } = useStats()
const { currentSection, navigateTo } = useNavigation()
const { theme, toggleTheme } = useTheme()
const { setToastRef } = useToast()

const showTraffic = ref(true)
const showCommandPalette = ref(false)
const cmdQuery = ref('')
const cmdInput = ref<HTMLInputElement | null>(null)
const toastRef = ref<unknown>(null)

interface NavItem {
  id: NavSection
  label: string
  icon: string
  group: string
  primary?: boolean
  separator?: boolean
  badge?: string
  badgeType?: string
}

const navItems = computed(() => [
  { id: 'chat', label: 'Chat Lab', icon: icons.chat, group: 'main', primary: true },
  { id: 'schematic', label: '架构示意图', icon: icons.schematic, group: 'main' },
  { id: 'rules', label: 'Rules', icon: icons.rules, group: 'security', separator: true },
  { id: 'integrations', label: 'Integrations', icon: icons.skills, group: 'security' },
  { id: 'pentest', label: 'PenTest / Eval', icon: icons.pentest, group: 'security' },
  { id: 'playground', label: 'Playground', icon: icons.playground, group: 'security' },
  { id: 'benchmark', label: 'Benchmark', icon: icons.benchmark, group: 'security' },
  { id: 'datasets', label: 'Sync Monitor', icon: icons.datasets, group: 'analysis', separator: true },
  { id: 'engine', label: '设置页', icon: icons.config, group: 'settings', separator: true },
] as NavItem[])

const activePageTitle = computed(() => {
  const item = navItems.value.find(i => i.id === currentSection.value)
  return item?.label ?? 'Agent Firewall'
})

const commands = computed(() => [
  { id: 'chat', label: 'Go to Chat Lab', icon: icons.chat, action: () => navigateTo('chat') },
  { id: 'rules', label: 'Go to Rules', icon: icons.rules, action: () => navigateTo('rules') },
  { id: 'traffic-toggle', label: 'Toggle Traffic Panel', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`, action: () => { showTraffic.value = !showTraffic.value } },
  { id: 'pentest', label: 'PenTest / Eval', icon: icons.pentest, action: () => navigateTo('pentest') },
  { id: 'audit', label: 'Audit Log', icon: icons.audit, action: () => navigateTo('audit') },
  { id: 'theme', label: 'Toggle Theme', icon: theme.value === 'dark' ? icons.sun : icons.moon, shortcut: '⌘⇧T', action: () => toggleTheme() },
  { id: 'clear', label: 'Clear Traffic', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`, action: () => clearEvents() },
])

const filteredCommands = computed(() => {
  if (!cmdQuery.value) {return commands.value}
  const q = cmdQuery.value.toLowerCase()
  return commands.value.filter(c => c.label.toLowerCase().includes(q))
})

function executeCommand(cmd?: unknown) {
  const target = cmd?.action ? cmd : filteredCommands.value[0]
  if (target?.action) {
    target.action()
    showCommandPalette.value = false
    cmdQuery.value = ''
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
}

watch(showCommandPalette, (v) => {
  if (v) {nextTick(() => cmdInput.value?.focus())}
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  if (toastRef.value) {
    setToastRef(toastRef.value)
  }
})
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

function startResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const trafficEl = document.querySelector('.content-traffic') as HTMLElement
  if (!trafficEl) {return}
  const startWidth = trafficEl.offsetWidth

  function onMove(ev: MouseEvent) {
    const delta = startX - ev.clientX
    const w = Math.max(280, Math.min(startWidth + delta, window.innerWidth * 0.55))
    trafficEl.style.width = `${w}px`
    trafficEl.style.flex = 'none'
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function handleVerdict(requestId: string, action: 'allow' | 'block') { sendVerdict(requestId, action) }

function formatUptime(s: number): string {
  if (s < 60) {return `${s}s`}
  if (s < 3600) {return `${Math.floor(s / 60)}m`}
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
</script>

<style scoped>
/* AppLayout specific scoped styles matching old App.vue */
.app-shell { height: 100vh; display: flex; overflow: hidden; background: radial-gradient(circle at 5% 0%, rgba(59,130,246,0.12), transparent 28%), var(--bg-primary); }

.icon-rail {
  width: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(180deg, var(--rail-bg), color-mix(in srgb, var(--rail-bg), #000 18%));
  border-right: 1px solid var(--rail-border);
  z-index: 20;
  padding-top: 14px;
  flex-shrink: 0;
}
.rail-brand { margin-bottom: 18px; display: flex; justify-content: center; }
.brand-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(145deg, var(--accent), #0ea5e9);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center; color: white;
  box-shadow: 0 8px 24px rgba(59,130,246,0.35);
}
.brand-icon svg { width: 22px; height: 22px; }

.rail-nav { flex: 1; width: 100%; padding: 0 10px; display: flex; flex-direction: column; align-items: center; gap: 7px; overflow-y: auto; }
.rail-btn {
  position: relative; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 14px; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.rail-btn.primary { margin-bottom: 8px; background: var(--accent-muted); color: var(--accent); border-color: rgba(59,130,246,0.4); }
.rail-btn.primary:hover { background: var(--accent); color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
.rail-btn.primary.active { background: var(--accent); color: #fff; box-shadow: 0 2px 8px rgba(var(--accent-rgb, 99,102,241), 0.3); }

.rail-btn.separator { margin-top: 12px; }
.rail-btn.separator::before { content: ''; position: absolute; top: -8px; left: 8px; right: 8px; height: 1px; background: var(--border-subtle); }

.rail-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: color-mix(in srgb, var(--border), #fff 10%); }
.rail-btn.active { background: linear-gradient(165deg, rgba(59,130,246,0.26), rgba(14,165,233,0.08)); color: var(--text-primary); border-color: rgba(59,130,246,0.45); }
.rail-btn.active::after {
  content: '';
  position: absolute;
  left: -11px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  background: #60a5fa;
  border-radius: 0 4px 4px 0;
}

.rail-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
.rail-icon :deep(svg) { width: 100%; height: 100%; stroke-width: 1.8px; }

.rail-badge {
  position: absolute; top: 4px; right: 4px; min-width: 16px; height: 16px; padding: 0 4px;
  border-radius: 8px; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  background: var(--danger); color: white; border: 2px solid var(--rail-bg);
}
.rail-footer { width: 100%; padding: 14px 0; display: flex; flex-direction: column; align-items: center; gap: 12px; border-top: 1px solid var(--border-subtle); }
.rail-status { width: 7px; height: 7px; border-radius: 50%; background: var(--text-disabled); transition: all 0.3s; }
.rail-status.connected { background: var(--accent-green); box-shadow: 0 0 6px rgba(34,197,94,0.4); }

.workspace { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

.top-bar {
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary), #fff 2%), var(--bg-secondary));
  flex-shrink: 0;
  gap: 12px;
}
.top-left { display: flex; align-items: center; gap: 8px; min-width: 140px; }
.page-title { font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; letter-spacing: -0.01em; }
.top-spacer { flex: 1; }
.top-right { display: flex; align-items: center; gap: 10px; min-width: 180px; justify-content: flex-end; }
.top-stats { display: flex; gap: 6px; }
.stat-pill { display: flex; align-items: center; gap: 5px; padding: 4px 9px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 999px; font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.stat-dot { width: 5px; height: 5px; border-radius: 50%; }
.stat-dot.green { background: var(--accent-green); }
.stat-dot.red { background: var(--accent-red); }
.traffic-toggle {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface);
  color: var(--text-dim); cursor: pointer; transition: all 0.15s;
}
.traffic-toggle:hover { border-color: var(--border-hover); color: var(--text-secondary); }
.traffic-toggle.active { background: var(--accent-muted); color: var(--accent); border-color: var(--accent); }
.github-link {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface);
  color: var(--text-dim); cursor: pointer; transition: all 0.15s; text-decoration: none;
}
.github-link:hover { border-color: var(--border-hover); color: var(--text-secondary); }

.content-split { flex: 1; display: flex; position: relative; overflow: hidden; }
.content-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-primary), #fff 1%), var(--bg-primary));
}
.content-main.full-width { border-right: none; }
.content-traffic { width: 420px; flex-shrink: 0; overflow: hidden; transition: width 0.2s ease; display: flex; flex-direction: column; border-left: 1px solid var(--border); }
.content-traffic.collapsed { width: 0; border-left: none; }
.resize-handle {
  position: absolute; top: 0; bottom: 0; width: 4px; cursor: col-resize; z-index: 5;
  background: transparent; transition: background 0.15s;
  right: calc(420px - 2px);
}
.resize-handle:hover, .resize-handle:active { background: var(--accent); }

.status-bar {
  height: 26px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 11px; background: var(--bg-secondary); border-top: 1px solid var(--border); flex-shrink: 0;
}
.status-left, .status-right { display: flex; align-items: center; gap: 8px; }
.status-item { display: flex; align-items: center; gap: 4px; color: var(--text-dim); font-size: 10px; }
.status-item.connected .status-indicator { background: var(--accent-green); }
.status-item.connected { color: var(--text-muted); }
.status-indicator { width: 5px; height: 5px; border-radius: 50%; background: var(--text-disabled); }
.status-item.mono { font-family: var(--font-mono); font-size: 9px; }
.status-sep { color: var(--text-disabled); font-size: 10px; }

.cmd-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--overlay-bg); backdrop-filter: var(--backdrop-blur); display: flex; justify-content: center; padding-top: 18vh; }
.cmd-palette { width: 480px; max-height: 360px; background: var(--bg-elevated); border: 1px solid var(--border-hover); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); overflow: hidden; display: flex; flex-direction: column; }
.cmd-input { width: 100%; padding: 12px 16px; background: transparent; border: none; border-bottom: 1px solid var(--border); color: var(--text-primary); font-size: 14px; outline: none; }
.cmd-input::placeholder { color: var(--text-dim); }
.cmd-list { flex: 1; overflow-y: auto; padding: 4px; }
.cmd-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; border-radius: var(--radius-md); background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; text-align: left; transition: background 0.1s; }
.cmd-item:hover { background: var(--bg-hover); }
.cmd-icon { width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; color: var(--text-dim); }
.cmd-icon :deep(svg) { width: 100%; height: 100%; }
.cmd-label { flex: 1; }
.cmd-shortcut { padding: 1px 5px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 3px; font-size: 9px; color: var(--text-dim); }
</style>
