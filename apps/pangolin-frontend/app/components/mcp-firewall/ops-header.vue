<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  firewallSupplementService,
  lastUpdated,
  dashboardConnected,
  streamPaused,
  totalPendingEscalations,
  dashboardReconnectDelaySeconds,
  dashboardReconnectAttempts,
  dashboardThreatFilter,
  dashboardActionableOnly,
  dashboardQuery,
  dashboardPresetName,
  selectedDashboardPresetId,
  dashboardThreatFilterOptions,
  dashboardPresetOptions,
  hasActiveDashboardFilters,
  activeDashboardFilterCount,
  canSaveDashboardPreset,
  selectedDashboardPreset,
  selectedDashboardPresetDirty,
  canUpdateSelectedDashboardPreset,
  dashboardPresetImportPending,
  visiblePendingEscalationCount,
  dashboardBatchActionPending,
  reconnectDashboardStream,
  toggleStreamPaused,
  resetDashboardFilters,
  saveDashboardPreset,
  applySelectedDashboardPreset,
  deleteSelectedDashboardPreset,
  updateSelectedDashboardPreset,
  exportDashboardPresets,
  importDashboardPresets,
  resolveVisibleEscalations,
  acknowledgeVisibleEscalations,
  loading,
  refresh,
} = useInjectedFirewallOpsConsole()

const queryInputRef = ref<{ focus?: () => void } | null>(null)
const presetFileInputRef = ref<HTMLInputElement | null>(null)

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function handleGlobalFilterShortcut(event: KeyboardEvent): void {
  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey && !isEditableTarget(event.target)) {
    const key = event.key.toLowerCase()
    if (key === 'a') {
      event.preventDefault()
      if (!dashboardBatchActionPending.value && visiblePendingEscalationCount.value > 0) {
        void resolveVisibleEscalations('allow')
      }
      return
    }
    if (key === 'b') {
      event.preventDefault()
      if (!dashboardBatchActionPending.value && visiblePendingEscalationCount.value > 0) {
        void resolveVisibleEscalations('block')
      }
      return
    }
    if (key === 'k') {
      event.preventDefault()
      if (!dashboardBatchActionPending.value && visiblePendingEscalationCount.value > 0) {
        acknowledgeVisibleEscalations()
      }
      return
    }
  }

  const quickPresetKeys = new Set(['1', '2', '3', '4', '5'])

  if (
    quickPresetKeys.has(event.key)
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !isEditableTarget(event.target)
  ) {
    const index = Number(event.key) - 1
    const targetPreset = dashboardPresetOptions.value[index]
    if (targetPreset) {
      selectedDashboardPresetId.value = targetPreset.value
      applySelectedDashboardPreset()
      event.preventDefault()
    }
    return
  }

  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }
  if (isEditableTarget(event.target)) {
    return
  }

  event.preventDefault()
  queryInputRef.value?.focus?.()
}

function openPresetImportDialog(): void {
  presetFileInputRef.value?.click()
}

function handlePresetFileChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0] ?? null
  void importDashboardPresets(file)
  if (input) {
    input.value = ''
  }
}

onMounted(() => {
  if (!import.meta.client) {
    return
  }
  window.addEventListener('keydown', handleGlobalFilterShortcut)
})

onBeforeUnmount(() => {
  if (!import.meta.client) {
    return
  }
  window.removeEventListener('keydown', handleGlobalFilterShortcut)
})
</script>

