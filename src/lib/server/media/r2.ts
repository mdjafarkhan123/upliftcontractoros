import {
	S3Client,
	PutObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

let _client: S3Client | null = null;

function r2Client(): S3Client {
	if (_client) return _client;
	const accountId = env.R2_ACCOUNT_ID;
	const accessKeyId = env.R2_ACCESS_KEY_ID;
	const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
	if (!accountId || !accessKeyId || !secretAccessKey) {
		throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required.');
	}
	_client = new S3Client({
		region: 'auto',
		endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
		credentials: { accessKeyId, secretAccessKey }
	});
	return _client;
}

function bucket(): string {
	const b = env.R2_BUCKET;
	if (!b) throw new Error('R2_BUCKET is required.');
	return b;
}

export async function r2Upload(
	key: string,
	body: Buffer,
	contentType: string
): Promise<void> {
	await r2Client().send(
		new PutObjectCommand({
			Bucket: bucket(),
			Key: key,
			Body: body,
			ContentType: contentType
		})
	);
}

export async function r2DeleteObjects(keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	await r2Client().send(
		new DeleteObjectsCommand({
			Bucket: bucket(),
			Delete: {
				Objects: keys.map((k) => ({ Key: k })),
				Quiet: true
			}
		})
	);
}

export async function r2Presign(key: string, expiresInSeconds = 3600): Promise<string> {
	return getSignedUrl(
		r2Client(),
		new GetObjectCommand({ Bucket: bucket(), Key: key }),
		{ expiresIn: expiresInSeconds }
	);
}
