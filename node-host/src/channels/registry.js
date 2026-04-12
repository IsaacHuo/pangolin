import { requireActivePluginRegistry } from "../plugins/runtime.js";
// Channel docking: add new core channels here (order + meta + aliases), then
// register the plugin in its extension entrypoint and keep protocol IDs in sync.
// NOTE: Trimmed to Telegram-only for security testing custom edition.
export const CHAT_CHANNEL_ORDER = [];
export const CHANNEL_IDS = [...CHAT_CHANNEL_ORDER];
export const DEFAULT_CHAT_CHANNEL = null;
const WEBSITE_URL = "https://agent-shield.ai";
const CHAT_CHANNEL_META = {};
export const CHAT_CHANNEL_ALIASES = {};
const normalizeChannelKey = (raw) => {
    const normalized = raw?.trim().toLowerCase();
    return normalized || undefined;
};
export function listChatChannels() {
    return CHAT_CHANNEL_ORDER.map((id) => CHAT_CHANNEL_META[id]);
}
export function listChatChannelAliases() {
    return Object.keys(CHAT_CHANNEL_ALIASES);
}
export function getChatChannelMeta(id) {
    return CHAT_CHANNEL_META[id];
}
export function normalizeChatChannelId(raw) {
    const normalized = normalizeChannelKey(raw);
    if (!normalized) {
        return null;
    }
    const resolved = CHAT_CHANNEL_ALIASES[normalized] ?? normalized;
    return CHAT_CHANNEL_ORDER.includes(resolved) ? resolved : null;
}
// Channel docking: prefer this helper in shared code. Importing from
// `src/channels/plugins/*` can eagerly load channel implementations.
export function normalizeChannelId(raw) {
    return normalizeChatChannelId(raw);
}
// Normalizes registered channel plugins (bundled or external).
//
// Keep this light: we do not import channel plugins here (those are "heavy" and can pull in
// monitors, web login, etc). The plugin registry must be initialized first.
export function normalizeAnyChannelId(raw) {
    const key = normalizeChannelKey(raw);
    if (!key) {
        return null;
    }
    const registry = requireActivePluginRegistry();
    const hit = registry.channels.find((entry) => {
        const id = String(entry.plugin.id ?? "")
            .trim()
            .toLowerCase();
        if (id && id === key) {
            return true;
        }
        return (entry.plugin.meta.aliases ?? []).some((alias) => alias.trim().toLowerCase() === key);
    });
    return hit?.plugin.id ?? null;
}
export function formatChannelPrimerLine(meta) {
    return `${meta.label}: ${meta.blurb}`;
}
export function formatChannelSelectionLine(meta, docsLink) {
    const docsPrefix = meta.selectionDocsPrefix ?? "Docs:";
    const docsLabel = meta.docsLabel ?? meta.id;
    const docs = meta.selectionDocsOmitLabel
        ? docsLink(meta.docsPath)
        : docsLink(meta.docsPath, docsLabel);
    const extras = (meta.selectionExtras ?? []).filter(Boolean).join(" ");
    return `${meta.label} — ${meta.blurb} ${docsPrefix ? `${docsPrefix} ` : ""}${docs}${extras ? ` ${extras}` : ""}`;
}
