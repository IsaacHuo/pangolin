<script setup lang="ts">
import { computed, ref } from 'vue'
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  recentUnifiedTrafficEntries,
  filteredUnifiedTrafficEntries,
  visibleUnifiedTrafficCount,
  hasUnifiedTrafficFilters,
  unifiedTrafficQuery,
  unifiedTrafficSourceFilter,
  unifiedTrafficKindFilter,
  unifiedTrafficAlertsOnly,
  unifiedTrafficSourceOptions,
  unifiedTrafficKindOptions,
  formatTimestamp,
  verdictColor,
  threatColor,
  unifiedTrafficSourceLabel,
  unifiedTrafficSourceColor,
  unifiedTrafficKindLabel,
  unifiedTrafficKindColor,
  applyUnifiedTrafficEntryToDashboard,
  focusEscalationQueueByRequest,
  focusActionHistoryByRequestId,
  clearUnifiedTrafficFilters,
} = useInjectedFirewallOpsConsole()

const unifiedTrafficDetailsOpen = ref(false)
const selectedUnifiedTrafficEntryId = ref<string | null>(null)

const selectedUnifiedTrafficEntry = computed(() => {
  const targetId = selectedUnifiedTrafficEntryId.value
  if (!targetId) {
    return null
  }
  return filteredUnifiedTrafficEntries.value.find((entry) => entry.id === targetId) ?? null
})

function openUnifiedTrafficDetails(entryId: string): void {
  selectedUnifiedTrafficEntryId.value = entryId
  unifiedTrafficDetailsOpen.value = true
}

function closeUnifiedTrafficDetails(): void {
  unifiedTrafficDetailsOpen.value = false
}

function applySelectedEntryToTriage(): void {
  const entry = selectedUnifiedTrafficEntry.value
  if (!entry) {
    return
  }
  applyUnifiedTrafficEntryToDashboard(entry)
}
</script>

