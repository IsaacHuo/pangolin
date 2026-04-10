/**
 * Agent Firewall — State Management & API Composables
 */

import { ref, computed, onMounted, onUnmounted } from "vue";
import type {
  Stats,
  FirewallEvent,
  FirewallConfig,
  RulesConfig,
  PatternRule,
  TestPayload,
  TestResult,
  AuditEntry,
  NavSection,
  SkillStatusReport,
  SkillStatusEntry,
  AgentsListResult,
  GatewayAgentRow,
  AgentFileEntry,
  AgentToolsPolicy,
  GatewayConfigSnapshot,
  GatewayConfigSchema,
} from "./types";
import { useAsyncState } from "./composables/useAsyncState";

// ── API Base ────────────────────────────────────────────────────────

const API_BASE = `${window.location.protocol}//${window.location.hostname}:9090`;
const WS_BASE = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:9090`;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── WebSocket Connection ────────────────────────────────────────────

export function useWebSocket() {
  const connected = ref(false);
  const events = ref<FirewallEvent[]>([]);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) {
      return;
    }

    ws = new WebSocket(`${WS_BASE}/ws/dashboard`);

    ws.addEventListener("open", () => {
      connected.value = true;
      console.log("[Firewall] WebSocket connected");
    });

    ws.addEventListener("message", (event) => {
      try {
        const data: FirewallEvent = JSON.parse(String(event.data));
        events.value.push(data);
        // Keep last 500 events
        if (events.value.length > 500) {
          events.value = events.value.slice(-500);
        }
      } catch (err) {
        console.error("[Firewall] WebSocket parse error:", err);
      }
    });

    ws.addEventListener("close", () => {
      connected.value = false;
      console.log("[Firewall] WebSocket disconnected");
      // Auto-reconnect
      reconnectTimer = setTimeout(connect, 3000);
    });

    ws.addEventListener("error", (err) => {
      console.error("[Firewall] WebSocket error:", err);
    });
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    ws?.close();
  }

  function clearEvents() {
    events.value = [];
  }

  function sendVerdict(requestId: string, action: "allow" | "block") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, request_id: requestId }));
    }
  }

  onMounted(connect);
  onUnmounted(disconnect);

  return { connected, events, clearEvents, sendVerdict };
}

// ── Stats Polling ───────────────────────────────────────────────────

export function useStats() {
  const stats = ref<Stats>({
    uptime_seconds: 0,
    active_sessions: 0,
    dashboard_clients: 0,
    audit: null,
  });
  const loading = ref(false);
  let interval: ReturnType<typeof setInterval> | null = null;

  async function fetchStats() {
    try {
      loading.value = true;
      stats.value = await apiFetch<Stats>("/api/stats");
    } catch (err) {
      console.error("[Firewall] Failed to fetch stats:", err);
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void fetchStats();
    interval = setInterval(() => {
      void fetchStats();
    }, 5000);
  });

  onUnmounted(() => {
    if (interval) {
      clearInterval(interval);
    }
  });

  return { stats, loading, refresh: fetchStats };
}

// ── Configuration API ───────────────────────────────────────────────

export function useConfig() {
  const config = ref<FirewallConfig | null>(null);

  const {
    loading,
    error: loadError,
    execute: loadConfig,
  } = useAsyncState(async () => {
    config.value = await apiFetch<FirewallConfig>("/api/config");
  }, "Failed to load config");

  const {
    loading: saving,
    error: saveError,
    execute: saveConfig,
  } = useAsyncState(async (newConfig: Partial<FirewallConfig>) => {
    config.value = await apiFetch<FirewallConfig>("/api/config", {
      method: "PATCH",
      body: JSON.stringify(newConfig),
    });
  }, "Failed to save config");

  const error = computed(() => loadError.value || saveError.value);

  return { config, loading, saving, error, loadConfig, saveConfig };
}

// ── Rules API ───────────────────────────────────────────────────────

export function useRules() {
  const rules = ref<RulesConfig>({
    pattern_rules: [],
    method_rules: [],
    agent_rules: [],
    default_action: "ALLOW",
  });

  const {
    loading,
    error: loadError,
    execute: loadRules,
  } = useAsyncState(async () => {
    rules.value = await apiFetch<RulesConfig>("/api/rules");
  }, "Failed to load rules");

  const {
    loading: saving,
    error: saveError,
    execute: _saveAction,
  } = useAsyncState(async (fn: () => Promise<void>) => await fn(), "Failed to save rule");

  const saveRule = async (rule: PatternRule) =>
    _saveAction(async () => {
      await apiFetch<PatternRule>("/api/rules/patterns", {
        method: rule.id ? "PUT" : "POST",
        body: JSON.stringify(rule),
      });
      await loadRules();
    });

  const deleteRule = async (ruleId: string) =>
    _saveAction(async () => {
      await apiFetch(`/api/rules/patterns/${ruleId}`, { method: "DELETE" });
      await loadRules();
    });

  const toggleRule = async (ruleId: string, enabled: boolean) =>
    _saveAction(async () => {
      await apiFetch(`/api/rules/patterns/${ruleId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      await loadRules();
    });

  const error = computed(() => loadError.value || saveError.value);

  return { rules, loading, saving, error, loadRules, saveRule, deleteRule, toggleRule };
}

