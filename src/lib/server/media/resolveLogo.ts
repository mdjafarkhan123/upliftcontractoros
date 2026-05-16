import { r2Presign } from './r2';

const PRESIGN_TTL_MS = 60 * 60 * 1000; // R2 signed URL lifetime — 1h
const CACHE_TTL_MS = 30 * 60 * 1000; // Serve cached URL for up to 30m

interface CacheEntry {
	url: string;
	expiresAt: number; // Unix ms — when we should re-presign
}

const cache = new Map<string, CacheEntry>();

export async function resolveLogoUrl(value: string | null): Promise<string | null> {
	if (!value) return null;
	if (/^https?:\/\//i.test(value)) return value;

	const now = Date.now();
	const hit = cache.get(value);
	if (hit && hit.expiresAt > now) return hit.url;

	try {
		const url = await r2Presign(value, PRESIGN_TTL_MS / 1000);
		cache.set(value, { url, expiresAt: now + CACHE_TTL_MS });
		return url;
	} catch {
		return null;
	}
}
