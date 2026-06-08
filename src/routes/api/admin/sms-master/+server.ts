import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	getSmsControlState,
	setMasterFloor,
	pauseSms,
	resumeSms,
	refreshMasterBalance
} from '$lib/server/sms/masterFloor';
import { fetchTwilioBalance } from '$lib/server/twilio/balance';

// Auth: /api/admin/* is jafar-guarded in hooks.server.ts (401 without session).

const fmt = (n: number) => n.toFixed(4);

const floorSchema = z.object({
	sms_master_floor: z
		.number()
		.finite()
		.min(0, 'Must be zero or positive')
		.max(1_000_000, 'Too large')
});

const actionSchema = z.object({
	action: z.enum(['pause', 'resume', 'refresh'])
});

function fieldErrors(err: z.ZodError) {
	return Object.fromEntries(err.issues.map((i) => [String(i.path[0] ?? ''), i.message]));
}

export const GET: RequestHandler = async () => {
	return json({ data: await getSmsControlState() });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const raw = await request.json().catch(() => ({}));
	const parsed = floorSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body.', field_errors: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}
	await setMasterFloor(fmt(parsed.data.sms_master_floor));
	return json({ data: await getSmsControlState() });
};

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.json().catch(() => ({}));
	const parsed = actionSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body.', field_errors: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}

	if (parsed.data.action === 'pause') {
		await pauseSms('Manually paused by PO.');
		return json({ data: await getSmsControlState() });
	}

	if (parsed.data.action === 'refresh') {
		try {
			await refreshMasterBalance();
		} catch (err) {
			return json(
				{ error: err instanceof Error ? err.message : 'Failed to fetch Twilio balance.' },
				{ status: 502 }
			);
		}
		return json({ data: await getSmsControlState() });
	}

	// action === 'resume' — re-verify balance >= floor before draining the queue.
	const state = await getSmsControlState();
	if (state.floor > 0) {
		let availableCredit: number;
		try {
			({ availableCredit } = await fetchTwilioBalance());
		} catch {
			return json(
				{ error: 'Could not verify Twilio balance. Try again before resuming.' },
				{ status: 502 }
			);
		}
		if (availableCredit < state.floor) {
			return json({ error: 'Balance below floor. Top up Twilio first.' }, { status: 400 });
		}
	}

	await resumeSms();
	return json({ data: await getSmsControlState() });
};
