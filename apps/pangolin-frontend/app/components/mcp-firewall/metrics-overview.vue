<script setup lang="ts">
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  totalAudit,
  totalTraces,
  totalDatasets,
  totalSkills,
  totalServers,
  dashboardEventCount,
  totalPendingEscalations,
  visibleEscalationThreatSummary,
  oldestVisibleEscalationAgeLabel,
  escalationSlaMinutes,
  staleVisibleEscalationCount,
  staleCriticalVisibleEscalationCount,
  hasVisibleEscalationSlaBreach,
} = useInjectedFirewallOpsConsole()
</script>

<template>
  <v-row class="mb-1">
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="primary">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Traffic Entries</div>
          <div class="text-h4 font-weight-bold">{{ totalAudit }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="secondary">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">MCP Traces</div>
          <div class="text-h4 font-weight-bold">{{ totalTraces }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="info">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Datasets</div>
          <div class="text-h4 font-weight-bold">{{ totalDatasets }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="success">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Skills</div>
          <div class="text-h4 font-weight-bold">{{ totalSkills }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="warning">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">MCP Servers</div>
          <div class="text-h4 font-weight-bold">{{ totalServers }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="info">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Live Events</div>
          <div class="text-h4 font-weight-bold">{{ dashboardEventCount }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="error">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Escalation Queue</div>
          <div class="text-h4 font-weight-bold">{{ totalPendingEscalations }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="error">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Visible Critical</div>
          <div class="text-h4 font-weight-bold">{{ visibleEscalationThreatSummary.critical }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" color="warning">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">Oldest Escalation</div>
          <div class="text-h5 font-weight-bold">{{ oldestVisibleEscalationAgeLabel }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" :color="hasVisibleEscalationSlaBreach ? 'error' : 'success'">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">SLA Breaches (>{{ escalationSlaMinutes }}m)</div>
          <div class="text-h4 font-weight-bold">{{ staleVisibleEscalationCount }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card variant="tonal" :color="staleCriticalVisibleEscalationCount > 0 ? 'error' : 'success'">
        <v-card-text>
          <div class="text-caption text-medium-emphasis">SLA Critical (>{{ escalationSlaMinutes * 2 }}m)</div>
          <div class="text-h4 font-weight-bold">{{ staleCriticalVisibleEscalationCount }}</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
:deep(.v-card) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  min-height: 116px;
  background: color-mix(in srgb, rgb(var(--v-theme-surface)) 96%, rgb(var(--v-theme-background)) 4%);
}
</style>
