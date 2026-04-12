import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentDir, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { createEmbeddingProvider, } from "./embeddings.js";
import { bm25RankToScore, buildFtsQuery, mergeHybridResults } from "./hybrid.js";
import { isMemoryPath, normalizeExtraMemoryPaths } from "./internal.js";
import { memoryManagerEmbeddingOps } from "./manager-embedding-ops.js";
import { searchKeyword, searchVector } from "./manager-search.js";
import { memoryManagerSyncOps } from "./manager-sync-ops.js";
const SNIPPET_MAX_CHARS = 700;
const VECTOR_TABLE = "chunks_vec";
const FTS_TABLE = "chunks_fts";
const EMBEDDING_CACHE_TABLE = "embedding_cache";
const BATCH_FAILURE_LIMIT = 2;
const log = createSubsystemLogger("memory");
const INDEX_CACHE = new Map();
export class MemoryIndexManager {
    cacheKey;
    cfg;
    agentId;
    workspaceDir;
    settings;
    provider;
    requestedProvider;
    fallbackFrom;
    fallbackReason;
    openAi;
    gemini;
    voyage;
    batch;
    batchFailureCount = 0;
    batchFailureLastError;
    batchFailureLastProvider;
    batchFailureLock = Promise.resolve();
    db;
    sources;
    providerKey;
    cache;
    vector;
    fts;
    vectorReady = null;
    watcher = null;
    watchTimer = null;
    sessionWatchTimer = null;
    sessionUnsubscribe = null;
    intervalTimer = null;
    closed = false;
    dirty = false;
    sessionsDirty = false;
    sessionsDirtyFiles = new Set();
    sessionPendingFiles = new Set();
    sessionDeltas = new Map();
    sessionWarm = new Set();
    syncing = null;
    static async get(params) {
        const { cfg, agentId } = params;
        const settings = resolveMemorySearchConfig(cfg, agentId);
        if (!settings) {
            return null;
        }
        const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
        const key = `${agentId}:${workspaceDir}:${JSON.stringify(settings)}`;
        const existing = INDEX_CACHE.get(key);
        if (existing) {
            return existing;
        }
        const providerResult = await createEmbeddingProvider({
            config: cfg,
            agentDir: resolveAgentDir(cfg, agentId),
            provider: settings.provider,
            remote: settings.remote,
            model: settings.model,
            fallback: settings.fallback,
            local: settings.local,
        });
        const manager = new MemoryIndexManager({
            cacheKey: key,
            cfg,
            agentId,
            workspaceDir,
            settings,
            providerResult,
            purpose: params.purpose,
        });
        INDEX_CACHE.set(key, manager);
        return manager;
    }
    constructor(params) {
        this.cacheKey = params.cacheKey;
        this.cfg = params.cfg;
        this.agentId = params.agentId;
        this.workspaceDir = params.workspaceDir;
        this.settings = params.settings;
        this.provider = params.providerResult.provider;
        this.requestedProvider = params.providerResult.requestedProvider;
        this.fallbackFrom = params.providerResult.fallbackFrom;
        this.fallbackReason = params.providerResult.fallbackReason;
        this.openAi = params.providerResult.openAi;
        this.gemini = params.providerResult.gemini;
        this.voyage = params.providerResult.voyage;
        this.sources = new Set(params.settings.sources);
        this.db = this.openDatabase();
        this.providerKey = this.computeProviderKey();
        this.cache = {
            enabled: params.settings.cache.enabled,
            maxEntries: params.settings.cache.maxEntries,
        };
        this.fts = { enabled: params.settings.query.hybrid.enabled, available: false };
        this.ensureSchema();
        this.vector = {
            enabled: params.settings.store.vector.enabled,
            available: null,
            extensionPath: params.settings.store.vector.extensionPath,
        };
        const meta = this.readMeta();
        if (meta?.vectorDims) {
            this.vector.dims = meta.vectorDims;
        }
        this.ensureWatcher();
        this.ensureSessionListener();
        this.ensureIntervalSync();
        const statusOnly = params.purpose === "status";
        this.dirty = this.sources.has("memory") && (statusOnly ? !meta : true);
        this.batch = this.resolveBatchConfig();
    }
    async warmSession(sessionKey) {
        if (!this.settings.sync.onSessionStart) {
            return;
        }
        const key = sessionKey?.trim() || "";
        if (key && this.sessionWarm.has(key)) {
            return;
        }
        void this.sync({ reason: "session-start" }).catch((err) => {
            log.warn(`memory sync failed (session-start): ${String(err)}`);
        });
        if (key) {
            this.sessionWarm.add(key);
        }
    }
    async search(query, opts) {
        void this.warmSession(opts?.sessionKey);
        if (this.settings.sync.onSearch && (this.dirty || this.sessionsDirty)) {
            void this.sync({ reason: "search" }).catch((err) => {
                log.warn(`memory sync failed (search): ${String(err)}`);
            });
        }
        const cleaned = query.trim();
        if (!cleaned) {
            return [];
        }
        const minScore = opts?.minScore ?? this.settings.query.minScore;
        const maxResults = opts?.maxResults ?? this.settings.query.maxResults;
        const hybrid = this.settings.query.hybrid;
        const candidates = Math.min(200, Math.max(1, Math.floor(maxResults * hybrid.candidateMultiplier)));
        const keywordResults = hybrid.enabled
            ? await this.searchKeyword(cleaned, candidates).catch(() => [])
            : [];
        const queryVec = (await this.embedQueryWithTimeout(cleaned));
        const hasVector = queryVec.some((v) => v !== 0);
        const vectorResults = hasVector
            ? await this.searchVector(queryVec, candidates).catch(() => [])
            : [];
        if (!hybrid.enabled) {
            return vectorResults.filter((entry) => entry.score >= minScore).slice(0, maxResults);
        }
        const merged = this.mergeHybridResults({
            vector: vectorResults,
            keyword: keywordResults,
            vectorWeight: hybrid.vectorWeight,
            textWeight: hybrid.textWeight,
        });
        return merged.filter((entry) => entry.score >= minScore).slice(0, maxResults);
    }
    async searchVector(queryVec, limit) {
        const results = await searchVector({
            db: this.db,
            vectorTable: VECTOR_TABLE,
            providerModel: this.provider.model,
            queryVec,
            limit,
            snippetMaxChars: SNIPPET_MAX_CHARS,
            ensureVectorReady: async (dimensions) => await this.ensureVectorReady(dimensions),
            sourceFilterVec: this.buildSourceFilter("c"),
            sourceFilterChunks: this.buildSourceFilter(),
        });
        return results.map((entry) => entry);
    }
    buildFtsQuery(raw) {
        return buildFtsQuery(raw);
    }
    async searchKeyword(query, limit) {
        if (!this.fts.enabled || !this.fts.available) {
            return [];
        }
        const sourceFilter = this.buildSourceFilter();
        const results = await searchKeyword({
            db: this.db,
            ftsTable: FTS_TABLE,
            providerModel: this.provider.model,
            query,
            limit,
            snippetMaxChars: SNIPPET_MAX_CHARS,
            sourceFilter,
            buildFtsQuery: (raw) => this.buildFtsQuery(raw),
            bm25RankToScore,
        });
        return results.map((entry) => entry);
    }
    mergeHybridResults(params) {
        const merged = mergeHybridResults({
            vector: params.vector.map((r) => ({
                id: r.id,
                path: r.path,
                startLine: r.startLine,
                endLine: r.endLine,
                source: r.source,
                snippet: r.snippet,
                vectorScore: r.score,
            })),
            keyword: params.keyword.map((r) => ({
                id: r.id,
                path: r.path,
                startLine: r.startLine,
                endLine: r.endLine,
                source: r.source,
                snippet: r.snippet,
                textScore: r.textScore,
            })),
            vectorWeight: params.vectorWeight,
            textWeight: params.textWeight,
        });
        return merged.map((entry) => entry);
    }
    async sync(params) {
        if (this.syncing) {
            return this.syncing;
        }
        this.syncing = this.runSync(params).finally(() => {
            this.syncing = null;
        });
        return this.syncing ?? Promise.resolve();
    }
    async readFile(params) {
        const rawPath = params.relPath.trim();
        if (!rawPath) {
            throw new Error("path required");
        }
        const absPath = path.isAbsolute(rawPath)
            ? path.resolve(rawPath)
            : path.resolve(this.workspaceDir, rawPath);
        const relPath = path.relative(this.workspaceDir, absPath).replace(/\\/g, "/");
        const inWorkspace = relPath.length > 0 && !relPath.startsWith("..") && !path.isAbsolute(relPath);
        const allowedWorkspace = inWorkspace && isMemoryPath(relPath);
        let allowedAdditional = false;
        if (!allowedWorkspace && this.settings.extraPaths.length > 0) {
            const additionalPaths = normalizeExtraMemoryPaths(this.workspaceDir, this.settings.extraPaths);
            for (const additionalPath of additionalPaths) {
                try {
                    const stat = await fs.lstat(additionalPath);
                    if (stat.isSymbolicLink()) {
                        continue;
                    }
                    if (stat.isDirectory()) {
                        if (absPath === additionalPath || absPath.startsWith(`${additionalPath}${path.sep}`)) {
                            allowedAdditional = true;
                            break;
                        }
                        continue;
                    }
                    if (stat.isFile()) {
                        if (absPath === additionalPath && absPath.endsWith(".md")) {
                            allowedAdditional = true;
                            break;
                        }
                    }
                }
                catch { }
            }
        }
        if (!allowedWorkspace && !allowedAdditional) {
            throw new Error("path required");
        }
        if (!absPath.endsWith(".md")) {
            throw new Error("path required");
        }
        const stat = await fs.lstat(absPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error("path required");
        }
        const content = await fs.readFile(absPath, "utf-8");
        if (!params.from && !params.lines) {
            return { text: content, path: relPath };
        }
        const lines = content.split("\n");
        const start = Math.max(1, params.from ?? 1);
        const count = Math.max(1, params.lines ?? lines.length);
        const slice = lines.slice(start - 1, start - 1 + count);
        return { text: slice.join("\n"), path: relPath };
    }
    status() {
        const sourceFilter = this.buildSourceFilter();
        const files = this.db
            .prepare(`SELECT COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql}`)
            .get(...sourceFilter.params);
        const chunks = this.db
            .prepare(`SELECT COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql}`)
            .get(...sourceFilter.params);
        const sourceCounts = (() => {
            const sources = Array.from(this.sources);
            if (sources.length === 0) {
                return [];
            }
            const bySource = new Map();
            for (const source of sources) {
                bySource.set(source, { files: 0, chunks: 0 });
            }
            const fileRows = this.db
                .prepare(`SELECT source, COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql} GROUP BY source`)
                .all(...sourceFilter.params);
            for (const row of fileRows) {
                const entry = bySource.get(row.source) ?? { files: 0, chunks: 0 };
                entry.files = row.c ?? 0;
                bySource.set(row.source, entry);
            }
            const chunkRows = this.db
                .prepare(`SELECT source, COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql} GROUP BY source`)
                .all(...sourceFilter.params);
            for (const row of chunkRows) {
                const entry = bySource.get(row.source) ?? { files: 0, chunks: 0 };
                entry.chunks = row.c ?? 0;
                bySource.set(row.source, entry);
            }
            return sources.map((source) => Object.assign({ source }, bySource.get(source)));
        })();
        return {
            backend: "builtin",
            files: files?.c ?? 0,
            chunks: chunks?.c ?? 0,
            dirty: this.dirty || this.sessionsDirty,
            workspaceDir: this.workspaceDir,
            dbPath: this.settings.store.path,
            provider: this.provider.id,
            model: this.provider.model,
            requestedProvider: this.requestedProvider,
            sources: Array.from(this.sources),
            extraPaths: this.settings.extraPaths,
            sourceCounts,
            cache: this.cache.enabled
                ? {
                    enabled: true,
                    entries: this.db.prepare(`SELECT COUNT(*) as c FROM ${EMBEDDING_CACHE_TABLE}`).get()?.c ?? 0,
                    maxEntries: this.cache.maxEntries,
                }
                : { enabled: false, maxEntries: this.cache.maxEntries },
            fts: {
                enabled: this.fts.enabled,
                available: this.fts.available,
                error: this.fts.loadError,
            },
            fallback: this.fallbackReason
                ? { from: this.fallbackFrom ?? "local", reason: this.fallbackReason }
                : undefined,
            vector: {
                enabled: this.vector.enabled,
                available: this.vector.available ?? undefined,
                extensionPath: this.vector.extensionPath,
                loadError: this.vector.loadError,
                dims: this.vector.dims,
            },
            batch: {
                enabled: this.batch.enabled,
                failures: this.batchFailureCount,
                limit: BATCH_FAILURE_LIMIT,
                wait: this.batch.wait,
                concurrency: this.batch.concurrency,
                pollIntervalMs: this.batch.pollIntervalMs,
                timeoutMs: this.batch.timeoutMs,
                lastError: this.batchFailureLastError,
                lastProvider: this.batchFailureLastProvider,
            },
        };
    }
    async probeVectorAvailability() {
        if (!this.vector.enabled) {
            return false;
        }
        return this.ensureVectorReady();
    }
    async probeEmbeddingAvailability() {
        try {
            await this.embedBatchWithRetry(["ping"]);
            return { ok: true };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
        }
    }
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.watchTimer) {
            clearTimeout(this.watchTimer);
            this.watchTimer = null;
        }
        if (this.sessionWatchTimer) {
            clearTimeout(this.sessionWatchTimer);
            this.sessionWatchTimer = null;
        }
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        if (this.sessionUnsubscribe) {
            this.sessionUnsubscribe();
            this.sessionUnsubscribe = null;
        }
        this.db.close();
        INDEX_CACHE.delete(this.cacheKey);
    }
}
function applyPrototypeMixins(target, ...sources) {
    for (const source of sources) {
        for (const name of Object.getOwnPropertyNames(source)) {
            if (name === "constructor") {
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(source, name);
            if (!descriptor) {
                continue;
            }
            Object.defineProperty(target, name, descriptor);
        }
    }
}
applyPrototypeMixins(MemoryIndexManager.prototype, memoryManagerSyncOps, memoryManagerEmbeddingOps);