// ── Security Test API ───────────────────────────────────────────────

export function useSecurityTest() {
  const results = ref<TestResult[]>([]);
  const running = ref(false);
  const error = ref<string | null>(null);

  async function runTest(payload: TestPayload): Promise<TestResult> {
    const start = performance.now();
    try {
      const result = await apiFetch<{
        verdict: string;
        l1_patterns: string[];
        l2_confidence: number;
      }>("/api/test/analyze", {
        method: "POST",
        body: JSON.stringify({ payload: payload.payload }),
      });

      const testResult: TestResult = {
        payload_id: payload.id,
        actual_verdict: result.verdict as TestResult["actual_verdict"],
        expected_verdict: payload.expected_verdict,
        passed: result.verdict === payload.expected_verdict,
        l1_patterns: result.l1_patterns,
        l2_confidence: result.l2_confidence,
        latency_ms: performance.now() - start,
        timestamp: Date.now(),
      };

      results.value.push(testResult);
      return testResult;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Test failed";
      throw err;
    }
  }

  async function runBatch(payloads: TestPayload[]) {
    running.value = true;
    error.value = null;
    results.value = [];

    for (const payload of payloads) {
      try {
        await runTest(payload);
      } catch {
        // Continue with other tests
      }
    }

    running.value = false;
  }

  function clearResults() {
    results.value = [];
  }

  const summary = computed(() => {
    const total = results.value.length;
    const passed = results.value.filter((r) => r.passed).length;
    const avgLatency =
      total > 0 ? results.value.reduce((sum, r) => sum + r.latency_ms, 0) / total : 0;
    return { total, passed, failed: total - passed, avgLatency };
  });

  return { results, running, error, runTest, runBatch, clearResults, summary };
}

// ── Audit Log API ───────────────────────────────────────────────────

export function useAuditLog() {
  const entries = ref<AuditEntry[]>([]);
  const loading = ref(false);
  const hasMore = ref(true);
  const error = ref<string | null>(null);

  async function loadEntries(options?: {
    limit?: number;
    offset?: number;
    verdict?: string;
    since?: number;
  }) {
    try {
      loading.value = true;
      error.value = null;
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set("limit", String(options.limit));
      }
      if (options?.offset) {
        params.set("offset", String(options.offset));
      }
      if (options?.verdict) {
        params.set("verdict", options.verdict);
      }
      if (options?.since) {
        params.set("since", String(options.since));
      }

      const result = await apiFetch<{ entries: AuditEntry[]; has_more: boolean }>(
        `/api/audit?${params}`,
      );
      entries.value = result.entries;
      hasMore.value = result.has_more;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load audit log";
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(limit = 50) {
    if (!hasMore.value || loading.value) {
      return;
    }

    try {
      loading.value = true;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(entries.value.length),
      });

      const result = await apiFetch<{ entries: AuditEntry[]; has_more: boolean }>(
        `/api/audit?${params}`,
      );
      entries.value = [...entries.value, ...result.entries];
      hasMore.value = result.has_more;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load more entries";
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, hasMore, error, loadEntries, loadMore };
}

// ── Theme ───────────────────────────────────────────────────────────

export type Theme = "dark" | "light";

export function useTheme() {
  const theme = ref<Theme>((localStorage.getItem("af-theme") as Theme) || "dark");

  function applyTheme(t: Theme) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("af-theme", t);
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    applyTheme(theme.value);
  }

  onMounted(() => {
    applyTheme(theme.value);
  });

  return { theme, toggleTheme };
}

