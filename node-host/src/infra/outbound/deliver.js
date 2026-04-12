import { chunkByParagraph, chunkMarkdownTextWithMode, resolveChunkMode, resolveTextChunkLimit, } from "../../auto-reply/chunk.js";
import { loadChannelOutboundAdapter } from "../../channels/plugins/outbound/load.js";
import { appendAssistantMessageToSessionTranscript, resolveMirroredTranscriptText, } from "../../config/sessions.js";
import { getAgentScopedMediaLocalRoots } from "../../media/local-roots.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
// Signal imports removed
import { throwIfAborted } from "./abort.js";
import { ackDelivery, enqueueDelivery, failDelivery } from "./delivery-queue.js";
import { normalizeReplyPayloadsForDelivery } from "./payloads.js";
export { normalizeOutboundPayloads } from "./payloads.js";
// Channel docking: outbound delivery delegates to plugin.outbound adapters.
async function createChannelHandler(params) {
    const outbound = await loadChannelOutboundAdapter(params.channel);
    const handler = createPluginHandler({ ...params, outbound });
    if (!handler) {
        throw new Error(`Outbound not configured for channel: ${params.channel}`);
    }
    return handler;
}
function createPluginHandler(params) {
    const outbound = params.outbound;
    if (!outbound?.sendText || !outbound?.sendMedia) {
        return null;
    }
    const baseCtx = createChannelOutboundContextBase(params);
    const sendText = outbound.sendText;
    const sendMedia = outbound.sendMedia;
    const chunker = outbound.chunker ?? null;
    const chunkerMode = outbound.chunkerMode;
    return {
        chunker,
        chunkerMode,
        textChunkLimit: outbound.textChunkLimit,
        sendPayload: outbound.sendPayload
            ? async (payload) => outbound.sendPayload({
                ...baseCtx,
                text: payload.text ?? "",
                mediaUrl: payload.mediaUrl,
                payload,
            })
            : undefined,
        sendText: async (text) => sendText({
            ...baseCtx,
            text,
        }),
        sendMedia: async (caption, mediaUrl) => sendMedia({
            ...baseCtx,
            text: caption,
            mediaUrl,
        }),
    };
}
function createChannelOutboundContextBase(params) {
    return {
        cfg: params.cfg,
        to: params.to,
        accountId: params.accountId,
        replyToId: params.replyToId,
        threadId: params.threadId,
        identity: params.identity,
        gifPlayback: params.gifPlayback,
        deps: params.deps,
        silent: params.silent,
        mediaLocalRoots: params.mediaLocalRoots,
    };
}
const isAbortError = (err) => err instanceof Error && err.name === "AbortError";
export async function deliverOutboundPayloads(params) {
    const { channel, to, payloads } = params;
    // Write-ahead delivery queue: persist before sending, remove after success.
    const queueId = params.skipQueue
        ? null
        : await enqueueDelivery({
            channel,
            to,
            accountId: params.accountId,
            payloads,
            threadId: params.threadId,
            replyToId: params.replyToId,
            bestEffort: params.bestEffort,
            gifPlayback: params.gifPlayback,
            silent: params.silent,
            mirror: params.mirror,
        }).catch(() => null); // Best-effort — don't block delivery if queue write fails.
    // Wrap onError to detect partial failures under bestEffort mode.
    // When bestEffort is true, per-payload errors are caught and passed to onError
    // without throwing — so the outer try/catch never fires. We track whether any
    // payload failed so we can call failDelivery instead of ackDelivery.
    let hadPartialFailure = false;
    const wrappedParams = params.onError
        ? {
            ...params,
            onError: (err, payload) => {
                hadPartialFailure = true;
                params.onError(err, payload);
            },
        }
        : params;
    try {
        const results = await deliverOutboundPayloadsCore(wrappedParams);
        if (queueId) {
            if (hadPartialFailure) {
                await failDelivery(queueId, "partial delivery failure (bestEffort)").catch(() => { });
            }
            else {
                await ackDelivery(queueId).catch(() => { }); // Best-effort cleanup.
            }
        }
        return results;
    }
    catch (err) {
        if (queueId) {
            if (isAbortError(err)) {
                await ackDelivery(queueId).catch(() => { });
            }
            else {
                await failDelivery(queueId, err instanceof Error ? err.message : String(err)).catch(() => { });
            }
        }
        throw err;
    }
}
async function deliverOutboundPayloadsCore(params) {
    const { cfg, channel, to, payloads } = params;
    const accountId = params.accountId;
    const deps = params.deps;
    const abortSignal = params.abortSignal;
    const mediaLocalRoots = getAgentScopedMediaLocalRoots(cfg, params.agentId ?? params.mirror?.agentId);
    const results = [];
    const handler = await createChannelHandler({
        cfg,
        channel,
        to,
        deps,
        accountId,
        replyToId: params.replyToId,
        threadId: params.threadId,
        identity: params.identity,
        gifPlayback: params.gifPlayback,
        silent: params.silent,
        mediaLocalRoots,
    });
    const textLimit = handler.chunker
        ? resolveTextChunkLimit(cfg, channel, accountId, {
            fallbackLimit: handler.textChunkLimit,
        })
        : undefined;
    const chunkMode = handler.chunker ? resolveChunkMode(cfg, channel, accountId) : "length";
    const sendTextChunks = async (text) => {
        throwIfAborted(abortSignal);
        if (!handler.chunker || textLimit === undefined) {
            results.push(await handler.sendText(text));
            return;
        }
        if (chunkMode === "newline") {
            const mode = handler.chunkerMode ?? "text";
            const blockChunks = mode === "markdown"
                ? chunkMarkdownTextWithMode(text, textLimit, "newline")
                : chunkByParagraph(text, textLimit);
            if (!blockChunks.length && text) {
                blockChunks.push(text);
            }
            for (const blockChunk of blockChunks) {
                const chunks = handler.chunker(blockChunk, textLimit);
                if (!chunks.length && blockChunk) {
                    chunks.push(blockChunk);
                }
                for (const chunk of chunks) {
                    throwIfAborted(abortSignal);
                    results.push(await handler.sendText(chunk));
                }
            }
            return;
        }
        const chunks = handler.chunker(text, textLimit);
        for (const chunk of chunks) {
            throwIfAborted(abortSignal);
            results.push(await handler.sendText(chunk));
        }
    };
    const normalizedPayloads = normalizeReplyPayloadsForDelivery(payloads);
    const hookRunner = getGlobalHookRunner();
    for (const payload of normalizedPayloads) {
        const payloadSummary = {
            text: payload.text ?? "",
            mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []),
            channelData: payload.channelData,
        };
        const emitMessageSent = (success, error) => {
            if (!hookRunner?.hasHooks("message_sent")) {
                return;
            }
            void hookRunner
                .runMessageSent({
                to,
                content: payloadSummary.text,
                success,
                ...(error ? { error } : {}),
            }, {
                channelId: channel,
                accountId: accountId ?? undefined,
            })
                .catch(() => { });
        };
        try {
            throwIfAborted(abortSignal);
            // Run message_sending plugin hook (may modify content or cancel)
            let effectivePayload = payload;
            if (hookRunner?.hasHooks("message_sending")) {
                try {
                    const sendingResult = await hookRunner.runMessageSending({
                        to,
                        content: payloadSummary.text,
                        metadata: { channel, accountId, mediaUrls: payloadSummary.mediaUrls },
                    }, {
                        channelId: channel,
                        accountId: accountId ?? undefined,
                    });
                    if (sendingResult?.cancel) {
                        continue;
                    }
                    if (sendingResult?.content != null) {
                        effectivePayload = { ...payload, text: sendingResult.content };
                        payloadSummary.text = sendingResult.content;
                    }
                }
                catch {
                    // Don't block delivery on hook failure
                }
            }
            params.onPayload?.(payloadSummary);
            if (handler.sendPayload && effectivePayload.channelData) {
                results.push(await handler.sendPayload(effectivePayload));
                emitMessageSent(true);
                continue;
            }
            if (payloadSummary.mediaUrls.length === 0) {
                await sendTextChunks(payloadSummary.text);
                emitMessageSent(true);
                continue;
            }
            let first = true;
            for (const url of payloadSummary.mediaUrls) {
                throwIfAborted(abortSignal);
                const caption = first ? payloadSummary.text : "";
                first = false;
                results.push(await handler.sendMedia(caption, url));
            }
            emitMessageSent(true);
        }
        catch (err) {
            emitMessageSent(false, err instanceof Error ? err.message : String(err));
            if (!params.bestEffort) {
                throw err;
            }
            params.onError?.(err, payloadSummary);
        }
    }
    if (params.mirror && results.length > 0) {
        const mirrorText = resolveMirroredTranscriptText({
            text: params.mirror.text,
            mediaUrls: params.mirror.mediaUrls,
        });
        if (mirrorText) {
            await appendAssistantMessageToSessionTranscript({
                agentId: params.mirror.agentId,
                sessionKey: params.mirror.sessionKey,
                text: mirrorText,
            });
        }
    }
    return results;
}
