import { parseSetUnsetCommand } from "./commands-setunset.js";
import { parseSlashCommandOrNull } from "./commands-slash-parse.js";
export function parseConfigCommand(raw) {
    const parsed = parseSlashCommandOrNull(raw, "/config", {
        invalidMessage: "Invalid /config syntax.",
    });
    if (!parsed) {
        return null;
    }
    if (!parsed.ok) {
        return { action: "error", message: parsed.message };
    }
    const { action, args } = parsed;
    switch (action) {
        case "show":
            return { action: "show", path: args || undefined };
        case "get":
            return { action: "show", path: args || undefined };
        case "unset":
        case "set": {
            const parsed = parseSetUnsetCommand({ slash: "/config", action, args });
            if (parsed.kind === "error") {
                return { action: "error", message: parsed.message };
            }
            return parsed.kind === "set"
                ? { action: "set", path: parsed.path, value: parsed.value }
                : { action: "unset", path: parsed.path };
        }
        default:
            return {
                action: "error",
                message: "Usage: /config show|set|unset",
            };
    }
}
