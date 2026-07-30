import { z } from 'zod';

export const workflowChannels = [
	'sms',
	'email',
	'call',
	'whatsapp',
	'messenger',
	'gbp',
	'webchat'
] as const;

export const communicationWorkflowSchema = z.object({
	name: z.string().trim().min(1).max(160),
	status: z.enum(['draft', 'published', 'paused']).default('draft'),
	trigger_filters: z.object({
		direction: z.enum(['inbound', 'outbound']).optional(),
		state: z.enum(['enabled', 'disabled']).optional(),
		scope: z.enum(['all_channels', 'specific_channels']).optional(),
		channels: z.array(z.enum(workflowChannels)).max(7).optional()
	}),
	action_config: z
		.object({
			direction: z.enum(['inbound', 'outbound']),
			operation: z.enum(['enable', 'disable']),
			scope: z.enum(['all_channels', 'specific_channels']),
			channels: z.array(z.enum(workflowChannels)).max(7).optional()
		})
		.superRefine((value, ctx) => {
			if (value.scope === 'specific_channels' && (!value.channels || value.channels.length === 0)) {
				ctx.addIssue({
					code: 'custom',
					path: ['channels'],
					message: 'Select at least one channel.'
				});
			}
			if (value.direction === 'inbound' && value.scope !== 'all_channels') {
				ctx.addIssue({
					code: 'custom',
					path: ['scope'],
					message: 'Inbound DND must apply to all inbound communication.'
				});
			}
		}),
	enabled: z.boolean().default(false)
});

export type CommunicationWorkflowInput = z.infer<typeof communicationWorkflowSchema>;
