<template>
  <div>
    <v-list density="compact" nav color="primary" class="mt-2">
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :title="item.title"
        active-class="nav-item--active"
        exact
      >
        <template #prepend>
          <v-icon :icon="item.icon" size="20" />
        </template>
      </v-list-item>
      <v-divider class="my-2" />
      <v-list-subheader>Manage</v-list-subheader>
      <v-list-item
        v-for="item in manageItems"
        :key="item.to"
        :to="item.to"
        :title="item.title"
        active-class="nav-item--active"
        exact
      >
        <template #prepend>
          <v-icon :icon="item.icon" size="20" />
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
interface NavItem {
  title: string
  icon: string
  to: string
}

const navItems: NavItem[] = [
  { title: 'Playground', icon: 'mdi-chat-processing', to: '/playground' },
  { title: 'Compare', icon: 'mdi-compare', to: '/compare' },
  { title: 'Agent Studio', icon: 'mdi-robot', to: '/agent' },
  { title: 'Agent Traces', icon: 'mdi-chart-timeline-variant', to: '/agent-traces' },
  { title: 'Middleware', icon: 'mdi-server-security', to: '/middleware' },
  { title: 'Security Rules', icon: 'mdi-shield-lock-outline', to: '/rules' },
]

const manageItems: NavItem[] = [
  { title: 'Policies', icon: 'mdi-shield-lock', to: '/policies' },
  { title: 'Request Log', icon: 'mdi-format-list-bulleted', to: '/requests' },
  { title: 'Analytics', icon: 'mdi-chart-bar', to: '/analytics' },
  { title: 'Settings', icon: 'mdi-cog', to: '/settings' },
]
</script>

<style lang="scss" scoped>
:deep(.v-list-item-title) {
  font-size: 16px !important;
}

:deep(.nav-item--active) {
  border-radius: 12px !important;
  background: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
  border: 1px solid rgb(var(--v-theme-primary));

  .v-list-item__overlay {
    opacity: 0 !important;
  }

  .v-icon {
    color: rgb(var(--v-theme-on-primary)) !important;
  }
}
</style>
