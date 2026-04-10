<template>
  <v-container fluid class="pa-0 agent-page">
    <v-tabs v-model="activeTab" color="primary" class="agent-tabs px-3 pt-2">
      <v-tab value="studio">
        <v-icon start>mdi-robot-multiple</v-icon>
        Agent Studio
      </v-tab>
      <v-tab value="security">
        <v-icon start>mdi-shield-search</v-icon>
        Security Demo
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="agent-window">
      <v-window-item value="studio">
        <agent-studio />
      </v-window-item>
      <v-window-item value="security">
        <agent-security-demo />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ title: 'Agent Studio' })

const activeTab = ref<'studio' | 'security'>('studio')
</script>

<style scoped>
.agent-page {
  min-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
}

.agent-tabs {
  border-bottom: 1px solid rgba(var(--v-theme-outline), 0.35);
}

.agent-window {
  flex: 1;
  min-height: 0;
}
</style>
