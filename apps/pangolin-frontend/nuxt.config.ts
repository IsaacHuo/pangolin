// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // SPA mode — this is a dashboard app with no SEO needs.
  // Avoids hydration mismatches from browser-only APIs
  // (DOMPurify, localStorage, sessionStorage) used throughout.
  ssr: false,

  modules: [
    'vuetify-nuxt-module',
    '@pinia/nuxt',
    '@nuxt/eslint',
  ],

  css: ['~/assets/global.scss'],

  vuetify: {
    moduleOptions: {
      styles: 'sass',
    },
    vuetifyOptions: {
      theme: {
        defaultTheme: 'light',
        themes: {
          dark: {
            colors: {
              primary: '#F5F5F5',
              secondary: '#DBDBDB',
              info: '#C4C4C4',
              error: '#C53B31',
              warning: '#ADADAD',
              success: '#949494',
              background: '#121212',
              surface: '#1E1E1E',
              'surface-bright': '#252525',
              'surface-light': '#2E2E2E',
              'surface-variant': '#F5F5F5',
              'on-surface-variant': '#151515',
              'on-primary': '#151515',
              'on-secondary': '#151515',
              outline: '#454545',
            },
          },
          light: {
            colors: {
              primary: '#151515',
              secondary: '#2E2E2E',
              info: '#555555',
              error: '#C53B31',
              warning: '#767676',
              success: '#939393',
              background: '#F7F7F7',
              surface: '#FFFFFF',
              'surface-bright': '#FFFFFF',
              'surface-light': '#F2F2F2',
              'surface-variant': '#1F1F1F',
              'on-surface-variant': '#FAFAFA',
              'on-primary': '#FFFFFF',
              'on-secondary': '#FFFFFF',
              outline: '#D3D3D3',
            },
          },
        },
      },
      icons: {
        defaultSet: 'mdi',
      },
    },
  },

  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:9090',
      agentApiBase: 'http://localhost:9090',
      openaiApiBase: 'https://api.openai.com',
      mistralApiBase: 'https://api.mistral.ai',
      openrouterApiBase: 'https://openrouter.ai/api',
    },
  },

  typescript: {
    strict: true,
  },
})
