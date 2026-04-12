import { isPlainObject } from "../utils.js";
function isObjectWithStringId(value) {
    if (!isPlainObject(value)) {
        return false;
    }
    return typeof value.id === "string" && value.id.length > 0;
}
function mergeObjectArraysById(base, patch, options) {
    if (!base.every(isObjectWithStringId) || !patch.every(isObjectWithStringId)) {
        return undefined;
    }
    const merged = [...base];
    const indexById = new Map();
    for (const [index, entry] of merged.entries()) {
        indexById.set(entry.id, index);
    }
    for (const entry of patch) {
        const existingIndex = indexById.get(entry.id);
        if (existingIndex === undefined) {
            merged.push(structuredClone(entry));
            indexById.set(entry.id, merged.length - 1);
            continue;
        }
        merged[existingIndex] = applyMergePatch(merged[existingIndex], entry, options);
    }
    return merged;
}
export function applyMergePatch(base, patch, options = {}) {
    if (!isPlainObject(patch)) {
        return patch;
    }
    const result = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
            delete result[key];
            continue;
        }
        if (options.mergeObjectArraysById && Array.isArray(result[key]) && Array.isArray(value)) {
            const mergedArray = mergeObjectArraysById(result[key], value, options);
            if (mergedArray) {
                result[key] = mergedArray;
                continue;
            }
        }
        if (isPlainObject(value)) {
            const baseValue = result[key];
            result[key] = applyMergePatch(isPlainObject(baseValue) ? baseValue : {}, value, options);
            continue;
        }
        result[key] = value;
    }
    return result;
}
