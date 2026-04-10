import { computed, onMounted } from 'vue'
import { useTheme } from 'vuetify'

const THEME_STORAGE_KEY = 'pangolin-theme'
const LEGACY_THEME_STORAGE_KEY = 'ai-protector-theme'

export const useAppTheme = () => {
  const theme = useTheme()
  const isDark = computed(() => theme.global.current.value.dark)

  const toggle = () => {
    theme.global.name.value = isDark.value ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, theme.global.name.value)
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
  }

  onMounted(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
    if (saved && ['dark', 'light'].includes(saved)) {
      theme.global.name.value = saved
      localStorage.setItem(THEME_STORAGE_KEY, saved)
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
    }
  })

  return { isDark, toggle }
}
