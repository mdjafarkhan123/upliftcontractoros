import type { PermissionKey } from '$lib/types';

export type PermissionGroup = {
	module: string;
	permissions: { key: PermissionKey; label: string; description: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
	{
		module: 'Dashboard',
		permissions: [
			{ key: 'can_view_dashboard', label: 'View dashboard', description: 'Access the main dashboard overview' },
			{ key: 'can_view_revenue', label: 'View revenue', description: 'See revenue charts and financial summaries' },
			{ key: 'can_view_pipeline_snapshot', label: 'View pipeline snapshot', description: 'View pipeline value and stage counts' }
		]
	},
	{
		module: 'Inbox',
		permissions: [
			{ key: 'can_view_all_conversations', label: 'View all conversations', description: 'See all team conversations, not just assigned ones' },
			{ key: 'can_view_assigned_conversations', label: 'View assigned conversations', description: 'See conversations assigned to them' },
			{ key: 'can_send_messages', label: 'Send messages', description: 'Reply to and send SMS messages' },
			{ key: 'can_delete_conversations', label: 'Delete conversations', description: 'Archive or delete conversation threads' }
		]
	},
	{
		module: 'Contacts',
		permissions: [
			{ key: 'can_view_all_contacts', label: 'View all contacts', description: 'Browse the full contact list' },
			{ key: 'can_create_contacts', label: 'Create contacts', description: 'Add new leads and customers' },
			{ key: 'can_edit_contacts', label: 'Edit contacts', description: 'Update contact details and status' },
			{ key: 'can_delete_contacts', label: 'Delete contacts', description: 'Permanently remove contacts' }
		]
	},
	{
		module: 'Pipeline',
		permissions: [
			{ key: 'can_view_full_pipeline', label: 'View full pipeline', description: 'See all opportunities across every stage' },
			{ key: 'can_move_pipeline_stages', label: 'Move pipeline stages', description: 'Drag opportunities between pipeline stages' },
			{ key: 'can_create_opportunities', label: 'Create opportunities', description: 'Add new pipeline opportunities' }
		]
	},
	{
		module: 'Jobs',
		permissions: [
			{ key: 'can_view_assigned_jobs', label: 'View assigned jobs', description: 'View jobs assigned to them' }
		]
	},
	{
		module: 'Quotes',
		permissions: [
			{ key: 'can_view_all_quotes', label: 'View all quotes', description: 'Browse all quotes in the org' },
			{ key: 'can_create_quotes', label: 'Create quotes', description: 'Generate new quotes for contacts' },
			{ key: 'can_send_quotes', label: 'Send quotes', description: 'Send quotes to clients via SMS or email' },
			{ key: 'can_edit_quotes', label: 'Edit quotes', description: 'Modify quote line items and totals' },
			{ key: 'can_delete_quotes', label: 'Delete quotes', description: 'Permanently remove quotes' }
		]
	},
	{
		module: 'Invoices',
		permissions: [
			{ key: 'can_view_all_invoices', label: 'View all invoices', description: 'Browse all invoices in the org' },
			{ key: 'can_create_invoices', label: 'Create invoices', description: 'Generate new invoices' },
			{ key: 'can_send_invoices', label: 'Send invoices', description: 'Send invoices to clients' },
			{ key: 'can_record_payments', label: 'Record payments', description: 'Mark invoices as paid' },
			{ key: 'can_delete_invoices', label: 'Delete invoices', description: 'Permanently remove invoices' }
		]
	},
	{
		module: 'Appointments',
		permissions: [
			{ key: 'can_view_all_appointments', label: 'View all appointments', description: 'See all scheduled appointments' },
			{ key: 'can_view_assigned_appointments', label: 'View assigned appointments', description: 'View appointments assigned to them' },
			{ key: 'can_create_appointments', label: 'Create appointments', description: 'Schedule new appointments' },
			{ key: 'can_reschedule_appointments', label: 'Reschedule appointments', description: 'Change appointment times and dates' }
		]
	},
	{
		module: 'Reputation',
		permissions: [
			{ key: 'can_view_reviews', label: 'View reviews', description: 'See customer reviews and ratings' },
			{ key: 'can_send_review_requests', label: 'Send review requests', description: 'Request reviews from completed jobs' },
			{ key: 'can_view_negative_feedback', label: 'View negative feedback', description: 'See private negative feedback' }
		]
	},
	{
		module: 'Growth Feed',
		permissions: [
			{ key: 'can_view_growth_feed', label: 'View growth feed', description: 'Access the agency growth feed' }
		]
	},
	{
		module: 'Files & Media',
		permissions: [
			{ key: 'can_view_all_files', label: 'View all files', description: 'Browse the full media library' },
			{ key: 'can_upload_files', label: 'Upload files', description: 'Upload photos, documents, and media' },
			{ key: 'can_delete_files', label: 'Delete files', description: 'Permanently delete uploaded files' }
		]
	},
	{
		module: 'Team Management',
		permissions: [
			{ key: 'can_view_team_members', label: 'View team members', description: 'View the team list and member details' },
			{ key: 'can_create_team_members', label: 'Create team members', description: 'Invite and create new team accounts' },
			{ key: 'can_edit_team_members', label: 'Edit team members', description: 'Edit team member permissions' },
			{ key: 'can_delete_team_members', label: 'Deactivate team members', description: 'Deactivate members to revoke their access' }
		]
	}
];

export type PermissionValues = Record<PermissionKey, boolean>;

export const MANAGER_TEMPLATE: PermissionValues = {
	can_view_dashboard: true,
	can_view_revenue: true,
	can_view_pipeline_snapshot: true,
	can_view_all_conversations: true,
	can_view_assigned_conversations: true,
	can_send_messages: true,
	can_delete_conversations: false,
	can_view_all_contacts: true,
	can_create_contacts: true,
	can_edit_contacts: true,
	can_delete_contacts: false,
	can_view_full_pipeline: true,
	can_move_pipeline_stages: true,
	can_create_opportunities: true,
	can_view_assigned_jobs: true,
	can_view_all_quotes: true,
	can_create_quotes: true,
	can_send_quotes: true,
	can_edit_quotes: true,
	can_delete_quotes: false,
	can_view_all_invoices: true,
	can_create_invoices: true,
	can_send_invoices: true,
	can_record_payments: true,
	can_delete_invoices: false,
	can_view_all_appointments: true,
	can_view_assigned_appointments: true,
	can_create_appointments: true,
	can_reschedule_appointments: true,
	can_view_reviews: true,
	can_send_review_requests: true,
	can_view_negative_feedback: true,
	can_view_growth_feed: true,
	can_view_all_files: true,
	can_upload_files: true,
	can_delete_files: false,
	can_view_team_members: true,
	can_create_team_members: false,
	can_edit_team_members: false,
	can_delete_team_members: false
};

export const MEMBER_TEMPLATE: PermissionValues = {
	can_view_dashboard: true,
	can_view_revenue: false,
	can_view_pipeline_snapshot: false,
	can_view_all_conversations: false,
	can_view_assigned_conversations: true,
	can_send_messages: true,
	can_delete_conversations: false,
	can_view_all_contacts: false,
	can_create_contacts: false,
	can_edit_contacts: false,
	can_delete_contacts: false,
	can_view_full_pipeline: false,
	can_move_pipeline_stages: false,
	can_create_opportunities: false,
	can_view_assigned_jobs: true,
	can_view_all_quotes: false,
	can_create_quotes: false,
	can_send_quotes: false,
	can_edit_quotes: false,
	can_delete_quotes: false,
	can_view_all_invoices: false,
	can_create_invoices: false,
	can_send_invoices: false,
	can_record_payments: false,
	can_delete_invoices: false,
	can_view_all_appointments: false,
	can_view_assigned_appointments: true,
	can_create_appointments: false,
	can_reschedule_appointments: false,
	can_view_reviews: false,
	can_send_review_requests: false,
	can_view_negative_feedback: false,
	can_view_growth_feed: false,
	can_view_all_files: false,
	can_upload_files: true,
	can_delete_files: false,
	can_view_team_members: false,
	can_create_team_members: false,
	can_edit_team_members: false,
	can_delete_team_members: false
};

export function getTemplate(role: 'manager' | 'member'): PermissionValues {
	return role === 'manager' ? { ...MANAGER_TEMPLATE } : { ...MEMBER_TEMPLATE };
}

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

export function isKnownPermissionKey(key: string): key is PermissionKey {
	return PERMISSION_KEY_SET.has(key);
}
