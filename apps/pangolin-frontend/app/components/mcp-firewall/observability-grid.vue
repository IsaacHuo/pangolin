<script setup lang="ts">
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  loading,
  totalAudit,
  auditEntries,
  formatTimestamp,
  verdictColor,
  threatColor,
  totalTraces,
  traces,
  traceIdentifier,
  traceCreatedAt,
  totalDatasets,
  datasets,
} = useInjectedFirewallOpsConsole()
</script>

<template>
  <v-row>
    <v-col cols="12" xl="8">
      <v-card>
        <v-card-title class="d-flex align-center">
          <span>Traffic Audit</span>
          <v-spacer />
          <v-chip size="small" variant="tonal">Recent {{ totalAudit }}</v-chip>
        </v-card-title>

        <v-divider />

        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Time</th>
              <th>Verdict</th>
              <th>Threat</th>
              <th>Method</th>
              <th>Session</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in auditEntries" :key="`${entry.id}-${entry.timestamp}`">
              <td class="text-caption">{{ formatTimestamp(entry.timestamp) }}</td>
              <td>
                <v-chip :color="verdictColor(entry.verdict)" size="small" variant="tonal">
                  {{ entry.verdict }}
                </v-chip>
              </td>
              <td>
                <v-chip :color="threatColor(entry.threat_level)" size="small" variant="tonal">
                  {{ entry.threat_level }}
                </v-chip>
              </td>
              <td class="mono text-caption">{{ entry.method || 'n/a' }}</td>
              <td class="mono text-caption">{{ entry.session_id || 'n/a' }}</td>
            </tr>
          </tbody>
        </v-table>

        <v-alert
          v-if="!loading && totalAudit === 0"
          type="info"
          variant="tonal"
          class="ma-4"
        >
          No traffic entries yet.
        </v-alert>
      </v-card>
    </v-col>

    <v-col cols="12" xl="4">
      <v-card class="mb-4">
        <v-card-title class="d-flex align-center">
          <span>MCP Trace Stream</span>
          <v-spacer />
          <v-chip size="small" variant="tonal">{{ totalTraces }}</v-chip>
        </v-card-title>
        <v-divider />

        <v-list lines="two" density="compact">
          <v-list-item
            v-for="trace in traces.slice(0, 12)"
            :key="traceIdentifier(trace)"
            :title="traceIdentifier(trace)"
            :subtitle="traceCreatedAt(trace)"
          >
            <template #append>
              <v-chip
                :color="verdictColor(trace.analysis?.verdict)"
                size="x-small"
                variant="tonal"
              >
                {{ trace.analysis?.verdict ?? 'UNKNOWN' }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>

        <v-alert
          v-if="!loading && totalTraces === 0"
          type="info"
          variant="tonal"
          class="ma-4"
        >
          No traces found.
        </v-alert>
      </v-card>

      <v-card>
        <v-card-title class="d-flex align-center">
          <span>Datasets</span>
          <v-spacer />
          <v-chip size="small" variant="tonal">{{ totalDatasets }}</v-chip>
        </v-card-title>
        <v-divider />

        <v-list lines="two" density="compact">
          <v-list-item
            v-for="dataset in datasets"
            :key="dataset.id ?? dataset.name ?? 'dataset'"
            :title="dataset.name ?? 'Unnamed dataset'"
            :subtitle="dataset.description || 'No description'"
          >
            <template #append>
              <v-chip size="x-small" variant="tonal" :color="dataset.is_public ? 'success' : 'info'">
                {{ dataset.is_public ? 'Public' : 'Private' }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>

        <v-alert
          v-if="!loading && totalDatasets === 0"
          type="info"
          variant="tonal"
          class="ma-4"
        >
          No datasets available.
        </v-alert>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
.mono {
  font-family: 'Lora', 'Noto Serif SC', serif;
}
</style>