<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      <span>Unified Traffic Feed</span>
      <v-spacer />
      <v-chip size="small" variant="tonal">Showing {{ recentUnifiedTrafficEntries.length }} / {{ visibleUnifiedTrafficCount }}</v-chip>
      <v-chip v-if="unifiedTrafficAlertsOnly" color="warning" size="small" variant="tonal">Alerts only</v-chip>
    </v-card-title>

    <v-divider />

    <div class="pa-4 d-flex flex-wrap ga-3">
      <v-text-field
        v-model="unifiedTrafficQuery"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        label="Search method / session / verdict"
        class="unified-query-field"
      />

      <v-select
        v-model="unifiedTrafficSourceFilter"
        :items="unifiedTrafficSourceOptions"
        density="compact"
        variant="outlined"
        hide-details
        label="Source"
        class="unified-source-field"
      />

      <v-select
        v-model="unifiedTrafficKindFilter"
        :items="unifiedTrafficKindOptions"
        density="compact"
        variant="outlined"
        hide-details
        label="Protocol"
        class="unified-kind-field"
      />

      <v-switch
        v-model="unifiedTrafficAlertsOnly"
        density="compact"
        hide-details
        color="warning"
        label="Alerts only"
      />

      <v-btn
        variant="text"
        prepend-icon="mdi-filter-remove-outline"
        :disabled="!hasUnifiedTrafficFilters"
        @click="clearUnifiedTrafficFilters"
      >
        Reset
      </v-btn>
    </div>

    <v-divider />

    <v-table density="comfortable">
      <thead>
        <tr>
          <th>Time</th>
          <th>Source</th>
          <th>Protocol</th>
          <th>Method</th>
          <th>Request</th>
          <th>Verdict</th>
          <th>Threat</th>
          <th>Session</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in recentUnifiedTrafficEntries" :key="entry.id">
          <td class="text-caption">{{ formatTimestamp(entry.rawTimestamp ?? entry.timestamp) }}</td>
          <td>
            <v-chip :color="unifiedTrafficSourceColor(entry.source)" size="x-small" variant="tonal">
              {{ unifiedTrafficSourceLabel(entry.source) }}
            </v-chip>
          </td>
          <td>
            <v-chip :color="unifiedTrafficKindColor(entry.kind)" size="x-small" variant="tonal">
              {{ unifiedTrafficKindLabel(entry.kind) }}
            </v-chip>
          </td>
          <td class="mono text-caption">{{ entry.method }}</td>
          <td class="mono text-caption">{{ entry.requestId ?? 'n/a' }}</td>
          <td>
            <v-chip :color="verdictColor(entry.verdict)" size="x-small" variant="tonal">
              {{ entry.verdict }}
            </v-chip>
          </td>
          <td>
            <v-chip :color="threatColor(entry.threatLevel)" size="x-small" variant="tonal">
              {{ entry.threatLevel }}
            </v-chip>
          </td>
          <td class="mono text-caption">{{ entry.sessionId }}</td>
          <td>
            <div class="d-flex ga-2">
              <v-btn
                size="x-small"
                variant="tonal"
                color="primary"
                @click="openUnifiedTrafficDetails(entry.id)"
              >
                Details
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                color="secondary"
                @click="applyUnifiedTrafficEntryToDashboard(entry)"
              >
                Triage
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                color="warning"
                @click="focusEscalationQueueByRequest(entry.requestId, entry.sessionId)"
              >
                Queue
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                color="info"
                :disabled="!entry.requestId"
                @click="focusActionHistoryByRequestId(entry.requestId)"
              >
                History
              </v-btn>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-alert
      v-if="recentUnifiedTrafficEntries.length === 0"
      type="info"
      variant="tonal"
      class="ma-4"
    >
      {{ hasUnifiedTrafficFilters
        ? 'No unified traffic entries match current filters.'
        : 'No unified traffic entries yet.' }}
    </v-alert>

    <v-navigation-drawer
      v-model="unifiedTrafficDetailsOpen"
      location="right"
      temporary
      width="420"
    >
      <v-card flat>
        <v-card-title class="d-flex align-center">
          <span>Unified Entry Details</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeUnifiedTrafficDetails" />
        </v-card-title>

        <v-divider />

        <v-card-text v-if="selectedUnifiedTrafficEntry" class="d-flex flex-column ga-3">
          <div class="d-flex ga-2 flex-wrap">
            <v-chip :color="unifiedTrafficSourceColor(selectedUnifiedTrafficEntry.source)" size="small" variant="tonal">
              {{ unifiedTrafficSourceLabel(selectedUnifiedTrafficEntry.source) }}
            </v-chip>
            <v-chip :color="unifiedTrafficKindColor(selectedUnifiedTrafficEntry.kind)" size="small" variant="tonal">
              {{ unifiedTrafficKindLabel(selectedUnifiedTrafficEntry.kind) }}
            </v-chip>
            <v-chip :color="verdictColor(selectedUnifiedTrafficEntry.verdict)" size="small" variant="tonal">
              {{ selectedUnifiedTrafficEntry.verdict }}
            </v-chip>
            <v-chip :color="threatColor(selectedUnifiedTrafficEntry.threatLevel)" size="small" variant="tonal">
              {{ selectedUnifiedTrafficEntry.threatLevel }}
            </v-chip>
          </div>

          <div class="text-body-2"><strong>Time:</strong> {{ formatTimestamp(selectedUnifiedTrafficEntry.rawTimestamp ?? selectedUnifiedTrafficEntry.timestamp) }}</div>
          <div class="text-body-2"><strong>Method:</strong> {{ selectedUnifiedTrafficEntry.method }}</div>
          <div class="text-body-2"><strong>Session:</strong> {{ selectedUnifiedTrafficEntry.sessionId }}</div>
          <div class="text-body-2"><strong>Request:</strong> {{ selectedUnifiedTrafficEntry.requestId ?? 'n/a' }}</div>
          <div class="text-body-2"><strong>Score:</strong> {{ selectedUnifiedTrafficEntry.score ?? 'n/a' }}</div>

          <div>
            <div class="text-caption text-medium-emphasis mb-2">Payload Preview</div>
            <pre class="payload-preview">{{ selectedUnifiedTrafficEntry.payloadPreview ?? 'No payload preview available.' }}</pre>
          </div>
        </v-card-text>

        <v-card-text v-else>
          <v-alert type="info" variant="tonal">Entry is not available under current filters.</v-alert>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4 d-flex ga-2 justify-end">
          <v-btn
            variant="tonal"
            color="warning"
            :disabled="!selectedUnifiedTrafficEntry"
            @click="focusEscalationQueueByRequest(selectedUnifiedTrafficEntry?.requestId ?? null, selectedUnifiedTrafficEntry?.sessionId)"
          >
            Open Queue Context
          </v-btn>
          <v-btn
            variant="tonal"
            color="info"
            :disabled="!selectedUnifiedTrafficEntry?.requestId"
            @click="focusActionHistoryByRequestId(selectedUnifiedTrafficEntry?.requestId ?? null)"
          >
            Open History Context
          </v-btn>
          <v-btn
            variant="tonal"
            color="secondary"
            :disabled="!selectedUnifiedTrafficEntry"
            @click="applySelectedEntryToTriage"
          >
            Apply To Triage
          </v-btn>
          <v-btn variant="text" @click="closeUnifiedTrafficDetails">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-navigation-drawer>
  </v-card>
</template>

<style scoped>
.unified-query-field {
  min-width: 260px;
  max-width: 380px;
}

.unified-source-field {
  min-width: 180px;
  max-width: 220px;
}

.unified-kind-field {
  min-width: 180px;
  max-width: 220px;
}

.mono {
  font-family: 'Lora', 'Noto Serif SC', serif;
}

.payload-preview {
  max-height: 260px;
  overflow: auto;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(0, 0, 0, 0.02);
}
</style>
