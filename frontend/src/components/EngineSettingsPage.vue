<template>
  <div class="merged-settings-page">
    <EngineSettings :config="config" :saving="configSaving" @save="handleSaveConfig" />
    <GatewayConfig />
  </div>
</template>

<script setup lang="ts">
import EngineSettings from './EngineSettings.vue'
import GatewayConfig from './GatewayConfig.vue'
import { useConfig } from '../composables'
import type { FirewallConfig } from '../types'

const { config, saving: configSaving, saveConfig } = useConfig()

function handleSaveConfig(newConfig: Partial<FirewallConfig>) {
  saveConfig(newConfig)
}
</script>
