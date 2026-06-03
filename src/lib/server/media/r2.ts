import {
	S3Client,
	PutObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	type ListObjectsV2CommandOutput,
	type _Object
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const env = process.env;

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

export async function r2Get(key: string): Promise<Buffer> {
	const res = await r2Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
	if (!res.Body) throw new Error(`R2 object ${key} has no body`);
	const chunks: Uint8Array[] = [];
	// @ts-expect-error -- Body is a Node Readable stream in this runtime
	for await (const chunk of res.Body) chunks.push(chunk);
	return Buffer.concat(chunks);
}

export async function r2Upload(key: string, body: Buffer, contentType: string): Promise<void> {
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

export async function r2DeleteByPrefix(prefix: string): Promise<number> {
	const client = r2Client();
	const Bucket = bucket();
	let continuationToken: string | undefined = undefined;
	let deletedCount = 0;
	do {
		const listed: ListObjectsV2CommandOutput = await client.send(
			new ListObjectsV2Command({
				Bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken
			})
		);
		const keys = (listed.Contents ?? [])
			.map((o: _Object) => o.Key)
			.filter((k): k is string => typeof k === 'string' && k.length > 0);
		if (keys.length > 0) {
			for (let i = 0; i < keys.length; i += 1000) {
				const batch = keys.slice(i, i + 1000);
				await client.send(
					new DeleteObjectsCommand({
						Bucket,
						Delete: { Objects: batch.map((Key: string) => ({ Key })), Quiet: true }
					})
				);
				deletedCount += batch.length;
			}
		}
		continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
	} while (continuationToken);
	return deletedCount;
}

export async function r2Presign(key: string, expiresInSeconds = 3600): Promise<string> {
	return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
		expiresIn: expiresInSeconds
	});
}
