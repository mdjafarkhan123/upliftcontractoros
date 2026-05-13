const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'YES']);

export type OptKeyword = 'stop' | 'start' | null;

export function detectOptKeyword(body: string | null | undefined): OptKeyword {
	if (!body) return null;
	const trimmed = body.trim().toUpperCase();
	if (STOP_KEYWORDS.has(trimmed)) return 'stop';
	if (START_KEYWORDS.has(trimmed)) return 'start';
	return null;
}
