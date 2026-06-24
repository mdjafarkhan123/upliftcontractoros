<script lang="ts">
	import { onMount } from 'svelte';
	import type { DndEvent } from 'svelte-dnd-action';
	import { lazyDndzone } from '$lib/actions/lazyDndzone';
	import { flip } from 'svelte/animate';
	import { GripVertical, Plus, Pencil, Trash2, Star, Columns3, Lock } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { cn } from '$lib/utils/cn';

	type Stage = {
		id: string;
		name: string;
		color: string;
		position: number;
		is_default: boolean;
		description: string | null;
		stale_after_days: number | null;
		probability: number | null;
		default_follow_up_days: number | null;
	};

	const COLOR_PRESETS = [
		'#3B82F6',
		'#8B5CF6',
		'#6366F1',
		'#06B6D4',
		'#10B981',
		'#14B8A6',
		'#EAB308',
		'#F59E0B',
		'#F97316',
		'#EF4444',
		'#EC4899',
		'#64748B'
	];

	const member = getMemberContext();
	const canManage = $derived(member().can_manage_pipeline);

	let stages = $state<Stage[]>([]);
	let loading = $state(true);

	// --- Pipeline behavior settings (Stage 1.3.A) ---
	type WonTrigger = 'quote_acceptance' | 'deposit_paid';
	const GHOST_DAY_OPTIONS = [7, 14, 21, 30] as const;
	let wonTrigger = $state<WonTrigger>('quote_acceptance');
	let ghostLeadDays = $state<number>(14);
	let behaviorLoaded = $state(false);
	let savingBehavior = $state(false);

	async function loadBehavior() {
		try {
			const res = await fetch('/api/settings/pipeline');
			if (!res.ok) return;
			const body = (await res.json()) as {
				data?: { won_trigger: WonTrigger; ghost_lead_days: number };
			};
			if (body.data) {
				wonTrigger = body.data.won_trigger;
				ghostLeadDays = body.data.ghost_lead_days;
				behaviorLoaded = true;
			}
		} catch {
			// non-fatal; section just stays at defaults
		}
	}

	// Optimistic save with revert-on-failure.
	async function saveBehavior(patch: { won_trigger?: WonTrigger; ghost_lead_days?: number }) {
		if (savingBehavior) return;
		const prev = { won_trigger: wonTrigger, ghost_lead_days: ghostLeadDays };
		if (patch.won_trigger !== undefined) wonTrigger = patch.won_trigger;
		if (patch.ghost_lead_days !== undefined) ghostLeadDays = patch.ghost_lead_days;
		savingBehavior = true;
		try {
			const res = await fetch('/api/settings/pipeline', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			const json = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) {
				wonTrigger = prev.won_trigger;
				ghostLeadDays = prev.ghost_lead_days;
				toast.error('Could not save setting', { description: json.error });
				return;
			}
			toast.success('Setting saved');
		} finally {
			savingBehavior = false;
		}
	}

	const flipDuration = 180;

	function toStage(row: Record<string, unknown>): Stage {
		return {
			id: row.id as string,
			name: row.name as string,
			color: row.color as string,
			position: row.position as number,
			is_default: row.is_default as boolean,
			description: (row.description as string | null) ?? null,
			stale_after_days: (row.stale_after_days as number | null) ?? null,
			probability: (row.probability as number | null) ?? null,
			default_follow_up_days: (row.default_follow_up_days as number | null) ?? null
		};
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/pipeline/stages');
			if (!res.ok) {
				toast.error('Could not load stages.');
				return;
			}
			const body = (await res.json()) as { stages: Record<string, unknown>[] };
			stages = body.stages.map(toStage);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load();
		loadBehavior();
	});

	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	// --- Reorder (drag) ---
	function handleConsider(e: CustomEvent<DndEvent<Stage>>) {
		stages = e.detail.items;
	}

	async function handleFinalize(e: CustomEvent<DndEvent<Stage>>) {
		stages = e.detail.items;
		const stage_ids = stages.map((s) => s.id);
		const res = await fetch('/api/pipeline/stages/reorder', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_ids })
		});
		if (!res.ok) {
			if (res.status === 409) toast.error('Your stage list changed. Refreshing…');
			else toast.error('Could not save the new order.');
			await load();
		}
	}

	// --- Inline chips (probability / stale_after_days) ---
	let editingChip = $state<{ id: string; field: 'probability' | 'stale_after_days' | 'default_follow_up_days' } | null>(null);
	let chipDraft = $state('');
	const dragDisabled = $derived(editingChip !== null);

	function startChip(id: string, field: 'probability' | 'stale_after_days' | 'default_follow_up_days', current: number | null) {
		editingChip = { id, field };
		chipDraft = current === null ? '' : String(current);
	}

	async function commitChip() {
		if (!editingChip) return;
		const { id, field } = editingChip;
		const stage = stages.find((s) => s.id === id);
		editingChip = null;
		if (!stage) return;

		const raw = chipDraft.trim();
		let value: number | null;
		if (raw === '') {
			value = null;
		} else {
			const n = Number(raw);
			if (!Number.isInteger(n)) {
				toast.error('Enter a whole number.');
				return;
			}
			value = n;
		}
		if (value === stage[field]) return;
		if (field === 'probability' && value !== null && (value < 0 || value > 100)) {
			toast.error('Probability must be between 0 and 100.');
			return;
		}
		if (field === 'stale_after_days' && value !== null && (value < 1 || value > 365)) {
			toast.error('Stale-after days must be between 1 and 365.');
			return;
		}
		if (field === 'default_follow_up_days' && value !== null && (value < 1 || value > 365)) {
			toast.error('Follow-up days must be between 1 and 365.');
			return;
		}
		await patchStage(id, { [field]: value });
	}

	function onChipKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			editingChip = null;
		}
	}

	// Optimistic PATCH with revert-on-failure.
	async function patchStage(id: string, patch: Record<string, unknown>): Promise<boolean> {
		const idx = stages.findIndex((s) => s.id === id);
		if (idx === -1) return false;
		const prev = stages[idx];
		stages[idx] = { ...prev, ...patch } as Stage;

		const res = await fetch(`/api/pipeline/stages/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		});
		const json = (await res.json().catch(() => ({}))) as {
			data?: Record<string, unknown>;
			error?: string;
		};
		if (!res.ok || !json.data) {
			stages[idx] = prev;
			toast.error('Update failed', { description: json.error });
			return false;
		}
		stages[idx] = toStage(json.data);
		return true;
	}

	// --- Edit sheet ---
	let editOpen = $state(false);
	let editTarget = $state<Stage | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let editDescription = $state('');
	let editNameError = $state('');
	let editSaving = $state(false);

	function openEdit(stage: Stage) {
		editTarget = stage;
		editName = stage.name;
		editColor = stage.color;
		editDescription = stage.description ?? '';
		editNameError = '';
		editOpen = true;
	}

	async function saveEdit() {
		if (!editTarget || editSaving) return;
		const name = editName.trim();
		if (!name) {
			editNameError = 'Stage name is required.';
			return;
		}
		editSaving = true;
		editNameError = '';
		try {
			const res = await fetch(`/api/pipeline/stages/${editTarget.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, color: editColor, description: editDescription.trim() })
			});
			const json = (await res.json().catch(() => ({}))) as {
				data?: Record<string, unknown>;
				error?: string;
				field_errors?: { name?: string };
			};
			if (!res.ok || !json.data) {
				if (json.field_errors?.name) editNameError = json.field_errors.name;
				else toast.error('Could not save', { description: json.error });
				return;
			}
			const idx = stages.findIndex((s) => s.id === editTarget!.id);
			if (idx !== -1) stages[idx] = toStage(json.data);
			editOpen = false;
			toast.success('Stage updated');
		} finally {
			editSaving = false;
		}
	}

	async function makeDefault() {
		if (!editTarget || editTarget.is_default) return;
		const id = editTarget.id;
		const ok = await patchStage(id, { is_default: true });
		if (ok) {
			stages = stages.map((s) => ({ ...s, is_default: s.id === id }));
			toast.success('Default stage updated');
			editOpen = false;
		}
	}

	// --- Create sheet ---
	let createOpen = $state(false);
	let newName = $state('');
	let newColor = $state(COLOR_PRESETS[0]);
	let newDescription = $state('');
	let newProbability = $state('');
	let newStale = $state('');
	let newFollowUpDays = $state('');
	let newNameError = $state('');
	let creating = $state(false);

	function openCreate() {
		newName = '';
		newColor = COLOR_PRESETS[0];
		newDescription = '';
		newProbability = '';
		newStale = '';
		newFollowUpDays = '';
		newNameError = '';
		createOpen = true;
	}

	async function createStage() {
		if (creating) return;
		const name = newName.trim();
		if (!name) {
			newNameError = 'Stage name is required.';
			return;
		}
		creating = true;
		newNameError = '';
		try {
			const body: Record<string, unknown> = { name, color: newColor };
			if (newDescription.trim()) body.description = newDescription.trim();
			if (newProbability.trim()) body.probability = Number(newProbability);
			if (newStale.trim()) body.stale_after_days = Number(newStale);
			if (newFollowUpDays.trim()) body.default_follow_up_days = Number(newFollowUpDays);

			const res = await fetch('/api/pipeline/stages', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const json = (await res.json().catch(() => ({}))) as {
				data?: Record<string, unknown>;
				error?: string;
				field_errors?: { name?: string };
			};
			if (!res.ok || !json.data) {
				if (json.field_errors?.name) newNameError = json.field_errors.name;
				else toast.error('Could not create stage', { description: json.error });
				return;
			}
			stages = [...stages, toStage(json.data)];
			createOpen = false;
			toast.success('Stage added');
		} finally {
			creating = false;
		}
	}

	// --- Delete flow ---
	let deleteTarget = $state<Stage | null>(null);
	let confirmDeleteOpen = $state(false);
	let moveSheetOpen = $state(false);
	let deleteCount = $state(0);
	let moveToId = $state('');
	let deleting = $state(false);

	const moveDestinations = $derived(
		deleteTarget ? stages.filter((s) => s.id !== deleteTarget!.id) : []
	);

	async function startDelete(stage: Stage) {
		if (stages.length <= 1) {
			toast.error('You must keep at least one pipeline stage.');
			return;
		}
		const res = await fetch(`/api/pipeline/stages/${stage.id}/deal-count`);
		const json = (await res.json().catch(() => ({}))) as { data?: { count: number } };
		const count = json.data?.count ?? 0;

		deleteTarget = stage;
		deleteCount = count;
		if (count === 0) {
			confirmDeleteOpen = true;
		} else {
			// Pre-select the nearest stage by current order (the one just below, else just above).
			const idx = stages.findIndex((s) => s.id === stage.id);
			const nearest = stages[idx + 1] ?? stages[idx - 1];
			moveToId = nearest?.id ?? '';
			moveSheetOpen = true;
		}
	}

	async function performDelete(moveTo: string | null) {
		if (!deleteTarget || deleting) return;
		deleting = true;
		try {
			const id = deleteTarget.id;
			const url = moveTo
				? `/api/pipeline/stages/${id}?move_to=${moveTo}`
				: `/api/pipeline/stages/${id}`;
			const res = await fetch(url, { method: 'DELETE' });
			const json = (await res.json().catch(() => ({}))) as {
				data?: { moved: number; new_default_stage_id: string | null };
				error?: string;
			};
			if (!res.ok || !json.data) {
				toast.error('Could not delete stage', { description: json.error });
				return;
			}
			const newDefault = json.data.new_default_stage_id;
			stages = stages
				.filter((s) => s.id !== id)
				.map((s) => (newDefault && s.id === newDefault ? { ...s, is_default: true } : s));
			moveSheetOpen = false;
			confirmDeleteOpen = false;
			toast.success(json.data.moved > 0 ? `Stage deleted, ${json.data.moved} moved` : 'Stage deleted');
		} finally {
			deleting = false;
		}
	}

	// Heavy pop-ups load only when first opened so the stage list paints instantly
	// on click. One BottomSheet chunk serves the edit / create / move sheets.
	let BottomSheet = $state<
		typeof import('$lib/components/shared/BottomSheet.svelte').default | null
	>(null);
	$effect(() => {
		if (BottomSheet || !(editOpen || createOpen || moveSheetOpen)) return;
		void import('$lib/components/shared/BottomSheet.svelte').then((m) => {
			BottomSheet = m.default;
		});
	});

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (ConfirmDialog || !confirmDeleteOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});
</script>

