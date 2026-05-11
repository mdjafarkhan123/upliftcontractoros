import { db } from '../client';
import { pipelineStages } from '../schema';

type PipelineStageDb = Pick<typeof db, 'insert'>;

const DEFAULT_STAGES = [
	{
		name: 'New Lead',
		color: '#3B82F6',
		position: 1,
		is_default: true,
		is_won: false,
		is_lost: false
	},
	{
		name: 'Contacted',
		color: '#8B5CF6',
		position: 2,
		is_default: false,
		is_won: false,
		is_lost: false
	},
	{
		name: 'Estimate Scheduled',
		color: '#F59E0B',
		position: 3,
		is_default: false,
		is_won: false,
		is_lost: false
	},
	{
		name: 'Quoted',
		color: '#EAB308',
		position: 4,
		is_default: false,
		is_won: false,
		is_lost: false
	},
	{
		name: 'Follow-Up',
		color: '#EC4899',
		position: 5,
		is_default: false,
		is_won: false,
		is_lost: false
	},
	{
		name: 'Won',
		color: '#10B981',
		position: 6,
		is_default: false,
		is_won: true,
		is_lost: false
	},
	{
		name: 'Lost',
		color: '#6B7280',
		position: 7,
		is_default: false,
		is_won: false,
		is_lost: true
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
