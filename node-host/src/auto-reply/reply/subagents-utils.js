import { truncateUtf16Safe } from "../../utils.js";
export function resolveSubagentLabel(entry, fallback = "subagent") {
    const raw = entry.label?.trim() || entry.task?.trim() || "";
    return raw || fallback;
}
export function formatRunLabel(entry, options) {
    const raw = resolveSubagentLabel(entry);
    const maxLength = options?.maxLength ?? 72;
    if (!Number.isFinite(maxLength) || maxLength <= 0) {
        return raw;
    }
    return raw.length > maxLength ? `${truncateUtf16Safe(raw, maxLength).trimEnd()}…` : raw;
}
export function formatRunStatus(entry) {
    if (!entry.endedAt) {
        return "running";
    }
    const status = entry.outcome?.status ?? "done";
    return status === "ok" ? "done" : status;
}
export function sortSubagentRuns(runs) {
    return [...runs].toSorted((a, b) => {
        const aTime = a.startedAt ?? a.createdAt ?? 0;
        const bTime = b.startedAt ?? b.createdAt ?? 0;
        return bTime - aTime;
    });
}
