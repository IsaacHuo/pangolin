<script setup lang="ts">
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  errorMessage,
  dashboardError,
  operationError,
  operationMessage,
} = useInjectedFirewallOpsConsole()
</script>

<template>
  <v-alert
    v-if="errorMessage"
    type="error"
    variant="tonal"
    border="start"
    class="mb-4"
  >
    {{ errorMessage }}
  </v-alert>

  <v-alert
    v-if="dashboardError"
    type="warning"
    variant="tonal"
    border="start"
    class="mb-4"
  >
    {{ dashboardError }}
  </v-alert>

  <v-alert
    v-if="operationError"
    type="error"
    variant="tonal"
    border="start"
    class="mb-4"
  >
    {{ operationError }}
  </v-alert>

  <v-alert
    v-if="operationMessage"
    type="success"
    variant="tonal"
    border="start"
    class="mb-4"
  >
    {{ operationMessage }}
  </v-alert>
</template>
