import { requireActivePluginRegistry } from "../plugins/runtime.js";
import { CHAT_CHANNEL_ORDER, getChatChannelMeta } from "./registry.js";
// Channel docks: lightweight channel metadata/behavior for shared code paths.
const DOCKS = {};
function buildDockFromPlugin(plugin) {
    return {
        id: plugin.id,
        capabilities: plugin.capabilities,
        commands: plugin.commands,
        outbound: plugin.outbound?.textChunkLimit
            ? { textChunkLimit: plugin.outbound.textChunkLimit }
            : undefined,
        streaming: plugin.streaming
            ? { blockStreamingCoalesceDefaults: plugin.streaming.blockStreamingCoalesceDefaults }
            : undefined,
        elevated: plugin.elevated,
        config: plugin.config
            ? {
                resolveAllowFrom: plugin.config.resolveAllowFrom,
                formatAllowFrom: plugin.config.formatAllowFrom,
            }
            : undefined,
        groups: plugin.groups,
        mentions: plugin.mentions,
        threading: plugin.threading,
        agentPrompt: plugin.agentPrompt,
    };
}
function listPluginDockEntries() {
    const registry = requireActivePluginRegistry();
    const entries = [];
    const seen = new Set();
    for (const entry of registry.channels) {
        const plugin = entry.plugin;
        const id = String(plugin.id).trim();
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        if (CHAT_CHANNEL_ORDER.includes(plugin.id)) {
            continue;
        }
        const dock = entry.dock ?? buildDockFromPlugin(plugin);
        entries.push({ id: plugin.id, dock, order: plugin.meta.order });
    }
    return entries;
}
export function listChannelDocks() {
    const baseEntries = CHAT_CHANNEL_ORDER.map((id) => ({
        id,
        dock: DOCKS[id],
        order: getChatChannelMeta(id).order,
    }));
    const pluginEntries = listPluginDockEntries();
    const combined = [...baseEntries, ...pluginEntries];
    combined.sort((a, b) => {
        const indexA = CHAT_CHANNEL_ORDER.indexOf(a.id);
        const indexB = CHAT_CHANNEL_ORDER.indexOf(b.id);
        const orderA = a.order ?? (indexA === -1 ? 999 : indexA);
        const orderB = b.order ?? (indexB === -1 ? 999 : indexB);
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        return String(a.id).localeCompare(String(b.id));
    });
    return combined.map((entry) => entry.dock);
}
export function getChannelDock(id) {
    const core = DOCKS[id];
    if (core) {
        return core;
    }
    const registry = requireActivePluginRegistry();
    const pluginEntry = registry.channels.find((entry) => entry.plugin.id === id);
    if (!pluginEntry) {
        return undefined;
    }
    return pluginEntry.dock ?? buildDockFromPlugin(pluginEntry.plugin);
}
