export function normalizeToolName(name) {
    return (name ?? "tool").trim();
}
export function defaultTitle(name) {
    const cleaned = name.replace(/_/g, " ").trim();
    if (!cleaned) {
        return "Tool";
    }
    return cleaned
        .split(/\s+/)
        .map((part) => part.length <= 2 && part.toUpperCase() === part
        ? part
        : `${part.at(0)?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" ");
}
export function normalizeVerb(value) {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.replace(/_/g, " ");
}
export function coerceDisplayValue(value, opts = {}) {
    const maxStringChars = opts.maxStringChars ?? 160;
    const maxArrayEntries = opts.maxArrayEntries ?? 3;
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? "";
        if (!firstLine) {
            return undefined;
        }
        if (firstLine.length > maxStringChars) {
            return `${firstLine.slice(0, Math.max(0, maxStringChars - 3))}…`;
        }
        return firstLine;
    }
    if (typeof value === "boolean") {
        if (!value && !opts.includeFalse) {
            return undefined;
        }
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            return opts.includeNonFinite ? String(value) : undefined;
        }
        if (value === 0 && !opts.includeZero) {
            return undefined;
        }
        return String(value);
    }
    if (Array.isArray(value)) {
        const values = value
            .map((item) => coerceDisplayValue(item, opts))
            .filter((item) => Boolean(item));
        if (values.length === 0) {
            return undefined;
        }
        const preview = values.slice(0, maxArrayEntries).join(", ");
        return values.length > maxArrayEntries ? `${preview}…` : preview;
    }
    return undefined;
}
export function lookupValueByPath(args, path) {
    if (!args || typeof args !== "object") {
        return undefined;
    }
    let current = args;
    for (const segment of path.split(".")) {
        if (!segment) {
            return undefined;
        }
        if (!current || typeof current !== "object") {
            return undefined;
        }
        const record = current;
        current = record[segment];
    }
    return current;
}
export function formatDetailKey(raw, overrides = {}) {
    const segments = raw.split(".").filter(Boolean);
    const last = segments.at(-1) ?? raw;
    const override = overrides[last];
    if (override) {
        return override;
    }
    const cleaned = last.replace(/_/g, " ").replace(/-/g, " ");
    const spaced = cleaned.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return spaced.trim().toLowerCase() || last.toLowerCase();
}
export function resolveReadDetail(args) {
    if (!args || typeof args !== "object") {
        return undefined;
    }
    const record = args;
    const path = typeof record.path === "string" ? record.path : undefined;
    if (!path) {
        return undefined;
    }
    const offset = typeof record.offset === "number" ? record.offset : undefined;
    const limit = typeof record.limit === "number" ? record.limit : undefined;
    if (offset !== undefined && limit !== undefined) {
        return `${path}:${offset}-${offset + limit}`;
    }
    return path;
}
export function resolveWriteDetail(args) {
    if (!args || typeof args !== "object") {
        return undefined;
    }
    const record = args;
    const path = typeof record.path === "string" ? record.path : undefined;
    return path;
}
export function resolveActionSpec(spec, action) {
    if (!spec || !action) {
        return undefined;
    }
    return spec.actions?.[action] ?? undefined;
}
export function resolveDetailFromKeys(args, keys, opts) {
    if (opts.mode === "first") {
        for (const key of keys) {
            const value = lookupValueByPath(args, key);
            const display = coerceDisplayValue(value, opts.coerce);
            if (display) {
                return display;
            }
        }
        return undefined;
    }
    const entries = [];
    for (const key of keys) {
        const value = lookupValueByPath(args, key);
        const display = coerceDisplayValue(value, opts.coerce);
        if (!display) {
            continue;
        }
        entries.push({ label: opts.formatKey ? opts.formatKey(key) : key, value: display });
    }
    if (entries.length === 0) {
        return undefined;
    }
    if (entries.length === 1) {
        return entries[0].value;
    }
    const seen = new Set();
    const unique = [];
    for (const entry of entries) {
        const token = `${entry.label}:${entry.value}`;
        if (seen.has(token)) {
            continue;
        }
        seen.add(token);
        unique.push(entry);
    }
    if (unique.length === 0) {
        return undefined;
    }
    return unique
        .slice(0, opts.maxEntries ?? 8)
        .map((entry) => `${entry.label} ${entry.value}`)
        .join(" · ");
}
