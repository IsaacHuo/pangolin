<script setup lang="ts">
import { computed } from 'vue'
import { useInjectedFirewallOpsConsole } from '~/composables/useFirewallOpsConsole'

const {
  loading,
  gatewayInfo,
  gatewayMonitor,
  gatewayConfigured,
  gatewayEffectivePort,
  gatewayWsEndpoint,
  gatewayMonitorStatus,
  gatewayMonitorMessage,
  gatewayStatusColor,
  gatewayStatusLabel,
  totalGatewayCatalogTools,
  totalGatewayCatalogSkills,
  gatewayToolsCatalog,
  gatewaySkillsCatalog,
  gatewayManagementError,
  gatewayRefreshLoading,
  refreshGatewayManagement,
  totalSkills,
  newSkill,
  canAddSkill,
  savingSkill,
  addSkill,
  skills,
  skillLabel,
  deletingSkillId,
  removeSkill,
  totalServers,
  newServer,
  transportOptions,
  canAddServer,
  savingServer,
  addMcpServer,
  mcpServers,
  serverLabel,
  deletingServerId,
  removeMcpServer,
} = useInjectedFirewallOpsConsole()

const gatewayBindAddress = computed(() => gatewayMonitor.value?.bind ?? gatewayInfo.value?.bind ?? 'n/a')
const gatewayMode = computed(() => gatewayInfo.value?.mode ?? 'n/a')
const gatewayConfigPath = computed(() => gatewayMonitor.value?.configPath ?? gatewayInfo.value?.configPath ?? 'n/a')
const gatewayPortLabel = computed(() => (gatewayEffectivePort.value != null ? String(gatewayEffectivePort.value) : 'n/a'))
const gatewayStatusMessage = computed(() => gatewayMonitorMessage.value || 'Gateway monitor is ready')
const gatewayTokenState = computed(() => {
  if (gatewayMonitor.value?.hasToken === false) {
    return { label: 'Missing Token', color: 'grey' }
  }
  if (gatewayMonitor.value?.tokenValid === true) {
    return { label: 'Token Valid', color: 'success' }
  }
  if (gatewayMonitor.value?.tokenValid === false) {
    return { label: 'Token Invalid', color: 'error' }
  }
  if (gatewayMonitor.value?.pairingRequired) {
    return { label: 'Pairing Required', color: 'warning' }
  }
  return { label: 'Unknown', color: 'grey' }
})
</script>

