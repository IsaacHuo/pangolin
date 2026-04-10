<script setup lang="ts">
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  actionHistoryCount,
  visibleActionHistoryCount,
  hasActionHistoryFilters,
  canUndoAction,
  recentActionHistory,
  actionHistoryQuery,
  actionHistoryFilterType,
  actionHistoryFilterOptions,
  formatTimestamp,
  actionColor,
  actionLabel,
  focusUnifiedTrafficByRequestId,
  undoLastAction,
  clearActionHistory,
  clearActionHistoryFilters,
} = useInjectedFirewallOpsConsole()
</script>

<template>
  <v-card id="mcp-action-history-card" class="mb-4">
    <v-card-title class="d-flex align-center">
      <span>Action History</span>
      <v-spacer />
      <v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-undo-variant"
        :disabled="!canUndoAction"
        @click="undoLastAction"
      >
        Undo Last
      </v-btn>
      <v-btn
        variant="text"
        size="small"
        color="error"
        prepend-icon="mdi-trash-can-outline"
        :disabled="actionHistoryCount === 0"
        @click="clearActionHistory"
      >
        Clear
      </v-btn>
      <v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-filter-remove-outline"
        :disabled="!hasActionHistoryFilters"
        @click="clearActionHistoryFilters"
      >
        Reset History Filters
      </v-btn>
      <v-chip size="small" variant="tonal">{{ visibleActionHistoryCount }} / {{ actionHistoryCount }}</v-chip>
    </v-card-title>
    <v-divider />

    <div class="pa-4 d-flex flex-wrap ga-3">
      <v-text-field
        v-model="actionHistoryQuery"
        label="Filter request id"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="history-filter-query"
      />
      <v-select
        v-model="actionHistoryFilterType"
        :items="actionHistoryFilterOptions"
        label="Action"
        density="compact"
        variant="outlined"
        hide-details
        class="history-filter-type"
      />
    </div>

    <v-divider />

    <v-list lines="two" density="compact">
      <v-list-item
        v-for="record in recentActionHistory"
        :key="`${record.requestId}-${record.timestamp}-${record.action}`"
        :title="record.requestId"
        :subtitle="formatTimestamp(record.timestamp)"
      >
        <template #append>
          <div class="d-flex ga-2">
            <v-chip :color="actionColor(record.action)" size="x-small" variant="tonal">
              {{ actionLabel(record.action) }}
            </v-chip>
            <v-btn
              size="x-small"
              color="secondary"
              variant="tonal"
              @click="focusUnifiedTrafficByRequestId(record.requestId)"
            >
              Feed
            </v-btn>
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-alert
      v-if="visibleActionHistoryCount === 0"
      type="info"
      variant="tonal"
      class="ma-4"
    >
      {{ actionHistoryCount === 0 ? 'No actions yet.' : 'No actions match the current history filters.' }}
    </v-alert>
  </v-card>
</template>

<style scoped>
.history-filter-query {
  min-width: 240px;
  max-width: 360px;
}

.history-filter-type {
  min-width: 180px;
  max-width: 220px;
}
</style>
