import { randomBytes, createHash, timingSafeEqual } from 'crypto';

const TOKEN_BYTES = 32;

export function generateToken(): string {
	return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(raw: string): string {
	return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function randomPlaceholderHash(): string {
	return createHash('sha256').update(randomBytes(48)).digest('hex');
}

export function constantTimeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		const aBuf = Buffer.from(a, 'hex');
		const bBuf = Buffer.from(b, 'hex');
		if (aBuf.length !== bBuf.length) return false;
		return timingSafeEqual(aBuf, bBuf);
	} catch {
		return false;
	}
}
