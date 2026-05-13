import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { env } from '$env/dynamic/private';

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

let _automationQueue: Queue | null = null;
let _notificationQueue: Queue | null = null;

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