// ── Navigation ──────────────────────────────────────────────────────

export function useNavigation() {
  const currentSection = ref<NavSection>("chat");

  const validSections = new Set<NavSection>([
    "chat",
    "schematic",
    "traffic",
    "rules",
    "engine",
    "rate-limit",
    "test",
    "audit",
    "playground",
    "datasets",
    "traces",
    "skills",
    "agents",
    "benchmark",
    "pentest",
    "integrations",
    "gateway-config",
  ]);

  function normalizeSection(section: string | null | undefined): NavSection {
    const candidate = (section || "").trim() as NavSection;
    if (candidate === "gateway-config") {
      return "engine";
    }
    if (validSections.has(candidate)) {
      return candidate;
    }
    return "chat";
  }

  function navigateTo(section: NavSection) {
    const normalized = normalizeSection(section);
    currentSection.value = normalized;
    history.pushState({ section: normalized }, "", `#${normalized}`);
  }

  // Handle browser back/forward
  function handlePopState(event: PopStateEvent) {
    if (event.state?.section) {
      currentSection.value = normalizeSection(String(event.state.section));
    }
  }

  onMounted(() => {
    // Initialize from URL hash
    const hash = window.location.hash.slice(1);
    const normalized = normalizeSection(hash);
    currentSection.value = normalized;
    if (hash && hash !== normalized) {
      history.replaceState({ section: normalized }, "", `#${normalized}`);
    }
    window.addEventListener("popstate", handlePopState);
  });

  onUnmounted(() => {
    window.removeEventListener("popstate", handlePopState);
  });

  return { currentSection, navigateTo };
}

// ── Gateway WebSocket RPC Client ────────────────────────────────────

let gwWsUrl = localStorage.getItem("af-gateway-url") || `ws://${window.location.hostname}:18789/ws`;

let gwSocket: WebSocket | null = null;
type GatewayPendingRequest = {
  resolve: (val: unknown) => void;
  reject: (err: Error) => void;
};
const gwPendingRequests = new Map<string, GatewayPendingRequest>();
const gwConnected = ref(false);
const gwConnectError = ref<string | null>(null);
const gwConnectDetail = ref<string | null>(null);
const gwReconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null);
let gwTokenFetched = false;
let gwAuthRetryAttempted = false;
let gwReconnectAttempts = 0;
let gwDeviceIdentityPromise: Promise<GatewayDeviceIdentity | null> | null = null;

type GatewayDeviceIdentity = {
  deviceId: string;
  publicKeyRawBase64Url: string;
  privateKeyJwk: Record<string, unknown>;
};

const GW_DEVICE_ID_KEY = "af-gateway-device-id";
const GW_DEVICE_PUB_RAW_KEY = "af-gateway-device-pub-raw";
const GW_DEVICE_PRIV_JWK_KEY = "af-gateway-device-priv-jwk";

