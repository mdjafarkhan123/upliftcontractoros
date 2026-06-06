import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
const env = process.env;

let _connection: Redis | null = null;

export function redisConnection(): Redis {
	if (_connection) return _connection;
	const url = env.REDIS_URL;
	if (!url) throw new Error('REDIS_URL is required.');
	_connection = new IORedis(url, { maxRetriesPerRequest: null });
	return _connection;
}

export const AUTOMATION_QUEUE = 'automation';
export const NOTIFICATION_QUEUE = 'notification';
export const EMAIL_QUEUE = 'email';
export const SMS_QUEUE = 'sms';
export const MEDIA_QUEUE = 'media';
export const MESSENGER_QUEUE = 'messenger';

let _automationQueue: Queue | null = null;
let _notificationQueue: Queue | null = null;
let _emailQueue: Queue | null = null;
let _smsQueue: Queue | null = null;
let _mediaQueue: Queue | null = null;
let _messengerQueue: Queue | null = null;

export function automationQueue(): Queue {
	if (_automationQueue) return _automationQueue;
	_automationQueue = new Queue(AUTOMATION_QUEUE, { connection: redisConnection() });
	return _automationQueue;
}

export function notificationQueue(): Queue {
	if (_notificationQueue) return _notificationQueue;
	_notificationQueue = new Queue(NOTIFICATION_QUEUE, { connection: redisConnection() });
	return _notificationQueue;
}

export function emailQueue(): Queue {
	if (_emailQueue) return _emailQueue;
	_emailQueue = new Queue(EMAIL_QUEUE, { connection: redisConnection() });
	return _emailQueue;
}

export function smsQueue(): Queue {
	if (_smsQueue) return _smsQueue;
	_smsQueue = new Queue(SMS_QUEUE, { connection: redisConnection() });
	return _smsQueue;
}

export function mediaQueue(): Queue {
	if (_mediaQueue) return _mediaQueue;
	_mediaQueue = new Queue(MEDIA_QUEUE, { connection: redisConnection() });
	return _mediaQueue;
}

export function messengerQueue(): Queue {
	if (_messengerQueue) return _messengerQueue;
	_messengerQueue = new Queue(MESSENGER_QUEUE, { connection: redisConnection() });
	return _messengerQueue;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 3,
	backoff: { type: 'exponential', delay: 30_000 },
	removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
	removeOnFail: { age: 30 * 24 * 3600 }
};

export async function addJob<T = unknown>(
	queue: Queue,
	name: string,
	data: T,
	options: JobsOptions = {}
) {
	return queue.add(name, data, { ...DEFAULT_JOB_OPTIONS, ...options });
}
