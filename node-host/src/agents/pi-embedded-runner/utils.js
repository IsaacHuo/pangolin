export function mapThinkingLevel(level) {
    // pi-agent-core supports "xhigh"; AgentShield enables it for specific models.
    if (!level) {
        return "off";
    }
    return level;
}
export function describeUnknownError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        const serialized = JSON.stringify(error);
        return serialized ?? "Unknown error";
    }
    catch {
        return "Unknown error";
    }
}
