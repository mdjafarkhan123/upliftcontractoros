import { z } from 'zod';
import type { PermissionKey } from '$lib/types';

export type PermissionDef = {
	key: PermissionKey;
	label: string;
	description: string;
};

export type PermissionGroup = {
	id: string;
	title: string;
	permissions: PermissionDef[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
	{
		id: 'dashboard',
		title: 'Dashboard',
		permissions: [
			{
				key: 'can_view_dashboard',
				label: 'View dashboard',
				description: 'Access the home dashboard.'
			},
			{
				key: 'can_view_revenue',
				label: 'View revenue',
				description: 'See revenue widgets and totals.'
			},
			{
				key: 'can_view_pipeline_snapshot',
				label: 'View pipeline snapshot',
				description: 'See pipeline summary on dashboard.'
			}
		]
	},
	{
		id: 'inbox',
		title: 'Inbox',
		permissions: [
			{
				key: 'can_view_all_conversations',
				label: 'View all conversations',
				description: 'See every conversation in the inbox.'
			},
			{
				key: 'can_view_assigned_conversations',
				label: 'View assigned conversations',
				description: 'See only conversations assigned to them.'
			},
			{
				key: 'can_send_messages',
				label: 'Send messages',
				description: 'Reply in conversations.'
			},
			{
				key: 'can_delete_conversations',
				label: 'Delete conversations',
				description: 'Soft delete conversations.'
			}
		]
	},
	{
		id: 'contacts',
		title: 'Contacts',
		permissions: [
			{
				key: 'can_view_all_contacts',
				label: 'View all contacts',
				description: 'See the full contact directory.'
			},
			{ key: 'can_create_contacts', label: 'Create contacts', description: 'Add new contacts.' },
			{
				key: 'can_edit_contacts',
				label: 'Edit contacts',
				description: 'Update contact records.'
			},
			{
				key: 'can_delete_contacts',
				label: 'Delete contacts',
				description: 'Soft delete contacts.'
			}
		]
	},
	{
		id: 'pipeline',
		title: 'Pipeline & Jobs',
		permissions: [
			{
				key: 'can_view_full_pipeline',
				label: 'View full pipeline',
				description: 'See all opportunities across stages.'
			},
			{
				key: 'can_move_pipeline_stages',
				label: 'Move pipeline stages',
				description: 'Drag opportunities between stages.'
			},
			{
				key: 'can_create_opportunities',
				label: 'Create opportunities',
				description: 'Add new pipeline opportunities.'
			},
			{
				key: 'can_view_assigned_jobs',
				label: 'View assigned jobs',
				description: 'See jobs assigned to them.'
			}
		]
	},
	{
		id: 'quotes',
		title: 'Quotes',
		permissions: [
			{
				key: 'can_view_all_quotes',
				label: 'View all quotes',
				description: 'See every quote in the org.'
			},
			{ key: 'can_create_quotes', label: 'Create quotes', description: 'Draft new quotes.' },
			{
				key: 'can_send_quotes',
				label: 'Send quotes',
				description: 'Send quotes to customers.'
			},
			{ key: 'can_edit_quotes', label: 'Edit quotes', description: 'Modify existing quotes.' },
			{
				key: 'can_delete_quotes',
				label: 'Delete quotes',
				description: 'Soft delete quotes.'
			}
		]
	},
	{
		id: 'invoices',
		title: 'Invoices',
		permissions: [
			{
				key: 'can_view_all_invoices',
				label: 'View all invoices',
				description: 'See every invoice in the org.'
			},
			{
				key: 'can_create_invoices',
				label: 'Create invoices',
				description: 'Draft new invoices.'
			},
			{
				key: 'can_send_invoices',
				label: 'Send invoices',
				description: 'Send invoices to customers.'
			},
			{
				key: 'can_record_payments',
				label: 'Record payments',
				description: 'Mark payments received on invoices.'
			},
			{
				key: 'can_delete_invoices',
				label: 'Delete invoices',
				description: 'Soft delete invoices.'
			}
		]
	},
	{
		id: 'appointments',
		title: 'Appointments',
		permissions: [
			{
				key: 'can_view_all_appointments',
				label: 'View all appointments',
				description: 'See every appointment in the org.'
			},
			{
				key: 'can_view_assigned_appointments',
				label: 'View assigned appointments',
				description: 'See only appointments assigned to them.'
			},
			{
				key: 'can_create_appointments',
				label: 'Create appointments',
				description: 'Book new appointments.'
			},
			{
				key: 'can_reschedule_appointments',
				label: 'Reschedule appointments',
				description: 'Move or cancel appointments.'
			}
		]
	},
	{
		id: 'reputation',
		title: 'Reputation',
		permissions: [
			{
				key: 'can_view_reviews',
				label: 'View reviews',
				description: 'See review responses and ratings.'
			},
			{
				key: 'can_send_review_requests',
				label: 'Send review requests',
				description: 'Trigger review funnel manually.'
			},
			{
				key: 'can_view_negative_feedback',
				label: 'View negative feedback',
				description: 'See negative responses routed internally.'
			}
		]
	},
	{
		id: 'growth',
		title: 'Growth Feed',
		permissions: [
			{
				key: 'can_view_growth_feed',
				label: 'View growth feed',
				description: 'Access activity stream of org events.'
			}
		]
	},
	{
		id: 'files',
		title: 'Files & Media',
		permissions: [
			{
				key: 'can_view_all_files',
				label: 'View all files',
				description: 'See every file in the org.'
			},
			{ key: 'can_upload_files', label: 'Upload files', description: 'Add new files.' },
			{
				key: 'can_delete_files',
				label: 'Delete files',
				description: 'Soft delete files.'
			}
		]
	},
	{
		id: 'team',
		title: 'Team Management',
		permissions: [
			{
				key: 'can_view_team_members',
				label: 'View team members',
				description: 'See the team roster.'
			},
			{
				key: 'can_create_team_members',
				label: 'Create team members',
				description: 'Invite new org members.'
			},
			{
				key: 'can_edit_team_members',
				label: 'Edit team members',
				description: 'Update member roles and permissions.'
			},
			{
				key: 'can_delete_team_members',
				label: 'Delete team members',
				description: 'Deactivate org members.'
			}
		]
	}
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
	g.permissions.map((p) => p.key)
);

export const adminPermissionsSchema = z.object(
	Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, z.boolean()]))
) as z.ZodType<Record<PermissionKey, boolean>>;

export function fullAdminPermissions(): Record<PermissionKey, boolean> {
	return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])) as Record<
		PermissionKey,
		boolean
	>;
}

export function emptyPermissions(): Record<PermissionKey, boolean> {
	return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false])) as Record<
		PermissionKey,
		boolean
	>;
}
