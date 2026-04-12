import { randomUUID } from "node:crypto";
// Grace period to keep resolved entries for late awaitDecision calls
const RESOLVED_ENTRY_GRACE_MS = 15_000;
export class ExecApprovalManager {
    pending = new Map();
    create(request, timeoutMs, id) {
        const now = Date.now();
        const resolvedId = id && id.trim().length > 0 ? id.trim() : randomUUID();
        const record = {
            id: resolvedId,
            request,
            createdAtMs: now,
            expiresAtMs: now + timeoutMs,
        };
        return record;
    }
    /**
     * Register an approval record and return a promise that resolves when the decision is made.
     * This separates registration (synchronous) from waiting (async), allowing callers to
     * confirm registration before the decision is made.
     */
    register(record, timeoutMs) {
        const existing = this.pending.get(record.id);
        if (existing) {
            // Idempotent: return existing promise if still pending
            if (existing.record.resolvedAtMs === undefined) {
                return existing.promise;
            }
            // Already resolved - don't allow re-registration
            throw new Error(`approval id '${record.id}' already resolved`);
        }
        let resolvePromise;
        let rejectPromise;
        const promise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        // Create entry first so we can capture it in the closure (not re-fetch from map)
        const entry = {
            record,
            resolve: resolvePromise,
            reject: rejectPromise,
            timer: null,
            promise,
        };
        entry.timer = setTimeout(() => {
            // Update snapshot fields before resolving (mirror resolve()'s bookkeeping)
            record.resolvedAtMs = Date.now();
            record.decision = undefined;
            record.resolvedBy = null;
            resolvePromise(null);
            // Keep entry briefly for in-flight awaitDecision calls
            setTimeout(() => {
                // Compare against captured entry instance, not re-fetched from map
                if (this.pending.get(record.id) === entry) {
                    this.pending.delete(record.id);
                }
            }, RESOLVED_ENTRY_GRACE_MS);
        }, timeoutMs);
        this.pending.set(record.id, entry);
        return promise;
    }
    /**
     * @deprecated Use register() instead for explicit separation of registration and waiting.
     */
    async waitForDecision(record, timeoutMs) {
        return this.register(record, timeoutMs);
    }
    resolve(recordId, decision, resolvedBy) {
        const pending = this.pending.get(recordId);
        if (!pending) {
            return false;
        }
        // Prevent double-resolve (e.g., if called after timeout already resolved)
        if (pending.record.resolvedAtMs !== undefined) {
            return false;
        }
        clearTimeout(pending.timer);
        pending.record.resolvedAtMs = Date.now();
        pending.record.decision = decision;
        pending.record.resolvedBy = resolvedBy ?? null;
        // Resolve the promise first, then delete after a grace period.
        // This allows in-flight awaitDecision calls to find the resolved entry.
        pending.resolve(decision);
        setTimeout(() => {
            // Only delete if the entry hasn't been replaced
            if (this.pending.get(recordId) === pending) {
                this.pending.delete(recordId);
            }
        }, RESOLVED_ENTRY_GRACE_MS);
        return true;
    }
    getSnapshot(recordId) {
        const entry = this.pending.get(recordId);
        return entry?.record ?? null;
    }
    /**
     * Wait for decision on an already-registered approval.
     * Returns the decision promise if the ID is pending, null otherwise.
     */
    awaitDecision(recordId) {
        const entry = this.pending.get(recordId);
        return entry?.promise ?? null;
    }
}
