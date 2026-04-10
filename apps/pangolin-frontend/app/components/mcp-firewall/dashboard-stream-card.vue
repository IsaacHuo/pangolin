<script setup lang="ts">
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  dashboardViewMode,
  dashboardThreatFilter,
  dashboardActionableOnly,
  dashboardQuery,
  setDashboardViewMode,
  dashboardConnected,
  recentDashboardEvents,
  visibleDashboardEventCount,
  hasActiveDashboardFilters,
  formatTimestamp,
  dashboardMethod,
  dashboardRequestId,
  verdictColor,
  dashboardVerdict,
  threatColor,
  dashboardThreat,
  canResolveEvent,
  onHumanAction,
  dashboardActionPendingId,
} = useInjectedFirewallOpsConsole()
</script>

<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center">
      <span>Dashboard Live Stream</span>
      <v-spacer />
      <div class="d-flex ga-2 mr-3">
        <v-btn
          size="x-small"
          :variant="dashboardViewMode === 'all' ? 'flat' : 'tonal'"
          color="primary"
          @click="setDashboardViewMode('all')"
        >
          All
        </v-btn>
        <v-btn
          size="x-small"
          :variant="dashboardViewMode === 'alert' ? 'flat' : 'tonal'"
          color="warning"
          @click="setDashboardViewMode('alert')"
        >
          Alert
        </v-btn>
        <v-btn
          size="x-small"
          :variant="dashboardViewMode === 'escalate' ? 'flat' : 'tonal'"
          color="error"
          @click="setDashboardViewMode('escalate')"
        >
          Escalate
        </v-btn>
      </div>
      <v-chip
        v-if="dashboardQuery.trim().length > 0"
        size="small"
        variant="tonal"
        class="mr-2"
      >
        Filter: {{ dashboardQuery }}
      </v-chip>
      <v-chip
        v-if="dashboardThreatFilter !== 'all'"
        size="small"
        variant="tonal"
        class="mr-2"
      >
        Threat: {{ dashboardThreatFilter.toUpperCase() }}
      </v-chip>
      <v-chip
        v-if="dashboardActionableOnly"
        size="small"
        color="primary"
        variant="tonal"
        class="mr-2"
      >
        Actionable only
      </v-chip>
      <v-chip size="small" variant="tonal" class="mr-2">
        Showing {{ recentDashboardEvents.length }} / {{ visibleDashboardEventCount }}
      </v-chip>
      <v-chip :color="dashboardConnected ? 'success' : 'grey'" size="small" variant="tonal">
        {{ dashboardConnected ? 'Online' : 'Offline' }}
      </v-chip>
    </v-card-title>
    <v-divider />

    <v-table density="comfortable">
      <thead>
        <tr>
          <th>Time</th>
          <th>Event</th>
          <th>Request</th>
          <th>Verdict</th>
          <th>Threat</th>
          <th>Session</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(event, index) in recentDashboardEvents" :key="`${event.timestamp ?? index}-${index}`">
          <td class="text-caption">{{ formatTimestamp(event.timestamp) }}</td>
          <td class="mono text-caption">{{ dashboardMethod(event) }}</td>
          <td class="mono text-caption">{{ dashboardRequestId(event) ?? 'n/a' }}</td>
          <td>
            <v-chip :color="verdictColor(dashboardVerdict(event))" size="small" variant="tonal">
              {{ dashboardVerdict(event) }}
            </v-chip>
          </td>
          <td>
            <v-chip :color="threatColor(dashboardThreat(event))" size="small" variant="tonal">
              {{ dashboardThreat(event) }}
            </v-chip>
          </td>
          <td class="mono text-caption">{{ event.session_id ?? 'n/a' }}</td>
          <td>
            <div v-if="canResolveEvent(event)" class="d-flex ga-2">
              <v-btn
                size="x-small"
                color="success"
                variant="tonal"
                :loading="dashboardActionPendingId === dashboardRequestId(event)"
                @click="onHumanAction(event, 'allow')"
              >
                Allow
              </v-btn>
              <v-btn
                size="x-small"
                color="error"
                variant="tonal"
                :loading="dashboardActionPendingId === dashboardRequestId(event)"
                @click="onHumanAction(event, 'block')"
              >
                Block
              </v-btn>
            </div>
            <span v-else class="text-caption text-medium-emphasis">-</span>
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-alert
      v-if="recentDashboardEvents.length === 0"
      type="info"
      variant="tonal"
      class="ma-4"
    >
      {{ hasActiveDashboardFilters
        ? 'No dashboard events match the active filters.'
        : 'Waiting for dashboard events. Generate traffic to see live stream updates.' }}
    </v-alert>
  </v-card>
</template>

<style scoped>
.mono {
  font-family: 'Lora', 'Noto Serif SC', serif;
}
</style>
