import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	communicationWorkflows,
	type CommunicationPreferenceChannel,
	type CommunicationPreferenceDirection,
	type CommunicationPreferenceStatus
} from '$lib/server/db/schema';
import {
	changeCommunicationPreferenceInTransaction,
	CommunicationPreferenceMutationError,
	type ChangePreferenceInput
} from './mutations';

type PreferenceChangedEvent = {
	org_id: string;
	contact_id: string;
	channel: CommunicationPreferenceChannel;
	direction: CommunicationPreferenceDirection;
	next_status: CommunicationPreferenceStatus;
	previous_status?: CommunicationPreferenceStatus | null;
	provider?: string | null;
	provider_event_id?: string | null;
	metadata?: Record<string, unknown>;
};

type TriggerFilters = {
	direction?: 'inbound' | 'outbound';
	state?: 'enabled' | 'disabled';
	scope?: 'all_channels' | 'specific_channels';
	channels?: CommunicationPreferenceChannel[];
};

type DndActionConfig = {
	direction: 'inbound' | 'outbound';
	operation: 'enable' | 'disable';
	scope: 'all_channels' | 'specific_channels';
	channels?: CommunicationPreferenceChannel[];
};

function isEnabled(status: CommunicationPreferenceStatus) {
	return status === 'blocked' || status === 'permanent';
}

function triggerMatches(filters: TriggerFilters, event: PreferenceChangedEvent) {
	if (filters.direction && filters.direction !== event.direction) return false;
	if (filters.state && (filters.state === 'enabled') !== isEnabled(event.next_status)) {
		return false;
	}
	if (filters.scope === 'all_channels' && event.channel !== 'all') return false;
	if (filters.scope === 'specific_channels') {
		if (event.channel === 'all') return false;
		if (!filters.channels?.includes(event.channel)) return false;
	}
	return true;
}

function actionScopes(config: DndActionConfig): Array<{
	channel: CommunicationPreferenceChannel;
	direction: CommunicationPreferenceDirection;
}> {
	if (config.scope === 'all_channels') {
		return [{ channel: 'all', direction: config.direction }];
	}
	return (config.channels ?? [])
		.filter((channel) => channel !== 'all')
		.map((channel) => ({ channel, direction: config.direction }));
}

function validConfig(
	workflow: typeof communicationWorkflows.$inferSelect
): { filters: TriggerFilters; action: DndActionConfig } | null {
	const filters = workflow.trigger_filters as TriggerFilters;
	const action = workflow.action_config as DndActionConfig;
	if (!action || !['inbound', 'outbound'].includes(action.direction)) return null;
	if (!['enable', 'disable'].includes(action.operation)) return null;
	if (!['all_channels', 'specific_channels'].includes(action.scope)) return null;
	if (action.direction === 'inbound' && action.scope !== 'all_channels') return null;
	if (action.scope === 'specific_channels' && (!action.channels || action.channels.length === 0)) {
		return null;
	}
	return { filters: filters ?? {}, action };
}

/** Execute published Contact DND workflows for one preference change. */
export async function runCommunicationPreferenceWorkflows(event: PreferenceChangedEvent) {
	const workflows = await db
		.select()
		.from(communicationWorkflows)
		.where(
			and(
				eq(communicationWorkflows.org_id, event.org_id),
				eq(communicationWorkflows.trigger, 'contact_dnd'),
				eq(communicationWorkflows.status, 'published'),
				eq(communicationWorkflows.enabled, true)
			)
		);

	for (const workflow of workflows) {
		const config = validConfig(workflow);
		if (!config || !triggerMatches(config.filters, event)) continue;

		for (const scope of actionScopes(config.action)) {
			const input: ChangePreferenceInput = {
				orgId: event.org_id,
				contactId: event.contact_id,
				channel: scope.channel,
				direction: scope.direction,
				category: 'all',
				status: config.action.operation === 'enable' ? 'blocked' : 'allowed',
				source: 'workflow',
				reasonCode: 'WORKFLOW_DND_ACTION',
				reasonMessage: workflow.name,
				metadata: {
					workflow_id: workflow.id,
					workflow_name: workflow.name,
					trigger_event: 'contact.communication_preference_changed',
					trigger_channel: event.channel,
					trigger_direction: event.direction
				}
			};
			try {
				await db.transaction((tx) => changeCommunicationPreferenceInTransaction(tx, input));
			} catch (error) {
				if (!(error instanceof CommunicationPreferenceMutationError)) throw error;
				// HighLevel does not let a workflow clear permanent DND. The workflow
				// remains successful, but this action is intentionally skipped.
				if (error.code === 'PERMANENT_DND_LOCKED') continue;
				throw error;
			}
		}
	}
}
