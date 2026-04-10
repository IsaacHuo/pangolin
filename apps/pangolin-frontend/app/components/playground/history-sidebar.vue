<template>
  <v-card variant="flat" class="history-sidebar">
    <v-card-title class="text-subtitle-1 d-flex align-center">
      <v-icon class="main-icon mr-2">mdi-history</v-icon>
      History
    </v-card-title>
    
    <v-card-text class="pt-2">
      <div class="history-actions d-flex ga-2 mb-4">
        <v-btn class="history-action-btn history-action-btn--primary" flex-grow-1 prepend-icon="mdi-plus" color="primary" @click="newChat">
          New Chat
        </v-btn>
        <v-btn class="history-action-btn history-action-btn--icon" icon="mdi-content-save" variant="tonal" @click="saveCurrent" />
      </div>

      <v-list density="compact" class="bg-transparent pa-0">
        <v-list-item
          v-for="session in sessions"
          :key="session.id"
          class="border rounded mb-2 history-item"
          @click="emit('load', session.messages)"
        >
          <div>
            <div class="text-caption font-weight-bold">
              {{ new Date(session.timestamp).toLocaleString() }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ session.messages.length }} messages
            </div>
          </div>
          <template #append>
            <div class="d-flex">
              <v-btn icon="mdi-download" size="x-small" variant="text" @click.stop="downloadAsJSON(session)" />
              <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click.stop="deleteSession(session.id)" />
            </div>
          </template>
        </v-list-item>
      </v-list>
      <div v-if="!sessions.length" class="text-caption text-medium-emphasis text-center mt-4">
        No saved conversations.
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ChatMessage } from '~/types/api'

interface HistorySession {
  id: string
  timestamp: number
  messages: ChatMessage[]
}

const props = defineProps<{ currentMessages: ChatMessage[] }>()
const emit = defineEmits<{ 
  'load': [messages: ChatMessage[]]
  'new-chat': []
}>()

const sessions = ref<HistorySession[]>([])

function load() {
  try {
    const data = localStorage.getItem('playground-history')
    if (data) {
      sessions.value = JSON.parse(data)
    } else {
      sessions.value = []
    }
  } catch (e) {
    console.error('Failed to load history', e)
    sessions.value = []
  }
}

function save() {
  localStorage.setItem('playground-history', JSON.stringify(sessions.value))
}

onMounted(() => {
  load()
})

const saveCurrent = () => {
  if (props.currentMessages.length === 0) {
    return
  }
  sessions.value.unshift({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    messages: JSON.parse(JSON.stringify(props.currentMessages))
  })
  save()
}

const newChat = () => {
  if (props.currentMessages.length > 0) {
    saveCurrent()
  }
  emit('new-chat')
}

const deleteSession = (id: string) => {
  sessions.value = sessions.value.filter(s => s.id !== id)
  save()
}

const downloadAsJSON = (session: HistorySession) => {
  const data = JSON.stringify(session.messages, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-history-${session.timestamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style lang="scss" scoped>
.history-sidebar {
  padding: 8px 0;
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.12) !important;
  background: rgb(var(--v-theme-surface));

  .history-actions {
    align-items: stretch;
  }

  .history-action-btn {
    min-height: 56px;
    height: 56px;
  }

  .history-action-btn--icon {
    min-width: 56px;
    width: 56px;
    padding: 0;
  }

  .main-icon {
    font-size: 24px;
  }
  
  .history-item {
    cursor: pointer;
    transition: background 0.2s;
    &:hover {
      background: rgba(var(--v-theme-on-surface), 0.04);
    }
  }
}
</style>
