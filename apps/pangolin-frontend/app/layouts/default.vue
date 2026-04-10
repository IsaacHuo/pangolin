<template>
  <v-app>
    <v-app-bar density="compact" elevation="0" class="app-bar--shadow">
      <v-app-bar-nav-icon
        @click="drawer = !drawer"
      />
      <v-app-bar-title>
        <div class="app-bar-brand">
          <img src="/pangolin.svg" alt="Pangolin" class="app-bar-brand-icon">
          <span class="app-bar-brand-title">Pangolin</span>
        </div>
      </v-app-bar-title>

      <template #append>
        <health-indicator />
      </template>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" width="280">
      <v-divider color="primary" thickness="2" />
      <app-nav-drawer />
    </v-navigation-drawer>

    <v-main>
      <slot />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppMode } from '~/composables/useAppMode'

const drawer = ref(true)
const { fetchMode } = useAppMode()

onMounted(() => {
  fetchMode()
})
</script>

<style lang="scss" scoped>
// Ensure main content fills viewport
.v-main {
  min-height: 100vh;
}

.app-bar-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.app-bar-brand-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
}

.app-bar-brand-title {
  font-family: 'Lora', 'Noto Serif SC', serif;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}

.app-bar--shadow {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08) !important;
}
</style>