<template>
  <v-row class="mt-2">
    <v-col cols="12">
      <v-card>
        <v-card-title class="d-flex align-center flex-wrap ga-2">
          <span>Gateway Management</span>
          <v-spacer />
          <v-chip
            size="small"
            :color="gatewayConfigured ? 'success' : 'grey'"
            variant="tonal"
          >
            {{ gatewayConfigured ? 'Configured' : 'Not Configured' }}
          </v-chip>
          <v-chip
            size="small"
            :color="gatewayStatusColor(gatewayMonitorStatus)"
            variant="tonal"
          >
            {{ gatewayStatusLabel(gatewayMonitorStatus) }}
          </v-chip>
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-refresh"
            :loading="gatewayRefreshLoading"
            :disabled="gatewayRefreshLoading"
            @click="refreshGatewayManagement"
          >
            Refresh Gateway
          </v-btn>
        </v-card-title>
        <v-divider />

        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="3">
              <v-sheet class="gateway-metric" rounded="lg" border>
                <div class="text-caption text-medium-emphasis">Effective Port</div>
                <div class="text-h6">{{ gatewayPortLabel }}</div>
              </v-sheet>
            </v-col>
            <v-col cols="12" md="3">
              <v-sheet class="gateway-metric" rounded="lg" border>
                <div class="text-caption text-medium-emphasis">Gateway Mode</div>
                <div class="text-h6 text-uppercase">{{ gatewayMode }}</div>
              </v-sheet>
            </v-col>
            <v-col cols="12" md="3">
              <v-sheet class="gateway-metric" rounded="lg" border>
                <div class="text-caption text-medium-emphasis">Tool Catalog</div>
                <div class="text-h6">{{ totalGatewayCatalogTools }}</div>
              </v-sheet>
            </v-col>
            <v-col cols="12" md="3">
              <v-sheet class="gateway-metric" rounded="lg" border>
                <div class="text-caption text-medium-emphasis">Skill Catalog</div>
                <div class="text-h6">{{ totalGatewayCatalogSkills }}</div>
              </v-sheet>
            </v-col>
          </v-row>

          <v-row dense class="mt-1">
            <v-col cols="12" md="6">
              <v-list density="compact" lines="two">
                <v-list-item title="Bind Address" :subtitle="gatewayBindAddress" />
                <v-list-item title="WebSocket Endpoint" :subtitle="gatewayWsEndpoint || 'n/a'" />
                <v-list-item title="Config Path" :subtitle="gatewayConfigPath" />
              </v-list>
            </v-col>
            <v-col cols="12" md="6">
              <v-list density="compact" lines="two">
                <v-list-item title="Monitor Message" :subtitle="gatewayStatusMessage" />
                <v-list-item title="Token Status">
                  <template #append>
                    <v-chip size="x-small" :color="gatewayTokenState.color" variant="tonal">
                      {{ gatewayTokenState.label }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-col>
          </v-row>

          <v-row dense class="mt-1">
            <v-col cols="12" md="6">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-2">Gateway Tool Catalog</span>
                <v-spacer />
                <v-chip size="x-small" variant="tonal">{{ totalGatewayCatalogTools }}</v-chip>
              </div>

              <v-list
                v-if="gatewayToolsCatalog.length > 0"
                density="compact"
                lines="two"
              >
                <v-list-item
                  v-for="tool in gatewayToolsCatalog"
                  :key="`${tool.name}-${tool.source ?? 'unknown'}`"
                  :title="tool.name"
                  :subtitle="tool.description || 'No description'"
                >
                  <template #append>
                    <v-chip size="x-small" variant="tonal" color="primary">
                      {{ tool.source || 'gateway' }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>

              <v-alert
                v-else
                type="info"
                variant="tonal"
              >
                No gateway tools discovered.
              </v-alert>
            </v-col>

            <v-col cols="12" md="6">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-2">Gateway Skill Catalog</span>
                <v-spacer />
                <v-chip size="x-small" variant="tonal">{{ totalGatewayCatalogSkills }}</v-chip>
              </div>

              <v-list
                v-if="gatewaySkillsCatalog.length > 0"
                density="compact"
                lines="two"
              >
                <v-list-item
                  v-for="skill in gatewaySkillsCatalog"
                  :key="`${skill.name}-${skill.source ?? 'unknown'}`"
                  :title="skill.name"
                  :subtitle="skill.description || 'No description'"
                >
                  <template #append>
                    <v-chip size="x-small" variant="tonal" color="info">
                      {{ skill.source || 'gateway' }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>

              <v-alert
                v-else
                type="info"
                variant="tonal"
              >
                No gateway skills discovered.
              </v-alert>
            </v-col>
          </v-row>

          <v-alert
            v-if="gatewayManagementError"
            type="warning"
            variant="tonal"
            class="mt-3"
          >
            {{ gatewayManagementError }}
          </v-alert>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" md="6">
      <v-card>
        <v-card-title class="d-flex align-center">
          <span>Custom Skills</span>
          <v-spacer />
          <v-chip size="small" variant="tonal">{{ totalSkills }}</v-chip>
        </v-card-title>
        <v-divider />

        <div class="pa-4">
          <v-row dense>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="newSkill.id"
                label="Skill ID"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="newSkill.name"
                label="Name (optional)"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="newSkill.description"
                label="Description (optional)"
                density="comfortable"
                hide-details
              />
            </v-col>
          </v-row>
          <div class="d-flex justify-end mt-3">
            <v-btn
              color="success"
              prepend-icon="mdi-plus"
              :disabled="!canAddSkill"
              :loading="savingSkill"
              @click="addSkill"
            >
              Save Skill
            </v-btn>
          </div>
        </div>

        <v-divider />

        <v-list lines="two" density="compact">
          <v-list-item
            v-for="skill in skills"
            :key="skill.id"
            :title="skillLabel(skill)"
            :subtitle="skill.description ?? skill.id"
          >
            <template #append>
              <v-btn
                variant="text"
                color="error"
                icon="mdi-delete-outline"
                :loading="deletingSkillId === skill.id"
                @click="removeSkill(skill.id)"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-alert
          v-if="!loading && totalSkills === 0"
          type="info"
          variant="tonal"
          class="ma-4"
        >
          No custom skills configured.
        </v-alert>
      </v-card>
    </v-col>

    <v-col cols="12" md="6">
      <v-card>
        <v-card-title class="d-flex align-center">
          <span>Custom MCP Servers</span>
          <v-spacer />
          <v-chip size="small" variant="tonal">{{ totalServers }}</v-chip>
        </v-card-title>
        <v-divider />

        <div class="pa-4">
          <v-row dense>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="newServer.id"
                label="Server ID"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="newServer.name"
                label="Name (optional)"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-select
                v-model="newServer.transport"
                :items="transportOptions"
                label="Transport"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="newServer.url"
                label="URL / command (optional)"
                density="comfortable"
                hide-details
              />
            </v-col>
          </v-row>
          <div class="d-flex justify-end mt-3">
            <v-btn
              color="warning"
              prepend-icon="mdi-plus"
              :disabled="!canAddServer"
              :loading="savingServer"
              @click="addMcpServer"
            >
              Save MCP Server
            </v-btn>
          </div>
        </div>

        <v-divider />

        <v-list lines="two" density="compact">
          <v-list-item
            v-for="server in mcpServers"
            :key="server.id"
            :title="serverLabel(server)"
            :subtitle="server.url ?? 'No URL configured'"
          >
            <template #append>
              <v-chip size="x-small" variant="tonal" color="warning" class="mr-2">
                {{ server.transport ?? 'unknown' }}
              </v-chip>
              <v-btn
                variant="text"
                color="error"
                icon="mdi-delete-outline"
                :loading="deletingServerId === server.id"
                @click="removeMcpServer(server.id)"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-alert
          v-if="!loading && totalServers === 0"
          type="info"
          variant="tonal"
          class="ma-4"
        >
          No custom MCP servers configured.
        </v-alert>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
.gateway-metric {
  padding: 12px;
}
</style>