function toBase64Url(bytes: Uint8Array): string {
  const btoaFn = (globalThis as unknown as { btoa?: (input: string) => string }).btoa;
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  if (btoaFn) {
    return btoaFn(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  }

  // Minimal base64url encoder fallback when btoa is unavailable.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += alphabet[(n >> 6) & 63];
    out += alphabet[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += alphabet[(n >> 6) & 63];
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

function utf8Encode(input: string): Uint8Array {
  const TextEncoderCtor = (
    globalThis as unknown as {
      TextEncoder?: new () => { encode: (value: string) => Uint8Array };
    }
  ).TextEncoder;
  if (TextEncoderCtor) {
    return new TextEncoderCtor().encode(input);
  }
  return Uint8Array.from(input, (ch) => ch.charCodeAt(0) & 0xff);
}

async function loadOrCreateGatewayDeviceIdentity(): Promise<GatewayDeviceIdentity | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }

  try {
    const deviceId = localStorage.getItem(GW_DEVICE_ID_KEY);
    const publicKeyRawBase64Url = localStorage.getItem(GW_DEVICE_PUB_RAW_KEY);
    const privateKeyJwkRaw = localStorage.getItem(GW_DEVICE_PRIV_JWK_KEY);
    if (deviceId && publicKeyRawBase64Url && privateKeyJwkRaw) {
      const privateKeyJwk = JSON.parse(privateKeyJwkRaw) as Record<string, unknown>;
      return { deviceId, publicKeyRawBase64Url, privateKeyJwk };
    }
  } catch {
    // fall through and regenerate
  }

  try {
    const keyPair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as {
      publicKey: unknown;
      privateKey: unknown;
    };

    const publicRaw = new Uint8Array(await subtle.exportKey("raw", keyPair.publicKey as never));
    const digest = new Uint8Array(await subtle.digest("SHA-256", publicRaw));
    const deviceId = toHex(digest);
    const publicKeyRawBase64Url = toBase64Url(publicRaw);
    const privateKeyJwk = (await subtle.exportKey("jwk", keyPair.privateKey as never)) as Record<
      string,
      unknown
    >;

    localStorage.setItem(GW_DEVICE_ID_KEY, deviceId);
    localStorage.setItem(GW_DEVICE_PUB_RAW_KEY, publicKeyRawBase64Url);
    localStorage.setItem(GW_DEVICE_PRIV_JWK_KEY, JSON.stringify(privateKeyJwk));

    return { deviceId, publicKeyRawBase64Url, privateKeyJwk };
  } catch {
    return null;
  }
}

async function getGatewayDeviceIdentity(): Promise<GatewayDeviceIdentity | null> {
  if (!gwDeviceIdentityPromise) {
    gwDeviceIdentityPromise = loadOrCreateGatewayDeviceIdentity();
  }
  return gwDeviceIdentityPromise;
}

function gwReadyStateLabel(state?: number): string {
  if (state === WebSocket.CONNECTING) {
    return "CONNECTING";
  }
  if (state === WebSocket.OPEN) {
    return "OPEN";
  }
  if (state === WebSocket.CLOSING) {
    return "CLOSING";
  }
  if (state === WebSocket.CLOSED) {
    return "CLOSED";
  }
  return "NONE";
}

function gwSetConnectDetail(summary: string, extra: Record<string, unknown> = {}) {
  gwConnectDetail.value = JSON.stringify(
    {
      summary,
      wsUrl: gwWsUrl,
      connected: gwConnected.value,
      socketState: gwReadyStateLabel(gwSocket?.readyState),
      reconnectAttempts: gwReconnectAttempts,
      tokenPresent: Boolean(localStorage.getItem("af-gateway-token")),
      passwordPresent: Boolean(localStorage.getItem("af-gateway-password")),
      time: new Date().toISOString(),
      ...extra,
    },
    null,
    2,
  );
}

async function waitForGatewayReady(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (gwSocket && gwSocket.readyState === WebSocket.OPEN && gwConnected.value) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** Auto-discover gateway token from the backend, then connect. */
async function gwAutoConnect() {
  gwSetConnectDetail("Starting gateway auto-connect");
  if (!gwTokenFetched) {
    gwTokenFetched = true;
    try {
      const resp = await fetch(`${API_BASE}/api/gateway-info`);
      if (resp.ok) {
        const info = await resp.json();
        if (info.configured) {
          // Keep token in sync from backend config so UI never needs manual token input.
          if (info.token) {
            const existingToken = localStorage.getItem("af-gateway-token");
            if (existingToken !== info.token) {
              localStorage.setItem("af-gateway-token", info.token);
              console.log("[Gateway] Synced token from backend config");
            }
          }
          // Update WS URL if port differs
          if (info.port) {
            const host = info.bind === "loopback" ? "127.0.0.1" : window.location.hostname;
            const discoveredUrl = `ws://${host}:${info.port}/ws`;
            gwWsUrl = discoveredUrl;
            localStorage.setItem("af-gateway-url", discoveredUrl);
          }
          gwSetConnectDetail("Synced gateway config from backend", {
            configured: info.configured,
            port: info.port,
            configPath: info.configPath || null,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      gwSetConnectDetail("Failed to fetch /api/gateway-info", { error: message });
      console.warn("[Gateway] Could not fetch gateway info from backend");
    }
  }
  gwConnect();
}

function gwConnect() {
  if (gwSocket?.readyState === WebSocket.OPEN) {
    return;
  }

  gwSetConnectDetail("Opening gateway websocket");

  try {
    gwSocket = new WebSocket(gwWsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    gwConnectError.value = `Failed to create websocket: ${message}`;
    gwSetConnectDetail("Failed to create websocket", { error: message });
    console.warn("[Gateway] Failed to create WebSocket");
    scheduleGwReconnect();
    return;
  }

  if (!gwSocket) {
    scheduleGwReconnect();
    return;
  }

  const socket = gwSocket;

  socket.addEventListener("open", () => {
    gwConnectError.value = null;
    gwSetConnectDetail("WebSocket opened, waiting for connect.challenge");
    console.log("[Gateway] WebSocket opened, waiting for handshake...");
  });

  socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(String(event.data));

      // Handle challenge — auto-respond with connect using correct protocol
      if (msg.type === "event" && msg.event === "connect.challenge") {
        const connectId = crypto.randomUUID();
        const token = localStorage.getItem("af-gateway-token") || undefined;
        const password = localStorage.getItem("af-gateway-password") || undefined;
        const authObj = token || password ? { token, password } : undefined;
        const nonce = typeof msg?.payload?.nonce === "string" ? msg.payload.nonce : undefined;
        const role = "operator";
        const scopes = ["operator.admin"];
        const clientId = "gateway-client";
        const clientMode = "backend";
        const signedAtMs = Date.now();
        gwSetConnectDetail("Received connect.challenge and sending connect request", {
          requestId: connectId,
          hasAuth: Boolean(authObj),
        });
        gwPendingRequests.set(connectId, {
          resolve: (payload: unknown) => {
            // hello-ok received — connection fully established
            gwConnected.value = true;
            gwReconnectAttempts = 0;
            gwAuthRetryAttempted = false;
            const payloadRecord =
              typeof payload === "object" && payload !== null
                ? (payload as Record<string, unknown>)
                : {};
            const authRecord =
              typeof payloadRecord.auth === "object" && payloadRecord.auth !== null
                ? (payloadRecord.auth as Record<string, unknown>)
                : undefined;
            const deviceToken = authRecord?.deviceToken;
            if (typeof deviceToken === "string" && deviceToken.length > 0) {
              localStorage.setItem("af-gateway-token", deviceToken);
            }
            gwSetConnectDetail("Gateway connected", {
              protocol: payloadRecord.protocol,
              role: payloadRecord.role,
            });
            console.log("[Gateway] Connected (hello-ok), protocol:", payloadRecord.protocol);
          },
          reject: (err: Error) => {
            const message = err.message || "connect rejected";
            console.error("[Gateway] Connect rejected:", message);
            gwSetConnectDetail("Gateway connect request rejected", { error: message });

            const isPairingRequired = /NOT_PAIRED|device identity required/i.test(message);
            if (isPairingRequired) {
              gwConnectError.value = "Gateway device pairing required";
              gwSetConnectDetail("Gateway requires device pairing approval", {
                error: message,
                hint: "Run `openclaw devices list` then approve the pending request.",
              });
              return;
            }

            // Retry once with a freshly synced backend token when auth fails.
            const isAuthError = /unauthorized|auth|token/i.test(message);
            if (isAuthError && !gwAuthRetryAttempted) {
              gwAuthRetryAttempted = true;
              gwTokenFetched = false;
              gwConnectError.value = "Auth failed. Retrying with configured token...";
              gwSetConnectDetail("Auth failed; retrying once with backend token", {
                error: message,
              });
              gwDisconnect();
              void gwAutoConnect();
              return;
            }

            gwConnectError.value = message;
          },
        });
        void (async () => {
          const identity = await getGatewayDeviceIdentity();
          let device:
            | {
                id: string;
                publicKey: string;
                signature: string;
                signedAt: number;
                nonce?: string;
              }
            | undefined;

          if (identity) {
            try {
              const subtle = globalThis.crypto?.subtle;
              if (subtle) {
                const privateKey = await subtle.importKey(
                  "jwk",
                  identity.privateKeyJwk as never,
                  { name: "Ed25519" } as never,
                  false,
                  ["sign"],
                );
                const payload = buildDeviceAuthPayload({
                  deviceId: identity.deviceId,
                  clientId,
                  clientMode,
                  role,
                  scopes,
                  signedAtMs,
                  token: token ?? null,
                  nonce: nonce ?? null,
                });
                const payloadBytes = utf8Encode(payload);
                const payloadBuffer = payloadBytes.buffer.slice(
                  payloadBytes.byteOffset,
                  payloadBytes.byteOffset + payloadBytes.byteLength,
                ) as ArrayBuffer;
                const signatureBytes = new Uint8Array(
                  await subtle.sign({ name: "Ed25519" } as never, privateKey, payloadBuffer),
                );
                device = {
                  id: identity.deviceId,
                  publicKey: identity.publicKeyRawBase64Url,
                  signature: toBase64Url(signatureBytes),
                  signedAt: signedAtMs,
                  nonce,
                };
                gwSetConnectDetail("Using signed device identity for connect", {
                  deviceId: identity.deviceId,
                });
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              gwSetConnectDetail("Failed to sign device payload", { error: message });
            }
          } else {
            gwSetConnectDetail("Device identity unavailable; connect may fail", {
              hint: "Browser WebCrypto Ed25519 support is required.",
            });
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "req",
                id: connectId,
                method: "connect",
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: {
                    id: clientId,
                    version: "1.0.0",
                    platform: "web",
                    mode: clientMode,
                  },
                  role,
                  scopes,
                  auth: authObj,
                  device,
                },
              }),
            );
          }
        })();
        return;
      }

      // Handle RPC responses (including hello-ok from connect)
      if (msg.type === "res" && msg.id != null) {
        const pending = gwPendingRequests.get(String(msg.id));
        if (pending) {
          gwPendingRequests.delete(String(msg.id));
          if (msg.ok) {
            pending.resolve(msg.payload);
          } else {
            const code = msg.error?.code;
            const text = msg.error?.message || "RPC failed";
            pending.reject(new Error(code ? `${code}: ${text}` : text));
          }
        }
        return;
      }
    } catch (err) {
      console.error("[Gateway] Parse error:", err);
    }
  });

  socket.addEventListener("close", (event) => {
    gwConnected.value = false;
    const closeMessage = `Gateway socket closed (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ""})`;
    gwConnectError.value = closeMessage;
    gwSetConnectDetail("WebSocket closed", {
      code: event.code,
      reason: event.reason || null,
      wasClean: event.wasClean,
    });
    scheduleGwReconnect();
  });

  socket.addEventListener("error", () => {
    console.warn("[Gateway] WebSocket error");
    gwConnectError.value = `Gateway websocket connection failed (url: ${gwWsUrl})`;
    gwSetConnectDetail("WebSocket error", {
      note: "Browser WebSocket error event does not include low-level reason",
    });
  });
}

function scheduleGwReconnect() {
  if (gwReconnectTimer.value) {
    clearTimeout(gwReconnectTimer.value);
  }
  gwReconnectAttempts += 1;
  gwSetConnectDetail("Scheduling reconnect", { delayMs: 5000 });
  gwReconnectTimer.value = setTimeout(gwAutoConnect, 5000);
}

function gwDisconnect() {
  if (gwReconnectTimer.value) {
    clearTimeout(gwReconnectTimer.value);
  }
  gwSocket?.close();
  gwSocket = null;
}

function gwForceReconnect() {
  gwConnectError.value = null;
  gwTokenFetched = false;
  gwSetConnectDetail("Manual reconnect requested");
  gwDisconnect();
  void gwAutoConnect();
}

async function gwRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (!gwSocket || gwSocket.readyState === WebSocket.CLOSED) {
    gwForceReconnect();
  }

  if (gwSocket && gwSocket.readyState === WebSocket.CONNECTING && !gwConnected.value) {
    gwSetConnectDetail("RPC waiting for in-flight handshake", { method, timeoutMs: 5000 });
  }

  let ready = await waitForGatewayReady(5000);
  if (!ready || !gwSocket || gwSocket.readyState !== WebSocket.OPEN || !gwConnected.value) {
    // One fallback reconnect if the current attempt did not become ready in time.
    gwForceReconnect();
    ready = await waitForGatewayReady(5000);
    if (!ready || !gwSocket || gwSocket.readyState !== WebSocket.OPEN || !gwConnected.value) {
      const message = `Gateway not connected (url: ${gwWsUrl}, state: ${gwReadyStateLabel(gwSocket?.readyState)})`;
      gwConnectError.value = message;
      gwSetConnectDetail("RPC blocked because gateway is not connected", {
        method,
        timeoutMs: 5000,
      });
      throw new Error(message);
    }
  }

  const socket = gwSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN || !gwConnected.value) {
    const message = `Gateway not connected (url: ${gwWsUrl}, state: ${gwReadyStateLabel(socket?.readyState)})`;
    gwConnectError.value = message;
    gwSetConnectDetail("RPC blocked because socket is not open", { method });
    throw new Error(message);
  }

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    gwPendingRequests.set(id, {
      resolve: (val: unknown) => resolve(val as T),
      reject,
    });
    socket.send(JSON.stringify({ type: "req", id, method, params }));

    // Timeout after 30s
    setTimeout(() => {
      if (gwPendingRequests.has(id)) {
        gwPendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 30000);
  });
}

