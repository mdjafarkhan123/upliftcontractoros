/**
 * In-memory typing indicator store — no DB or Redis dependency.
 * Contractors typing in the inbox trigger `recordTyping()`.
 * The webchat widget poll checks `isContractorTyping()`.
 *
 * Key: conversation_id
 * Value: timestamp of last typing event
 * Expiry: 7 seconds after last event (auto-purged every 60s)
 */

const typingMap = new Map<string, number>();
const TYPING_WINDOW_MS = 7_000;

export function recordTyping(conversationId: string, isTyping: boolean) {
	if (isTyping) {
		typingMap.set(conversationId, Date.now());
	} else {
		typingMap.delete(conversationId);
	}
}

export function isContractorTyping(conversationId: string): boolean {
	const lastTyping = typingMap.get(conversationId);
	if (!lastTyping) return false;
	if (Date.now() - lastTyping > TYPING_WINDOW_MS) {
		typingMap.delete(conversationId);
		return false;
	}
	return true;
}

setInterval(() => {
	const cutoff = Date.now() - TYPING_WINDOW_MS;
	for (const [key, ts] of typingMap) {
		if (ts < cutoff) typingMap.delete(key);
	}
}, 60_000);
