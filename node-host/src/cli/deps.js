export function createDefaultDeps() {
    const noop = async () => undefined;
    return {
        sendMessageWhatsApp: noop,
        sendMessageTelegram: noop,
        sendMessageDiscord: noop,
        sendMessageSlack: noop,
        sendMessageSignal: noop,
        sendMessageIMessage: noop,
    };
}
// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDeps(deps) {
    return {
        sendWhatsApp: deps.sendMessageWhatsApp,
        sendTelegram: deps.sendMessageTelegram,
        sendDiscord: deps.sendMessageDiscord,
        sendSlack: deps.sendMessageSlack,
        sendSignal: deps.sendMessageSignal,
        sendIMessage: deps.sendMessageIMessage,
    };
}
export { logWebSelfId } from "../web/auth-store.js";
