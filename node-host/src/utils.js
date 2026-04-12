import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandHomePrefix, resolveEffectiveHomeDir, resolveRequiredHomeDir, } from "./infra/home-dir.js";
export async function ensureDir(dir) {
    await fs.promises.mkdir(dir, { recursive: true });
}
/**
 * Check if a file or directory exists at the given path.
 */
export async function pathExists(targetPath) {
    try {
        await fs.promises.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
export function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function clampInt(value, min, max) {
    return clampNumber(Math.floor(value), min, max);
}
/** Alias for clampNumber (shorter, more common name) */
export const clamp = clampNumber;
/**
 * Escapes special regex characters in a string so it can be used in a RegExp constructor.
 */
export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Safely parse JSON, returning null on error instead of throwing.
 */
export function safeParseJson(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Type guard for plain objects (not arrays, null, Date, RegExp, etc.).
 * Uses Object.prototype.toString for maximum safety.
 */
export function isPlainObject(value) {
    return (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.prototype.toString.call(value) === "[object Object]");
}
/**
 * Type guard for Record<string, unknown> (less strict than isPlainObject).
 * Accepts any non-null object that isn't an array.
 */
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function assertWebChannel(input) {
    if (input !== "web") {
        throw new Error("Web channel must be 'web'");
    }
}
export function normalizePath(p) {
    if (!p.startsWith("/")) {
        return `/${p}`;
    }
    return p;
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isHighSurrogate(codeUnit) {
    return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}
function isLowSurrogate(codeUnit) {
    return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
export function sliceUtf16Safe(input, start, end) {
    const len = input.length;
    let from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    let to = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
    if (to < from) {
        const tmp = from;
        from = to;
        to = tmp;
    }
    if (from > 0 && from < len) {
        const codeUnit = input.charCodeAt(from);
        if (isLowSurrogate(codeUnit) && isHighSurrogate(input.charCodeAt(from - 1))) {
            from += 1;
        }
    }
    if (to > 0 && to < len) {
        const codeUnit = input.charCodeAt(to - 1);
        if (isHighSurrogate(codeUnit) && isLowSurrogate(input.charCodeAt(to))) {
            to -= 1;
        }
    }
    return input.slice(from, to);
}
export function truncateUtf16Safe(input, maxLen) {
    const limit = Math.max(0, Math.floor(maxLen));
    if (input.length <= limit) {
        return input;
    }
    return sliceUtf16Safe(input, 0, limit);
}
export function resolveUserPath(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        return trimmed;
    }
    if (trimmed.startsWith("~")) {
        const expanded = expandHomePrefix(trimmed, {
            home: resolveRequiredHomeDir(process.env, os.homedir),
            env: process.env,
            homedir: os.homedir,
        });
        return path.resolve(expanded);
    }
    return path.resolve(trimmed);
}
export function resolveConfigDir(env = process.env, homedir = os.homedir) {
    const override = env.AGENT_SHIELD_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
    if (override) {
        return resolveUserPath(override);
    }
    const newDir = path.join(resolveRequiredHomeDir(env, homedir), ".agent-shield");
    try {
        const hasNew = fs.existsSync(newDir);
        if (hasNew) {
            return newDir;
        }
    }
    catch {
        // best-effort
    }
    return newDir;
}
export function resolveHomeDir() {
    return resolveEffectiveHomeDir(process.env, os.homedir);
}
function resolveHomeDisplayPrefix() {
    const home = resolveHomeDir();
    if (!home) {
        return undefined;
    }
    const explicitHome = process.env.AGENT_SHIELD_HOME?.trim();
    if (explicitHome) {
        return { home, prefix: "$AGENT_SHIELD_HOME" };
    }
    return { home, prefix: "~" };
}
export function shortenHomePath(input) {
    if (!input) {
        return input;
    }
    const display = resolveHomeDisplayPrefix();
    if (!display) {
        return input;
    }
    const { home, prefix } = display;
    if (input === home) {
        return prefix;
    }
    if (input.startsWith(`${home}/`) || input.startsWith(`${home}\\`)) {
        return `${prefix}${input.slice(home.length)}`;
    }
    return input;
}
export function shortenHomeInString(input) {
    if (!input) {
        return input;
    }
    const display = resolveHomeDisplayPrefix();
    if (!display) {
        return input;
    }
    return input.split(display.home).join(display.prefix);
}
export function displayPath(input) {
    return shortenHomePath(input);
}
export function displayString(input) {
    return shortenHomeInString(input);
}
export function formatTerminalLink(label, url, opts) {
    const esc = "\u001b";
    const safeLabel = label.replaceAll(esc, "");
    const safeUrl = url.replaceAll(esc, "");
    const allow = opts?.force === true ? true : opts?.force === false ? false : Boolean(process.stdout.isTTY);
    if (!allow) {
        return opts?.fallback ?? `${safeLabel} (${safeUrl})`;
    }
    return `\u001b]8;;${safeUrl}\u0007${safeLabel}\u001b]8;;\u0007`;
}
export function normalizeE164(input) {
    // Strip everything except digits
    const digits = input.replace(/\D/g, "");
    if (!digits) {
        return "";
    }
    return `+${digits}`;
}
export function withWhatsAppPrefix(input) {
    if (input.startsWith("whatsapp:")) {
        return input;
    }
    return `whatsapp:${input}`;
}
export function toWhatsappJid(input) {
    if (input.includes("@")) {
        return input;
    }
    const normalized = normalizeE164(input).replace("+", "");
    return `${normalized}@s.whatsapp.net`;
}
// Configuration root; can be overridden via AGENT_SHIELD_STATE_DIR.
export const CONFIG_DIR = resolveConfigDir();
