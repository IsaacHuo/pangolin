/**
 * Composable for fetching the model catalog and computing availability.
 *
 * Uses @tanstack/vue-query (client-side only) instead of Nuxt's useAsyncData
 * to avoid SSR issues and keep model selection resilient even when
 * the backend does not expose /v1/models.
 *
 * Models for providers with a browser-stored API key are "available".
 * Built-in providers like openrouter/demo are always available.
 */
import { computed, ref, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '~/services/api'
import type { ModelInfo, ModelsResponse } from '~/types/api'
import { useApiKeys } from '~/composables/useApiKeys'

const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'openrouter/auto', provider: 'openrouter', name: 'OpenRouter Auto' },
  { id: 'openai/gpt-4o-mini', provider: 'openrouter', name: 'GPT-4o mini (via OpenRouter)' },
  { id: 'anthropic/claude-3.7-sonnet', provider: 'openrouter', name: 'Claude 3.7 Sonnet (via OpenRouter)' },
  { id: 'google/gemini-2.0-flash-001', provider: 'openrouter', name: 'Gemini 2.0 Flash (via OpenRouter)' },
  { id: 'mistralai/mistral-small-3.1', provider: 'openrouter', name: 'Mistral Small 3.1 (via OpenRouter)' },
  { id: 'minimax/minimax-m2.7', provider: 'openrouter', name: 'Minimax-m2.7 (via OpenRouter)' },
]

async function fetchModelCatalog(): Promise<ModelInfo[]> {
  try {
    const response = await api.get<ModelsResponse>('/v1/models')
    const models = response.data?.models
    if (Array.isArray(models) && models.length > 0) {
      return models
    }
    return FALLBACK_MODELS
  } catch {
    return FALLBACK_MODELS
  }
}

/**
 * Shared reactive trigger — lives inside a closure-safe getter so that
 * Nuxt SSR cannot leak it between requests (it's only relevant client-side
 * anyway, but this is the safe pattern).
 */
let _keyVersion: Ref<number> | null = null
function getKeyVersion(): Ref<number> {
  if (!_keyVersion) {_keyVersion = ref(0)}
  return _keyVersion
}

export function useModels() {
  const { hasKeyForProvider } = useApiKeys()
  const keyVersion = getKeyVersion()

  const { data: rawModels, isLoading, error, refetch } = useQuery<ModelInfo[]>({
    queryKey: ['models-catalog'],
    queryFn: fetchModelCatalog,
    staleTime: 0,
  })

  /** Force re-evaluation of model availability (e.g. after adding an API key). */
  function refreshAvailability() {
    keyVersion.value++
  }

  /** All models with an `available` flag based on browser-stored keys. */
  const groupedModels = computed<ModelInfo[]>(() => {
    void keyVersion.value // touch to create reactive dependency
    if (!rawModels.value) {return []}
    return rawModels.value.map((m) => ({
      ...m,
      available:
        m.provider === 'mock'
        || m.provider === 'openrouter'
        || hasKeyForProvider(m.provider),
    }))
  })

  /** Only models that are currently available to use. */
  const availableModels = computed<ModelInfo[]>(() =>
    groupedModels.value.filter((m) => m.available),
  )

  /** Unique providers that have at least one available model. */
  const availableProviders = computed<string[]>(() => {
    const set = new Set(availableModels.value.map((m) => m.provider))
    return [...set]
  })

  return {
    allModels: rawModels,
    groupedModels,
    availableModels,
    availableProviders,
    isLoading,
    error,
    refetch,
    refreshAvailability,
  }
}