export function useGateway() {
  onMounted(gwAutoConnect);
  onUnmounted(gwDisconnect);

  const gatewayUrl = ref(gwWsUrl);

  function updateGatewayUrl(url: string) {
    localStorage.setItem("af-gateway-url", url);
    gatewayUrl.value = url;
    gwWsUrl = url;
    gwDisconnect();
    gwConnect();
  }

  function setGatewayToken(token: string) {
    if (token) {
      localStorage.setItem("af-gateway-token", token);
    } else {
      localStorage.removeItem("af-gateway-token");
    }
    gwConnectError.value = null;
    gwDisconnect();
    gwConnect();
  }

  function setGatewayPassword(password: string) {
    if (password) {
      localStorage.setItem("af-gateway-password", password);
    } else {
      localStorage.removeItem("af-gateway-password");
    }
    gwConnectError.value = null;
    gwDisconnect();
    gwConnect();
  }

  return {
    connected: gwConnected,
    connectError: gwConnectError,
    connectDetail: gwConnectDetail,
    gatewayUrl,
    updateGatewayUrl,
    setGatewayToken,
    setGatewayPassword,
    reconnect: gwForceReconnect,
    request: gwRequest,
  };
}

/** Read-only gateway connection state — safe to call from any component without lifecycle side effects */
export function useGatewayStatus() {
  return {
    connected: gwConnected,
    connectError: gwConnectError,
    connectDetail: gwConnectDetail,
    reconnect: gwForceReconnect,
  };
}

