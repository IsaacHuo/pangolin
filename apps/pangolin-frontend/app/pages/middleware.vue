<script setup lang="ts">
import { provideFirewallOpsConsole, useFirewallOpsConsole } from '../composables/useFirewallOpsConsole'

definePageMeta({ title: 'Middleware' })

const firewallOpsConsole = useFirewallOpsConsole()
provideFirewallOpsConsole(firewallOpsConsole)
</script>

<template>
  <v-container fluid class="transparent-page min-h-screen">
    <mcp-firewall-ops-header />
    <mcp-firewall-status-alerts />
    <mcp-firewall-metrics-overview />
    <mcp-firewall-escalation-queue-card />
    <mcp-firewall-action-history-card />
    <mcp-firewall-dashboard-stream-card />
    <mcp-firewall-unified-traffic-card />
    <mcp-firewall-observability-grid />
    <mcp-firewall-custom-config-grid />
  </v-container>
</template>

<style scoped>
.min-h-screen {
  min-height: calc(100vh - 64px);
}
</style>
