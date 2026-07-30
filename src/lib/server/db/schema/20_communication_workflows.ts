import { pgEnum, pgTable, uuid, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';

export const communicationWorkflowStatusEnum = pgEnum('communication_workflow_status', [
	'draft',
	'published',
	'paused'
]);

export const communicationWorkflowTriggerEnum = pgEnum('communication_workflow_trigger', [
	'contact_dnd'
]);

export const communicationWorkflowActionEnum = pgEnum('communication_workflow_action', [
	'dnd_contact'
]);

// This is deliberately a small, explicit representation of the HighLevel DND
// workflow contract. Filters are validated at the API boundary and interpreted
// by the worker; arbitrary executable workflow code is never stored here.
export const communicationWorkflows = pgTable(
	'communication_workflows',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		status: communicationWorkflowStatusEnum('status').notNull().default('draft'),
		trigger: communicationWorkflowTriggerEnum('trigger').notNull(),
		trigger_filters: jsonb('trigger_filters').notNull().default({}),
		action: communicationWorkflowActionEnum('action').notNull(),
		action_config: jsonb('action_config').notNull().default({}),
		enabled: boolean('enabled').notNull().default(false),
		created_by_member_id: uuid('created_by_member_id'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('communication_workflows_org_status_idx').on(t.org_id, t.status, t.enabled)]
);

export type CommunicationWorkflow = InferSelectModel<typeof communicationWorkflows>;
export type NewCommunicationWorkflow = InferInsertModel<typeof communicationWorkflows>;