// ── Skills API (via Gateway RPC) ────────────────────────────────────

export function useGatewaySkills() {
  const skills = ref<SkillStatusEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadSkills(agentId?: string) {
    try {
      loading.value = true;
      error.value = null;
      const report = await gwRequest<SkillStatusReport>(
        "skills.status",
        agentId ? { agentId } : {},
      );
      skills.value = report.skills;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load skills";
    } finally {
      loading.value = false;
    }
  }

  async function toggleSkill(skillKey: string, enabled: boolean) {
    try {
      error.value = null;
      await gwRequest("skills.update", { skillKey, enabled });
      await loadSkills();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to toggle skill";
    }
  }

  async function setSkillApiKey(skillKey: string, apiKey: string) {
    try {
      error.value = null;
      await gwRequest("skills.update", { skillKey, apiKey });
      await loadSkills();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to save API key";
    }
  }

  async function installSkill(name: string, installId: string) {
    try {
      error.value = null;
      await gwRequest("skills.install", { name, installId, timeoutMs: 120000 });
      await loadSkills();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to install skill";
    }
  }

  return { skills, loading, error, loadSkills, toggleSkill, setSkillApiKey, installSkill };
}

// ── Agents API (via Gateway RPC) ────────────────────────────────────

export function useGatewayAgents() {
  const agents = ref<GatewayAgentRow[]>([]);
  const defaultAgentId = ref("");
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadAgents() {
    try {
      loading.value = true;
      error.value = null;
      const result = await gwRequest<AgentsListResult>("agents.list", {});
      agents.value = result.agents;
      defaultAgentId.value = result.defaultId;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load agents";
    } finally {
      loading.value = false;
    }
  }

  async function loadAgentFiles(agentId: string): Promise<AgentFileEntry[]> {
    try {
      const result = await gwRequest<{ files: AgentFileEntry[] }>("agents.files.list", { agentId });
      return result.files;
    } catch {
      return [];
    }
  }

  async function loadAgentFile(agentId: string, name: string): Promise<string> {
    try {
      const result = await gwRequest<{ content: string }>("agents.files.get", { agentId, name });
      return result.content ?? "";
    } catch {
      return "";
    }
  }

  async function saveAgentFile(agentId: string, name: string, content: string) {
    try {
      error.value = null;
      await gwRequest("agents.files.set", { agentId, name, content });
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to save file";
    }
  }

  async function loadAgentToolsPolicy(agentId: string): Promise<AgentToolsPolicy> {
    try {
      error.value = null;
      const result = await gwRequest<{ tools?: AgentToolsPolicy }>("agents.tools.get", { agentId });
      return result.tools ?? {};
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load agent tool policy";
      return {};
    }
  }

  async function saveAgentToolsPolicy(
    agentId: string,
    tools: AgentToolsPolicy,
  ): Promise<AgentToolsPolicy> {
    try {
      error.value = null;
      const result = await gwRequest<{ tools?: AgentToolsPolicy }>("agents.tools.set", {
        agentId,
        tools,
      });
      return result.tools ?? {};
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to save agent tool policy";
      throw err;
    }
  }

  return {
    agents,
    defaultAgentId,
    loading,
    error,
    loadAgents,
    loadAgentFiles,
    loadAgentFile,
    saveAgentFile,
    loadAgentToolsPolicy,
    saveAgentToolsPolicy,
  };
}

