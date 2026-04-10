<template>
  <v-container fluid class="pa-0 agent-studio">
    <v-row class="ma-0 fill-height" dense>
      <v-col cols="12" lg="8" class="pa-3 d-flex flex-column ga-3">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-robot-multiple</v-icon>
            Agent Studio
            <v-spacer />
            <v-chip size="small" variant="tonal" color="primary">
              {{ selectedProfiles.length }} active agents
            </v-chip>
          </v-card-title>

          <v-card-text>
            <v-textarea
              v-model="task"
              label="Human task"
              placeholder="Example: design a website, check Feishu requirements, research online, draft copy, and produce financial analysis"
              rows="4"
              auto-grow
              density="comfortable"
              variant="outlined"
              :disabled="isRunning"
            />

            <v-row dense class="mt-1">
              <v-col cols="12" md="8">
                <v-select
                  v-model="model"
                  label="Model"
                  :items="modelItems"
                  item-title="title"
                  item-value="value"
                  density="comfortable"
                  variant="outlined"
                  :disabled="isRunning"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="maxParallel"
                  label="Max parallel"
                  :items="[1, 2, 3, 4]"
                  density="comfortable"
                  variant="outlined"
                  :disabled="isRunning"
                />
              </v-col>
            </v-row>

            <div class="text-caption text-medium-emphasis mb-2">Core agent roster</div>
            <v-chip-group v-model="selectedAgentIds" multiple column :disabled="isRunning">
              <v-chip
                v-for="profile in profiles"
                :key="profile.id"
                :value="profile.id"
                filter
                variant="outlined"
                class="ma-1"
              >
                {{ profile.emoji }} {{ profile.name }}
              </v-chip>
            </v-chip-group>

            <div class="d-flex ga-2 mt-4">
              <v-btn
                color="primary"
                prepend-icon="mdi-play"
                :disabled="!canRun || isBootstrapping"
                :loading="isRunning"
                @click="startRun"
              >
                Start orchestration
              </v-btn>
              <v-btn
                variant="tonal"
                color="warning"
                prepend-icon="mdi-stop"
                :disabled="!isRunning"
                @click="stopRun"
              >
                Stop
              </v-btn>
            </div>

            <v-alert
              v-if="error"
              type="error"
              variant="tonal"
              class="mt-3"
            >
              {{ error }}
            </v-alert>
          </v-card-text>
        </v-card>

        <v-card class="flex-grow-1">
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-timeline-clock</v-icon>
            Live delegation timeline
            <v-spacer />
            <v-chip size="small" variant="tonal">{{ logs.length }}</v-chip>
          </v-card-title>
          <v-divider />

          <v-card-text class="timeline-pane">
            <v-alert
              v-if="logs.length === 0"
              type="info"
              variant="tonal"
            >
              Start a run to see multi-agent delegation and execution events.
            </v-alert>
            <v-timeline v-else density="compact" align="start" side="end" truncate-line="both">
              <v-timeline-item
                v-for="entry in logs"
                :key="entry.id"
                size="small"
                fill-dot
                :dot-color="agentDotColor(entry.agentId)"
              >
                <div class="d-flex align-center ga-2 mb-1 flex-wrap">
                  <span
                    v-if="entry.agentId"
                    class="agent-color-block"
                    :style="{ backgroundColor: agentBlockColor(entry.agentId) }"
                  />
                  <v-chip
                    v-if="entry.agentName"
                    size="x-small"
                    variant="flat"
                    class="agent-event-chip"
                    :style="{ backgroundColor: agentBlockColor(entry.agentId) }"
                  >
                    {{ entry.agentName }}
                  </v-chip>
                  <strong>{{ entry.title }}</strong>
                  <v-chip size="x-small" variant="outlined">{{ entry.at }}</v-chip>
                </div>
                <div class="text-body-2 text-medium-emphasis">{{ entry.detail }}</div>
              </v-timeline-item>
            </v-timeline>
          </v-card-text>
        </v-card>

        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-file-document-multiple</v-icon>
            Specialist artifacts
            <v-spacer />
            <v-chip size="small" variant="tonal">{{ resultEvents.length }}</v-chip>
          </v-card-title>
          <v-divider />

          <v-expansion-panels variant="accordion">
            <v-expansion-panel
              v-for="result in resultEvents"
              :key="result.step_id"
              :title="`${result.agent_name} · ${result.objective}`"
              :text="result.content || '(empty output)'"
            >
              <template #text>
                <div class="text-caption text-medium-emphasis mb-2">
                  Tool calls: {{ result.tool_calls }} · Blocked: {{ result.blocked_tool_calls }}
                </div>

                <div v-if="result.tool_events?.length" class="agent-tool-events mb-3">
                  <div class="text-caption text-medium-emphasis mb-2">Tool execution details</div>
                  <div class="d-flex flex-wrap ga-2">
                    <agent-tool-call-chip
                      v-for="(tool, idx) in toolCallsForResult(result.tool_events)"
                      :key="`${result.step_id}-tool-${idx}`"
                      :tool="tool"
                      :verdict="result.blocked_tool_calls > 0 ? 'BLOCK' : 'ALLOW'"
                    />
                  </div>
                </div>
                <div v-else-if="result.tool_calls > 0" class="text-caption text-disabled mb-3">
                  Tool call details are not available for this historical run.
                </div>

                <div class="text-body-2 agent-result-content">{{ result.content || '(empty output)' }}</div>
              </template>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card>
      </v-col>

      <v-col cols="12" lg="4" class="pa-3 d-flex flex-column ga-3">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-history</v-icon>
            Run history
            <v-spacer />
            <v-btn
              icon="mdi-refresh"
              variant="text"
              size="small"
              :loading="loadingRuns"
              @click="loadRuns"
            />
          </v-card-title>
          <v-divider />

          <v-list v-if="runs.length > 0" lines="two" density="compact" max-height="340" class="overflow-y-auto">
            <v-list-item
              v-for="run in runs"
              :key="run.id"
              :title="run.task"
              :subtitle="`${run.status} · artifacts ${run.artifact_count}`"
              @click="openRun(run.id)"
            >
              <template #append>
                <v-chip size="x-small" :color="run.status === 'completed' ? 'success' : 'warning'" variant="tonal">
                  {{ run.status }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>

          <v-alert v-else type="info" variant="tonal" class="ma-4">
            No orchestration runs yet.
          </v-alert>
        </v-card>

        <v-card class="flex-grow-1">
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-notebook-multiple</v-icon>
            Final report
            <v-spacer />
            <v-chip v-if="currentRunId" size="x-small" variant="outlined">{{ currentRunId }}</v-chip>
          </v-card-title>
          <v-divider />

          <v-card-text class="report-pane">
            <div v-if="finalReport" class="text-body-2 whitespace-pre-wrap">{{ finalReport }}</div>
            <div v-else-if="selectedRunDetail?.final_report" class="text-body-2 whitespace-pre-wrap">
              {{ selectedRunDetail.final_report }}
            </div>
            <v-alert v-else type="info" variant="tonal">
              Final synthesis report will appear here.
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useModels } from '~/composables/useModels'
import { useAgentStudio } from '~/composables/useAgentStudio'
import type { ToolCall } from '~/types/agent'
import type { AgentStudioToolEvent } from '~/types/agentStudio'

