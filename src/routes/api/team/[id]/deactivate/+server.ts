import { json, error } from '@sveltejs/kit';
import { and, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers, contacts, conversations, jobs, appointments } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_delete_team_members) error(403, 'Forbidden');

	const memberId = event.params.id;

	// Self-deactivation not allowed
	if (memberId === auth.member.id) {
		return json({ error: 'You cannot deactivate yourself.' }, { status: 403 });
	}

	const [target] = await db
		.select()
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.id, memberId),
				eq(orgMembers.org_id, auth.orgId),
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);

	if (!target) error(404, 'Not found');
	if (!target.is_active) {
		return json({ error: 'Member is already inactive.' }, { status: 400 });
	}

	// Prevent removing last active admin
	if (target.role === 'admin') {
		const [{ value: adminCount }] = await db
			.select({ value: count() })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.org_id, auth.orgId),
					eq(orgMembers.role, 'admin'),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			);

		if (adminCount <= 1) {
			return json({ error: 'Cannot deactivate the last active admin.' }, { status: 422 });
		}
	}

	// Gather assignment counts (for warning display)
	const [
		[{ value: assignedContacts }],
		[{ value: openConversations }],
		[{ value: activeJobs }],
		[{ value: upcomingAppointments }]
	] = await Promise.all([
		db
			.select({ value: count() })
			.from(contacts)
			.where(
				and(
					eq(contacts.assigned_to, memberId),
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at)
				)
			),
		db
			.select({ value: count() })
			.from(conversations)
			.where(
				and(
					eq(conversations.assigned_to, memberId),
					eq(conversations.org_id, auth.orgId),
					eq(conversations.status, 'open'),
					isNull(conversations.deleted_at)
				)
			),
		db
			.select({ value: count() })
			.from(jobs)
			.where(
				and(
					eq(jobs.assigned_to, memberId),
					eq(jobs.org_id, auth.orgId),
					eq(jobs.status, 'active'),
					isNull(jobs.deleted_at)
				)
			),
		db
			.select({ value: count() })
			.from(appointments)
			.where(
				and(
					eq(appointments.assigned_to, memberId),
					eq(appointments.org_id, auth.orgId),
					eq(appointments.status, 'scheduled'),
					isNull(appointments.deleted_at),
					gt(appointments.scheduled_start, new Date())
				)
			)
	]);

	await db
		.update(orgMembers)
		.set({ is_active: false, updated_at: new Date() })
		.where(
			and(
				eq(orgMembers.id, memberId),
				eq(orgMembers.org_id, auth.orgId),
				isNull(orgMembers.deleted_at)
			)
		);

	return json({
		data: {
			deactivated: true,
			counts: {
				assigned_contacts: assignedContacts,
				open_conversations: openConversations,
				active_jobs: activeJobs,
				upcoming_appointments: upcomingAppointments
			}
		}
	});
};
