import { isMessagingToolDuplicate } from "../../agents/pi-embedded-helpers.js";
import { normalizeTargetForProvider } from "../../infra/outbound/target-normalization.js";
import { extractReplyToTag } from "./reply-tags.js";
import { createReplyToModeFilterForChannel } from "./reply-threading.js";
function resolveReplyThreadingForPayload(params) {
    const implicitReplyToId = params.implicitReplyToId?.trim() || undefined;
    const currentMessageId = params.currentMessageId?.trim() || undefined;
    // 1) Apply implicit reply threading first (replyToMode will strip later if needed).
    let resolved = params.payload.replyToId || params.payload.replyToCurrent === false || !implicitReplyToId
        ? params.payload
        : { ...params.payload, replyToId: implicitReplyToId };
    // 2) Parse explicit reply tags from text (if present) and clean them.
    if (typeof resolved.text === "string" && resolved.text.includes("[[")) {
        const { cleaned, replyToId, replyToCurrent, hasTag } = extractReplyToTag(resolved.text, currentMessageId);
        resolved = {
            ...resolved,
            text: cleaned ? cleaned : undefined,
            replyToId: replyToId ?? resolved.replyToId,
            replyToTag: hasTag || resolved.replyToTag,
            replyToCurrent: replyToCurrent || resolved.replyToCurrent,
        };
    }
    // 3) If replyToCurrent was set out-of-band (e.g. tags already stripped upstream),
    // ensure replyToId is set to the current message id when available.
    if (resolved.replyToCurrent && !resolved.replyToId && currentMessageId) {
        resolved = {
            ...resolved,
            replyToId: currentMessageId,
        };
    }
    return resolved;
}
// Backward-compatible helper: apply explicit reply tags/directives to a single payload.
// This intentionally does not apply implicit threading.
export function applyReplyTagsToPayload(payload, currentMessageId) {
    return resolveReplyThreadingForPayload({ payload, currentMessageId });
}
export function isRenderablePayload(payload) {
    return Boolean(payload.text ||
        payload.mediaUrl ||
        (payload.mediaUrls && payload.mediaUrls.length > 0) ||
        payload.audioAsVoice ||
        payload.channelData);
}
export function applyReplyThreading(params) {
    const { payloads, replyToMode, replyToChannel, currentMessageId } = params;
    const applyReplyToMode = createReplyToModeFilterForChannel(replyToMode, replyToChannel);
    const implicitReplyToId = currentMessageId?.trim() || undefined;
    return payloads
        .map((payload) => resolveReplyThreadingForPayload({ payload, implicitReplyToId, currentMessageId }))
        .filter(isRenderablePayload)
        .map(applyReplyToMode);
}
export function filterMessagingToolDuplicates(params) {
    const { payloads, sentTexts } = params;
    if (sentTexts.length === 0) {
        return payloads;
    }
    return payloads.filter((payload) => !isMessagingToolDuplicate(payload.text ?? "", sentTexts));
}
function normalizeAccountId(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed.toLowerCase() : undefined;
}
export function shouldSuppressMessagingToolReplies(params) {
    const provider = params.messageProvider?.trim().toLowerCase();
    if (!provider) {
        return false;
    }
    const originTarget = normalizeTargetForProvider(provider, params.originatingTo);
    if (!originTarget) {
        return false;
    }
    const originAccount = normalizeAccountId(params.accountId);
    const sentTargets = params.messagingToolSentTargets ?? [];
    if (sentTargets.length === 0) {
        return false;
    }
    return sentTargets.some((target) => {
        if (!target?.provider) {
            return false;
        }
        if (target.provider.trim().toLowerCase() !== provider) {
            return false;
        }
        const targetKey = normalizeTargetForProvider(provider, target.to);
        if (!targetKey) {
            return false;
        }
        const targetAccount = normalizeAccountId(target.accountId);
        if (originAccount && targetAccount && originAccount !== targetAccount) {
            return false;
        }
        return targetKey === originTarget;
    });
}