// ── Gateway Config API (via Gateway RPC) ────────────────────────────

export function useGatewayConfig() {
  const configSnapshot = ref<GatewayConfigSnapshot | null>(null);
  const configSchema = ref<GatewayConfigSchema | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function loadGwConfig() {
    try {
      loading.value = true;
      error.value = null;
      const [snapshot, schema] = await Promise.all([
        gwRequest<GatewayConfigSnapshot>("config.get", {}),
        gwRequest<GatewayConfigSchema>("config.schema", {}).catch(() => null),
      ]);
      configSnapshot.value = snapshot;
      if (schema) {
        configSchema.value = schema;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load gateway config";
    } finally {
      loading.value = false;
    }
  }

  async function saveGwConfig(raw: string) {
    try {
      saving.value = true;
      error.value = null;
      await gwRequest("config.set", {
        raw,
        baseHash: configSnapshot.value?.hash,
      });
      await loadGwConfig();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to save gateway config";
    } finally {
      saving.value = false;
    }
  }

  async function applyGwConfig(raw: string) {
    try {
      saving.value = true;
      error.value = null;
      await gwRequest("config.apply", {
        raw,
        baseHash: configSnapshot.value?.hash,
        sessionKey: "web-dashboard",
      });
      await loadGwConfig();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to apply gateway config";
    } finally {
      saving.value = false;
    }
  }

  return {
    configSnapshot,
    configSchema,
    loading,
    saving,
    error,
    loadGwConfig,
    saveGwConfig,
    applyGwConfig,
  };
}

// ── Custom MCP/Skill Config ─────────────────────────────────────

export function useCustomConfig() {
  const mcpServers = ref<import("./types").CustomMcpServer[]>([]);
  const customSkills = ref<import("./types").CustomSkillDef[]>([]);

  const {
    loading,
    error: loadError,
    execute: loadCustomConfig,
  } = useAsyncState(async () => {
    const data = await apiFetch<import("./types").CustomConfigData>("/api/custom-config");
    mcpServers.value = data.mcp_servers || [];
    customSkills.value = data.skills || [];
  }, "Failed to load custom config");

  const {
    loading: saving,
    error: saveError,
    execute: _saveAction,
  } = useAsyncState(async (fn: () => Promise<void>) => await fn(), "Failed to update config");

  const saveMcpServer = async (server: import("./types").CustomMcpServer) =>
    _saveAction(async () => {
      await apiFetch("/api/custom-config/mcp-servers", {
        method: "POST",
        body: JSON.stringify(server),
      });
      await loadCustomConfig();
    });

  const deleteMcpServer = async (serverId: string) =>
    _saveAction(async () => {
      await apiFetch(`/api/custom-config/mcp-servers/${serverId}`, { method: "DELETE" });
      await loadCustomConfig();
    });

  const saveCustomSkill = async (skill: import("./types").CustomSkillDef) =>
    _saveAction(async () => {
      await apiFetch("/api/custom-config/skills", {
        method: "POST",
        body: JSON.stringify(skill),
      });
      await loadCustomConfig();
    });

  const deleteCustomSkill = async (skillId: string) =>
    _saveAction(async () => {
      await apiFetch(`/api/custom-config/skills/${skillId}`, { method: "DELETE" });
      await loadCustomConfig();
    });

  const error = computed(() => loadError.value || saveError.value);

  return {
    mcpServers,
    customSkills,
    loading,
    saving,
    error,
    loadCustomConfig,
    saveMcpServer,
    deleteMcpServer,
    saveCustomSkill,
    deleteCustomSkill,
  };
}

// ── Toast Notifications ─────────────────────────────────────────────

export { useToast } from "./composables/useToast";
export { usePenTest } from "./composables/usePenTest";
