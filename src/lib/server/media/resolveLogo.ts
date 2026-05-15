import { r2Presign } from './r2';

export async function resolveLogoUrl(value: string | null): Promise<string | null> {
	if (!value) return null;
	if (/^https?:\/\//i.test(value)) return value;
	try {
		return await r2Presign(value, 3600);
	} catch {
		return null;
	}
}
