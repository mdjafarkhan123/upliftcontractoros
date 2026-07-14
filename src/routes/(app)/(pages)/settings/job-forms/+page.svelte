<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	type TemplateRow = {
		id: string;
		name: string;
		description: string | null;
		field_count: number;
		created_by_name: string | null;
		updated_at: string;
	};

	let items = $state<TemplateRow[]>([]);
	let loading = $state(true);

	let deleteTarget = $state<TemplateRow | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/job-form-templates');
			if (!res.ok) {
				toast.error('Could not load job forms.');
				return;
			}
			const body = (await res.json()) as { data: { items: TemplateRow[] } };
			items = body.data.items;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (ConfirmDialog || !deleteOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	async function remove(id: string) {
		deleting = true;
		try {
			const res = await fetch(`/api/job-form-templates/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Delete failed');
				return;
			}
			items = items.filter((t) => t.id !== id);
			toast.success('Form deleted');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
</script>

<svelte:head><title>Job Forms — Settings</title></svelte:head>

<PageWrapper
	title="Job Forms"
	subtitle="Reusable checklists & inspection forms your crew fills out in the field"
	back="/settings"
>
	<div class="job-forms">
		{#if loading}
			<SkeletonLoader lines={3} height="64px" label="Loading job forms" />
		{:else if items.length === 0}
			<EmptyState
				iconClass="ri-survey-line"
				title="No job forms yet"
				description="Build an inspection or completion checklist once, then attach it to any job."
				actionLabel="New form"
				onAction={() => goto(resolve('/settings/job-forms/new'))}
			/>
		{:else}
			<div class="job-forms__toolbar">
				<Button href={resolve('/settings/job-forms/new')}>
					<i class="ri-add-line" aria-hidden="true"></i>
					New form
				</Button>
			</div>
			<ul class="job-forms__list">
				{#each items as t (t.id)}
					<li class="job-forms__card">
						<a
							class="job-forms__card-link"
							href={resolve(`/settings/job-forms/${t.id}`)}
						>
							<span class="job-forms__icon"><i class="ri-survey-line" aria-hidden="true"></i></span>
							<span class="job-forms__body">
								<span class="job-forms__name">{t.name}</span>
								{#if t.description}<span class="job-forms__desc">{t.description}</span>{/if}
								<span class="job-forms__meta">
									{t.field_count}
									{t.field_count === 1 ? 'field' : 'fields'} · Updated {fmtDate(t.updated_at)}
								</span>
							</span>
							<i class="job-forms__chevron ri-arrow-right-s-line" aria-hidden="true"></i>
						</a>
						<button
							type="button"
							class="job-forms__delete"
							aria-label="Delete form"
							onclick={() => {
								deleteTarget = t;
								deleteOpen = true;
							}}
						>
							<i class="ri-delete-bin-line" aria-hidden="true"></i>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if ConfirmDialog}
		<ConfirmDialog
			bind:open={deleteOpen}
			title="Delete job form"
			description={deleteTarget ? `Delete "${deleteTarget.name}"? This can't be undone.` : ''}
			confirmLabel="Delete"
			variant="destructive"
			loading={deleting}
			onConfirm={() => {
				if (deleteTarget) void remove(deleteTarget.id);
			}}
		/>
	{/if}
</PageWrapper>
