import { dispatchChannelMessageAction } from "../../channels/plugins/message-actions.js";
import { appendAssistantMessageToSessionTranscript } from "../../config/sessions.js";
import { throwIfAborted } from "./abort.js";
import { sendMessage, sendPoll } from "./message.js";
import { extractToolPayload } from "./tool-payload.js";
export async function executeSendAction(params) {
    throwIfAborted(params.ctx.abortSignal);
    if (!params.ctx.dryRun) {
        const handled = await dispatchChannelMessageAction({
            channel: params.ctx.channel,
            action: "send",
            cfg: params.ctx.cfg,
            params: params.ctx.params,
            accountId: params.ctx.accountId ?? undefined,
            gateway: params.ctx.gateway,
            toolContext: params.ctx.toolContext,
            dryRun: params.ctx.dryRun,
        });
        if (handled) {
            if (params.ctx.mirror) {
                const mirrorText = params.ctx.mirror.text ?? params.message;
                const mirrorMediaUrls = params.ctx.mirror.mediaUrls ??
                    params.mediaUrls ??
                    (params.mediaUrl ? [params.mediaUrl] : undefined);
                await appendAssistantMessageToSessionTranscript({
                    agentId: params.ctx.mirror.agentId,
                    sessionKey: params.ctx.mirror.sessionKey,
                    text: mirrorText,
                    mediaUrls: mirrorMediaUrls,
                });
            }
            return {
                handledBy: "plugin",
                payload: extractToolPayload(handled),
                toolResult: handled,
            };
        }
    }
    throwIfAborted(params.ctx.abortSignal);
    const result = await sendMessage({
        cfg: params.ctx.cfg,
        to: params.to,
        content: params.message,
        agentId: params.ctx.agentId,
        mediaUrl: params.mediaUrl || undefined,
        mediaUrls: params.mediaUrls,
        channel: params.ctx.channel || undefined,
        accountId: params.ctx.accountId ?? undefined,
        replyToId: params.replyToId,
        threadId: params.threadId,
        gifPlayback: params.gifPlayback,
        dryRun: params.ctx.dryRun,
        bestEffort: params.bestEffort ?? undefined,
        deps: params.ctx.deps,
        gateway: params.ctx.gateway,
        mirror: params.ctx.mirror,
        abortSignal: params.ctx.abortSignal,
        silent: params.ctx.silent,
    });
    return {
        handledBy: "core",
        payload: result,
        sendResult: result,
    };
}
export async function executePollAction(params) {
    if (!params.ctx.dryRun) {
        const handled = await dispatchChannelMessageAction({
            channel: params.ctx.channel,
            action: "poll",
            cfg: params.ctx.cfg,
            params: params.ctx.params,
            accountId: params.ctx.accountId ?? undefined,
            gateway: params.ctx.gateway,
            toolContext: params.ctx.toolContext,
            dryRun: params.ctx.dryRun,
        });
        if (handled) {
            return {
                handledBy: "plugin",
                payload: extractToolPayload(handled),
                toolResult: handled,
            };
        }
    }
    const result = await sendPoll({
        cfg: params.ctx.cfg,
        to: params.to,
        question: params.question,
        options: params.options,
        maxSelections: params.maxSelections,
        durationSeconds: params.durationSeconds ?? undefined,
        durationHours: params.durationHours ?? undefined,
        channel: params.ctx.channel,
        accountId: params.ctx.accountId ?? undefined,
        threadId: params.threadId ?? undefined,
        silent: params.ctx.silent ?? undefined,
        isAnonymous: params.isAnonymous ?? undefined,
        dryRun: params.ctx.dryRun,
        gateway: params.ctx.gateway,
    });
    return {
        handledBy: "core",
        payload: result,
        pollResult: result,
    };
}
