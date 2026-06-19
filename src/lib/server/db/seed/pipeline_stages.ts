import { db } from '../client';
import { pipelineStages } from '../schema';

type PipelineStageDb = Pick<typeof db, 'insert'>;

// 4 open board stages per PLAN.md §1. Won/Lost are statuses on the deal,
// not stages — they remove the card from the board, so they are not seeded here.
const DEFAULT_STAGES = [
	{
		name: 'New Lead',
		color: '#3B82F6',
		position: 1,
		is_default: true,
		is_won: false,
		is_lost: false,
		description: 'Inbound contact, zero human touch',
		stale_after_days: 2,
		probability: 10,
		default_follow_up_days: 1
	},
	{
		name: 'Contacted',
		color: '#8B5CF6',
		position: 2,
		is_default: false,
		is_won: false,
		is_lost: false,
		description: 'Meaningful human conversation started',
		stale_after_days: 3,
		probability: 25,
		default_follow_up_days: 3
	},
	{
		name: 'Scheduled',
		color: '#F59E0B',
		position: 3,
		is_default: false,
		is_won: false,
		is_lost: false,
		description: 'Confirmed appointment booked',
		stale_after_days: 5,
		probability: 40,
		default_follow_up_days: 1
	},
	{
		name: 'Quoted',
		color: '#EAB308',
		position: 4,
		is_default: false,
		is_won: false,
		is_lost: false,
		description: 'Quote sent, awaiting client decision',
		stale_after_days: 5,
		probability: 60,
		default_follow_up_days: 3
	}
] as const;

export async function seedPipelineStages(
	orgId: string,
	client: PipelineStageDb = db
): Promise<void> {
	await client.insert(pipelineStages).values(
		DEFAULT_STAGES.map((stage) => ({
			org_id: orgId,
			...stage
		}))
	);
}
