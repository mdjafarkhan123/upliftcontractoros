export type TeamMemberItem = {
	id: string;
	full_name: string;
	email: string;
	role: 'admin' | 'manager' | 'member';
	is_active: boolean;
	created_at: string;
};

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

let items = $state<TeamMemberItem[]>([]);
let includeInactive = $state(false);
let status = $state<Status>('idle');
let errorMsg = $state<string | null>(null);
let lastFetchedAt = $state(0);

const TTL_MS = 30_000;

async function fetchMembers(inactive: boolean): Promise<TeamMemberItem[]> {
	const params = inactive ? '?inactive=1' : '';
	const res = await fetch(`/api/team${params}`);
	if (!res.ok) throw new Error('Failed to load team members');
	const body = (await res.json()) as { data: TeamMemberItem[] };
	return body.data;
}

export const teamStore = {
	get items(): TeamMemberItem[] {
		return items;
	},
	get status(): Status {
		return status;
	},
	get error(): string | null {
		return errorMsg;
	},
	get lastFetchedAt(): number {
		return lastFetchedAt;
	},
	get includeInactive(): boolean {
		return includeInactive;
	},

	async load(inactive = false, force = false): Promise<void> {
		const stale = Date.now() - lastFetchedAt > TTL_MS;
		const filterChanged = inactive !== includeInactive;

		if (!force && !stale && !filterChanged && items.length > 0) return;

		includeInactive = inactive;
		status = items.length > 0 && !filterChanged ? 'revalidating' : 'loading';

		try {
			const data = await fetchMembers(inactive);
			items = data;
			lastFetchedAt = Date.now();
			status = 'ready';
			errorMsg = null;
		} catch (e) {
			status = 'error';
			errorMsg = e instanceof Error ? e.message : 'Failed to load team members';
		}
	},

	update(updated: TeamMemberItem): void {
		const idx = items.findIndex((m) => m.id === updated.id);
		if (idx >= 0) {
			items[idx] = updated;
		} else {
			items = [...items, updated];
		}
	},

	remove(id: string): void {
		items = items.filter((m) => m.id !== id);
	},

	invalidate(): void {
		lastFetchedAt = 0;
	}
};