const {
  profiles,
  selectedAgentIds,
  selectedProfiles,
  task,
  model,
  maxParallel,
  isBootstrapping,
  isRunning,
  loadingRuns,
  error,
  currentRunId,
  finalReport,
  logs,
  resultEvents,
  runs,
  selectedRunDetail,
  canRun,
  bootstrap,
  loadRuns,
  openRun,
  startRun,
  stopRun,
} = useAgentStudio()

const { groupedModels, refreshAvailability } = useModels()

const modelItems = computed(() => {
  return (groupedModels.value ?? [])
    .filter((item) => item.available)
    .map((item) => ({
      title: `${item.name} · ${item.provider}`,
      value: item.id,
    }))
})

interface AgentColorPair {
  block: string
  dot: string
}

const AGENT_COLORS: AgentColorPair[] = [
  { block: '#e6eef7', dot: '#355c8c' },
  { block: '#e7f3ec', dot: '#2f6b4b' },
  { block: '#f7efe4', dot: '#8c5e2e' },
  { block: '#efe9f7', dot: '#5b3e8c' },
  { block: '#e7f4f4', dot: '#2d6d6d' },
  { block: '#f7e7ea', dot: '#8a3f4d' },
  { block: '#ececec', dot: '#4a4a4a' },
  { block: '#e9eef1', dot: '#3e5568' },
]

const FALLBACK_COLOR: AgentColorPair = {
  block: '#f1f1f1',
  dot: '#7a7a7a',
}

const agentColorMap = computed(() => {
  const out = new Map<string, AgentColorPair>()
  profiles.value.forEach((profile, idx) => {
    out.set(profile.id, AGENT_COLORS[idx % AGENT_COLORS.length] ?? FALLBACK_COLOR)
  })
  return out
})

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function resolveAgentColor(agentId?: string): AgentColorPair {
  if (!agentId) {
    return FALLBACK_COLOR
  }

  const existing = agentColorMap.value.get(agentId)
  if (existing) {
    return existing
  }

  return AGENT_COLORS[hashString(agentId) % AGENT_COLORS.length] ?? FALLBACK_COLOR
}

function agentBlockColor(agentId?: string): string {
  return resolveAgentColor(agentId).block
}

function agentDotColor(agentId?: string): string {
  return resolveAgentColor(agentId).dot
}

function normalizeToolArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return {}
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Ignore parse errors and fall back to empty args.
    }
  }

  return {}
}

function toToolCall(event: AgentStudioToolEvent): ToolCall {
  return {
    tool: typeof event.tool === 'string' && event.tool.trim() ? event.tool : 'unknown',
    args: normalizeToolArgs(event.args),
    result_preview: typeof event.result_preview === 'string' ? event.result_preview : '',
    allowed: Boolean(event.allowed ?? true),
    blocked_reason: event.blocked_reason ?? null,
  }
}

function toolCallsForResult(toolEvents?: AgentStudioToolEvent[]): ToolCall[] {
  if (!toolEvents?.length) {
    return []
  }

  return toolEvents.map((toolEvent) => toToolCall(toolEvent))
}

onMounted(async () => {
  await refreshAvailability()
  await bootstrap()

  if (!model.value) {
    const first = modelItems.value[0]
    model.value = first?.value ?? 'openrouter/auto'
  }
})
</script>

<style scoped>
.agent-studio {
  min-height: calc(100vh - 140px);
}

.timeline-pane {
  max-height: 360px;
  overflow-y: auto;
}

.agent-tool-events {
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 10px;
  padding: 8px;
}

.agent-color-block {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  flex: 0 0 auto;
}

.agent-event-chip {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.report-pane {
  max-height: 420px;
  overflow-y: auto;
}

.agent-result-content {
  white-space: pre-wrap;
}

.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>