<svelte:head><title>Pipeline Stages — Settings</title></svelte:head>

<PageWrapper title="Pipeline Stages" subtitle="Customize your pipeline columns" back="/settings">
	<div class="mx-auto flex max-w-2xl flex-col gap-4">
		{#if canManage && behaviorLoaded}
			<section class="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div>
					<h2 class="text-sm font-semibold text-foreground">Pipeline behavior</h2>
					<p class="mt-0.5 text-xs text-muted-foreground">
						How deals are won and when quiet leads get flagged.
					</p>
				</div>

				<!-- Won trigger -->
				<div class="flex flex-col gap-2">
					<span class="text-sm font-medium text-foreground">When is a deal "Won"?</span>
					<div class="flex flex-col gap-2">
						{#each [{ value: 'quote_acceptance', label: 'On quote acceptance', hint: 'The deal wins the moment the client accepts the quote. (Default)' }, { value: 'deposit_paid', label: 'On deposit paid', hint: 'The deal stays in Quoted until the deposit is paid. Quotes with no deposit still win on acceptance.' }] as opt (opt.value)}
							<label
								class={cn(
									'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
									wonTrigger === opt.value
										? 'border-primary/50 bg-primary/5'
										: 'border-border/60 bg-background hover:border-border'
								)}
							>
								<input
									type="radio"
									class="mt-0.5 accent-primary"
									value={opt.value}
									checked={wonTrigger === opt.value}
									disabled={savingBehavior}
									onchange={() => saveBehavior({ won_trigger: opt.value as WonTrigger })}
								/>
								<span class="flex flex-col">
									<span class="text-sm font-medium text-foreground">{opt.label}</span>
									<span class="text-xs text-muted-foreground">{opt.hint}</span>
								</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- Ghost-lead suggestion -->
				<div class="flex flex-col gap-2">
					<span class="text-sm font-medium text-foreground">Ghost-lead suggestion</span>
					<p class="text-xs text-muted-foreground">
						Suggest marking an open deal as Lost after it's been quiet this long. It's only a
						nudge — nothing is closed automatically.
					</p>
					<div class="flex flex-wrap gap-2">
						{#each GHOST_DAY_OPTIONS as days (days)}
							<button
								type="button"
								disabled={savingBehavior}
								class={cn(
									'inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium tabular-nums transition-colors disabled:opacity-50',
									ghostLeadDays === days
										? 'border-primary/50 bg-primary/10 text-primary'
										: 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
								)}
								onclick={() => saveBehavior({ ghost_lead_days: days })}
							>
								{days} days
							</button>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		{#if !canManage}
			<EmptyState
				icon={Lock}
				title="No access"
				description="You don't have permission to manage pipeline stages. Ask an admin to enable it for you."
			/>
		{:else if loading}
			<SkeletonLoader lines={4} height="64px" label="Loading stages" />
		{:else if stages.length === 0}
			<EmptyState
				icon={Columns3}
				title="No stages yet"
				description="Add your first pipeline stage to start tracking deals."
				actionLabel="Add stage"
				onAction={openCreate}
			/>
		{:else}
			<p class="px-1 text-xs text-muted-foreground">
				Drag to reorder. Tap the % or day chips to edit inline.
			</p>

			<ul
				class="flex flex-col gap-2"
				use:lazyDndzone={{
					items: stages,
					type: 'stage',
					flipDurationMs: flipDuration,
					dragDisabled,
					dropTargetStyle: {},
					dropTargetClasses: ['ring-2', 'ring-primary/40', 'rounded-xl']
				}}
				onconsider={handleConsider}
				onfinalize={handleFinalize}
			>
				{#each stages as stage (stage.id)}
					<li
						animate:flip={{ duration: flipDuration }}
						class="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-card"
					>
						<GripVertical class="h-5 w-5 shrink-0 cursor-grab text-muted-foreground/50" />
						<span
							class="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/5"
							style:background-color={stage.color}
							aria-hidden="true"
						></span>

						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<p class="truncate text-sm font-semibold text-foreground">{stage.name}</p>
								{#if stage.is_default}
									<span
										class="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
									>
										<Star class="h-2.5 w-2.5" />
										Default
									</span>
								{/if}
							</div>
							{#if stage.description}
								<p class="mt-0.5 truncate text-xs text-muted-foreground">{stage.description}</p>
							{/if}

							<div class="mt-2 flex flex-wrap items-center gap-2">
								{@render chip(stage, 'probability')}
								{@render chip(stage, 'stale_after_days')}
								{@render chip(stage, 'default_follow_up_days')}
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								class="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
								aria-label="Edit stage"
								onclick={() => openEdit(stage)}
							>
								<Pencil class="h-4 w-4" />
							</button>
							<button
								type="button"
								class="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Delete stage"
								disabled={stages.length <= 1}
								onclick={() => startDelete(stage)}
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</li>
				{/each}
			</ul>

			<button
				type="button"
				class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-background text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
				onclick={openCreate}
			>
				<Plus class="h-4 w-4" />
				Add stage
			</button>
		{/if}
	</div>
</PageWrapper>

{#snippet chip(stage: Stage, field: 'probability' | 'stale_after_days' | 'default_follow_up_days')}
	{@const active = editingChip?.id === stage.id && editingChip?.field === field}
	{@const value = stage[field]}
	{@const label = field === 'probability' ? '%' : field === 'stale_after_days' ? 'd stale' : 'd follow-up'}
	{#if active}
		<input
			type="number"
			inputmode="numeric"
			class="h-7 w-20 rounded-md border border-primary/50 bg-background px-2 text-xs tabular-nums shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
			bind:value={chipDraft}
			use:autofocus
			onblur={commitChip}
			onkeydown={onChipKey}
		/>
	{:else}
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
			onclick={() => startChip(stage.id, field, value)}
		>
			<span class="font-semibold text-foreground">{value === null ? '—' : value}</span>
			{label}
		</button>
	{/if}
{/snippet}

<!-- Edit sheet -->
{#if BottomSheet}
<BottomSheet bind:open={editOpen} title="Edit stage">
	{#if editTarget}
		<div class="mt-4 flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-foreground">Name <span class="text-destructive">*</span></span>
				<Input
					bind:value={editName}
					maxlength={60}
					class="h-10 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
				/>
				{#if editNameError}
					<p class="text-xs text-destructive">{editNameError}</p>
				{/if}
			</div>

			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-foreground">Color</span>
				{@render swatches(editColor, (c) => (editColor = c))}
			</div>

			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-foreground">Description</span>
				<Textarea
					bind:value={editDescription}
					rows={2}
					maxlength={200}
					placeholder="What happens in this stage?"
					class="border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
				/>
			</div>

			<div class="flex items-center justify-between gap-2 pt-1">
				{#if editTarget.is_default}
					<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<Star class="h-3.5 w-3.5 text-primary" />
						Default stage
					</span>
				{:else}
					<Button variant="outline" size="sm" class="gap-1.5" onclick={makeDefault}>
						<Star class="h-3.5 w-3.5" />
						Make default
					</Button>
				{/if}
				<Button class="gap-1.5" disabled={editSaving} onclick={saveEdit}>
					{editSaving ? 'Saving…' : 'Save'}
				</Button>
			</div>
		</div>
	{/if}
</BottomSheet>
{/if}

<!-- Create sheet -->
{#if BottomSheet}
<BottomSheet bind:open={createOpen} title="Add stage">
	<div class="mt-4 flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-foreground">Name <span class="text-destructive">*</span></span>
			<Input
				bind:value={newName}
				maxlength={60}
				placeholder="e.g. Negotiation"
				class="h-10 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
			/>
			{#if newNameError}
				<p class="text-xs text-destructive">{newNameError}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-foreground">Color</span>
			{@render swatches(newColor, (c) => (newColor = c))}
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-foreground">Description</span>
			<Textarea
				bind:value={newDescription}
				rows={2}
				maxlength={200}
				placeholder="What happens in this stage?"
				class="border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
			/>
		</div>

		<div class="flex gap-3">
			<div class="flex flex-1 flex-col gap-1.5">
				<span class="text-sm font-medium text-foreground">Win probability %</span>
				<Input
					bind:value={newProbability}
					type="number"
					inputmode="numeric"
					min={0}
					max={100}
					placeholder="Optional"
					class="h-10 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
				/>
			</div>
			<div class="flex flex-1 flex-col gap-1.5">
				<span class="text-sm font-medium text-foreground">Stale after (days)</span>
				<Input
					bind:value={newStale}
					type="number"
					inputmode="numeric"
					min={1}
					max={365}
					placeholder="Optional"
					class="h-10 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
				/>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-foreground">Auto follow-up after (days)</span>
			<Input
				bind:value={newFollowUpDays}
				type="number"
				inputmode="numeric"
				min={1}
				max={365}
				placeholder="Optional — auto-schedules reminder when a deal enters this stage"
				class="h-10 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
			/>
		</div>

		<Button class="gap-1.5" disabled={creating} onclick={createStage}>
			<Plus class="h-4 w-4" />
			{creating ? 'Adding…' : 'Add stage'}
		</Button>
	</div>
</BottomSheet>
{/if}

<!-- Delete with move sheet (stage has open deals) -->
{#if BottomSheet}
<BottomSheet
	bind:open={moveSheetOpen}
	title="Move deals & delete stage"
	description={deleteTarget
		? `"${deleteTarget.name}" has ${deleteCount} open deal${deleteCount === 1 ? '' : 's'}. Choose where to move ${deleteCount === 1 ? 'it' : 'them'}.`
		: ''}
>
	<div class="mt-4 flex flex-col gap-2">
		{#each moveDestinations as dest (dest.id)}
			<label
				class={cn(
					'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
					moveToId === dest.id
						? 'border-primary/50 bg-primary/5'
						: 'border-border/60 bg-background hover:border-border'
				)}
			>
				<input type="radio" class="accent-primary" value={dest.id} bind:group={moveToId} />
				<span
					class="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/5"
					style:background-color={dest.color}
					aria-hidden="true"
				></span>
				<span class="text-sm font-medium text-foreground">{dest.name}</span>
			</label>
		{/each}

		<Button
			variant="destructive"
			class="mt-2"
			disabled={!moveToId || deleting}
			onclick={() => performDelete(moveToId)}
		>
			{deleting ? 'Working…' : `Move ${deleteCount} deal${deleteCount === 1 ? '' : 's'} & delete stage`}
		</Button>
	</div>
</BottomSheet>
{/if}

<!-- Delete confirm (no open deals) -->
{#if ConfirmDialog}
	<ConfirmDialog
		bind:open={confirmDeleteOpen}
		title="Delete stage"
		description={deleteTarget ? `Delete "${deleteTarget.name}"? This can't be undone.` : ''}
		confirmLabel="Delete"
		variant="destructive"
		loading={deleting}
		onConfirm={() => performDelete(null)}
	/>
{/if}

{#snippet swatches(selected: string, onPick: (c: string) => void)}
	<div class="flex flex-wrap gap-2">
		{#each COLOR_PRESETS as c (c)}
			<button
				type="button"
				class={cn(
					'h-8 w-8 rounded-full ring-1 ring-black/5 transition-transform hover:scale-110',
					selected.toLowerCase() === c.toLowerCase() &&
						'ring-2 ring-foreground ring-offset-2 ring-offset-background'
				)}
				style:background-color={c}
				aria-label={`Color ${c}`}
				onclick={() => onPick(c)}
			></button>
		{/each}
	</div>
{/snippet}
