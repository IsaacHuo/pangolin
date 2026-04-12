// Default service labels (canonical + legacy compatibility)
export const GATEWAY_LAUNCH_AGENT_LABEL = "ai.agent-shield.gateway";
export const GATEWAY_SYSTEMD_SERVICE_NAME = "pangolin-gateway";
export const GATEWAY_WINDOWS_TASK_NAME = "Pangolin Gateway";
export const GATEWAY_SERVICE_MARKER = "agent-shield";
export const GATEWAY_SERVICE_KIND = "gateway";
export const NODE_LAUNCH_AGENT_LABEL = "ai.agent-shield.node";
export const NODE_SYSTEMD_SERVICE_NAME = "agent-shield-node";
export const NODE_WINDOWS_TASK_NAME = "AgentShield Node";
export const NODE_SERVICE_MARKER = "agent-shield";
export const NODE_SERVICE_KIND = "node";
export const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";
export const LEGACY_GATEWAY_LAUNCH_AGENT_LABELS = [];
export const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES = [
    "agent-shield-gateway",
    "openclaw-gateway",
];
export const LEGACY_GATEWAY_WINDOWS_TASK_NAMES = [
    "AgentShield Gateway",
    "OpenClaw Gateway",
];
export function normalizeGatewayProfile(profile) {
    const trimmed = profile?.trim();
    if (!trimmed || trimmed.toLowerCase() === "default") {
        return null;
    }
    return trimmed;
}
export function resolveGatewayProfileSuffix(profile) {
    const normalized = normalizeGatewayProfile(profile);
    return normalized ? `-${normalized}` : "";
}
export function resolveGatewayLaunchAgentLabel(profile) {
    const normalized = normalizeGatewayProfile(profile);
    if (!normalized) {
        return GATEWAY_LAUNCH_AGENT_LABEL;
    }
    return `ai.agent-shield.${normalized}`;
}
export function resolveLegacyGatewayLaunchAgentLabels(profile) {
    void profile;
    return [];
}
export function resolveGatewaySystemdServiceName(profile) {
    const suffix = resolveGatewayProfileSuffix(profile);
    if (!suffix) {
        return GATEWAY_SYSTEMD_SERVICE_NAME;
    }
    return `pangolin-gateway${suffix}`;
}
export function resolveGatewayWindowsTaskName(profile) {
    const normalized = normalizeGatewayProfile(profile);
    if (!normalized) {
        return GATEWAY_WINDOWS_TASK_NAME;
    }
    return `Pangolin Gateway (${normalized})`;
}
export function formatGatewayServiceDescription(params) {
    const profile = normalizeGatewayProfile(params?.profile);
    const version = params?.version?.trim();
    const parts = [];
    if (profile) {
        parts.push(`profile: ${profile}`);
    }
    if (version) {
        parts.push(`v${version}`);
    }
    if (parts.length === 0) {
        return "Pangolin Gateway";
    }
    return `Pangolin Gateway (${parts.join(", ")})`;
}
export function resolveGatewayServiceDescription(params) {
    return (params.description ??
        formatGatewayServiceDescription({
            profile: params.env.AGENT_SHIELD_PROFILE,
            version: params.environment?.AGENT_SHIELD_SERVICE_VERSION ?? params.env.AGENT_SHIELD_SERVICE_VERSION,
        }));
}
export function resolveNodeLaunchAgentLabel() {
    return NODE_LAUNCH_AGENT_LABEL;
}
export function resolveNodeSystemdServiceName() {
    return NODE_SYSTEMD_SERVICE_NAME;
}
export function resolveNodeWindowsTaskName() {
    return NODE_WINDOWS_TASK_NAME;
}
export function formatNodeServiceDescription(params) {
    const version = params?.version?.trim();
    if (!version) {
        return "AgentShield Node Host";
    }
    return `AgentShield Node Host (v${version})`;
}