<template>
  <div class="d-flex align-center flex-wrap ga-3 mb-4">
    <input
      ref="presetFileInputRef"
      type="file"
      accept="application/json"
      class="d-none"
      @change="handlePresetFileChange"
    >

    <div>
      <p class="text-body-2 text-medium-emphasis mb-1">
        Pangolin endpoint: {{ firewallSupplementService.baseURL }}
      </p>
      <p class="text-body-2 text-medium-emphasis mb-1">
        Dashboard stream: {{ firewallSupplementService.dashboardWsURL }}
      </p>
      <p v-if="lastUpdated" class="text-caption text-medium-emphasis mb-0">
        Last updated: {{ lastUpdated.toLocaleString() }}
      </p>
    </div>

    <v-spacer />

    <v-chip :color="dashboardConnected ? 'success' : 'grey'" variant="tonal" size="small">
      {{ dashboardConnected ? 'Dashboard Connected' : 'Dashboard Disconnected' }}
    </v-chip>

    <v-chip :color="streamPaused ? 'warning' : 'success'" variant="tonal" size="small">
      Capture {{ streamPaused ? 'Paused' : 'Active' }}
    </v-chip>

    <v-chip :color="totalPendingEscalations > 0 ? 'error' : 'success'" variant="tonal" size="small">
      Pending Escalations: {{ totalPendingEscalations }}
    </v-chip>

    <v-chip v-if="hasActiveDashboardFilters" color="primary" variant="tonal" size="small">
      Active Filters: {{ activeDashboardFilterCount }}
    </v-chip>

    <v-chip
      v-if="dashboardReconnectDelaySeconds != null"
      color="warning"
      variant="tonal"
      size="small"
    >
      Reconnect ~{{ dashboardReconnectDelaySeconds }}s (try {{ dashboardReconnectAttempts }})
    </v-chip>

    <v-btn
      variant="text"
      prepend-icon="mdi-wifi-refresh"
      @click="reconnectDashboardStream"
    >
      Reconnect Stream
    </v-btn>

    <v-btn
      variant="text"
      :prepend-icon="streamPaused ? 'mdi-play-circle-outline' : 'mdi-pause-circle-outline'"
      @click="toggleStreamPaused"
    >
      {{ streamPaused ? 'Resume Stream' : 'Pause Stream' }}
    </v-btn>

    <v-btn
      color="primary"
      :loading="loading"
      prepend-icon="mdi-refresh"
      @click="refresh"
    >
      Refresh
    </v-btn>

    <v-text-field
      ref="queryInputRef"
      v-model="dashboardQuery"
      class="mcp-query-field"
      label="Filter request / session / method"
      variant="outlined"
      density="compact"
      hide-details
      clearable
      prepend-inner-icon="mdi-magnify"
      @keydown.esc.stop.prevent="dashboardQuery = ''"
    />

    <v-chip class="mcp-shortcut-chip" variant="outlined" size="small">
      / focus
    </v-chip>

    <v-chip class="mcp-shortcut-chip" variant="outlined" size="small">
      1-5 load
    </v-chip>

    <v-chip class="mcp-shortcut-chip mcp-shortcut-chip-wide" variant="outlined" size="small">
      Shift+A/B/K triage
    </v-chip>

    <v-select
      v-model="dashboardThreatFilter"
      class="mcp-threat-field"
      :items="dashboardThreatFilterOptions"
      label="Threat"
      variant="outlined"
      density="compact"
      hide-details
    />

    <v-switch
      v-model="dashboardActionableOnly"
      color="primary"
      label="Actionable only"
      density="compact"
      hide-details
      class="mcp-actionable-switch"
    />

    <v-btn
      variant="text"
      prepend-icon="mdi-filter-remove-outline"
      :disabled="!hasActiveDashboardFilters"
      @click="resetDashboardFilters"
    >
      Reset Filters
    </v-btn>

    <v-text-field
      v-model="dashboardPresetName"
      class="mcp-preset-name-field"
      label="Preset name"
      variant="outlined"
      density="compact"
      hide-details
      prepend-inner-icon="mdi-content-save-outline"
      @keyup.enter="saveDashboardPreset"
    />

    <v-btn
      variant="text"
      prepend-icon="mdi-content-save-outline"
      :disabled="!canSaveDashboardPreset"
      @click="saveDashboardPreset"
    >
      Save Preset
    </v-btn>

    <v-select
      v-model="selectedDashboardPresetId"
      class="mcp-preset-select-field"
      :items="dashboardPresetOptions"
      label="Saved presets"
      variant="outlined"
      density="compact"
      hide-details
      clearable
    />

    <v-btn
      variant="text"
      prepend-icon="mdi-folder-download-outline"
      :disabled="!selectedDashboardPresetId"
      @click="applySelectedDashboardPreset"
    >
      Load Preset
    </v-btn>

    <v-btn
      variant="text"
      color="error"
      prepend-icon="mdi-delete-outline"
      :disabled="!selectedDashboardPresetId"
      @click="deleteSelectedDashboardPreset"
    >
      Delete Preset
    </v-btn>

    <v-chip v-if="selectedDashboardPreset" variant="tonal" size="small">
      Current: {{ selectedDashboardPreset.name }}
    </v-chip>

    <v-chip v-if="selectedDashboardPresetDirty" color="warning" variant="tonal" size="small">
      Preset Modified
    </v-chip>

    <v-btn
      variant="text"
      prepend-icon="mdi-content-save-edit-outline"
      :disabled="!canUpdateSelectedDashboardPreset"
      @click="updateSelectedDashboardPreset"
    >
      Update Selected
    </v-btn>

    <v-btn
      variant="text"
      prepend-icon="mdi-file-export-outline"
      :disabled="dashboardPresetOptions.length === 0"
      @click="exportDashboardPresets"
    >
      Export Presets
    </v-btn>

    <v-btn
      variant="text"
      prepend-icon="mdi-file-import-outline"
      :loading="dashboardPresetImportPending"
      @click="openPresetImportDialog"
    >
      Import Presets
    </v-btn>
  </div>
</template>

<style scoped>
.mcp-query-field {
  min-width: 260px;
  max-width: 360px;
}

.mcp-threat-field {
  min-width: 200px;
  max-width: 260px;
}

.mcp-actionable-switch {
  min-width: 160px;
}

.mcp-shortcut-chip {
  min-width: 72px;
}

.mcp-shortcut-chip-wide {
  min-width: 140px;
}

.mcp-preset-name-field {
  min-width: 200px;
  max-width: 260px;
}

.mcp-preset-select-field {
  min-width: 220px;
  max-width: 320px;
}
</style>
