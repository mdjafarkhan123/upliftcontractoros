import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

let _client: S3Client | null = null;

export function r2(): S3Client {
	if (_client) return _client;
	const endpoint = env.R2_ENDPOINT;
	const accessKeyId = env.R2_ACCESS_KEY_ID;
	const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
	if (!endpoint || !accessKeyId || !secretAccessKey) {
		throw new Error('R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required.');
	}
	_client = new S3Client({
		region: 'auto',
		endpoint,
		credentials: { accessKeyId, secretAccessKey }
	});
	return _client;
}

export function r2Bucket(): string {
	const bucket = env.R2_BUCKET;
	if (!bucket) throw new Error('R2_BUCKET is required.');
	return bucket;
}

export async function uploadBuffer(
	key: string,
	body: Buffer | Uint8Array,
	contentType: string
): Promise<void> {
	await r2().send(
		new PutObjectCommand({
			Bucket: r2Bucket(),
			Key: key,
			Body: body,
			ContentType: contentType
		})
	);
}

export async function presignDownloadUrl(key: string, ttlSeconds = 3600): Promise<string> {
	return getSignedUrl(r2(), new GetObjectCommand({ Bucket: r2Bucket(), Key: key }), {
		expiresIn: ttlSeconds
	});
}
