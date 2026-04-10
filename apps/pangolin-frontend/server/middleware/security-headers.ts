export default defineEventHandler((event) => {
  const config = useRuntimeConfig()

  const apiBase: string = (config.public.apiBase) || 'http://localhost:9090'
  const agentBase: string = (config.public.agentApiBase) || 'http://localhost:9090'

  function toWsOrigin(raw: string): string | null {
    try {
      const parsed = new URL(raw)
      const protocol = parsed.protocol === 'https:' ? 'wss:' : parsed.protocol === 'http:' ? 'ws:' : null
      if (!protocol) {
        return null
      }
      return `${protocol}//${parsed.host}`
    } catch {
      return null
    }
  }

  // Known external LLM provider APIs (for compare page direct calls)
  const providerApis = [
    'https://api.openai.com',
    'https://openrouter.ai',
    'https://api.anthropic.com',
    'https://api.mistral.ai',
    'https://generativelanguage.googleapis.com',
  ].join(' ')

  // Dev mode: allow HMR WebSocket
  const isDev = import.meta.dev
  const devSources = isDev ? ' ws://localhost:3000 ws://localhost:24678 ws://127.0.0.1:3000 ws://127.0.0.1:24678' : ''

  const wsOrigins = [toWsOrigin(apiBase), toWsOrigin(agentBase)]
    .filter((value): value is string => Boolean(value))
    .join(' ')

  const connectSrc = `'self' ${apiBase} ${agentBase} ${providerApis}${wsOrigins ? ` ${wsOrigins}` : ''}${devSources}`

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  setHeaders(event, {
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'X-XSS-Protection': '0',
  })
})
