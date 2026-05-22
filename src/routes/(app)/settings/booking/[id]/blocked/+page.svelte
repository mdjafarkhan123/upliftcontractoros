<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { CalendarOff, Plus, Trash2 } from '@lucide/svelte';

	let { data }: { data: { id: string } } = $props();

	type Override = {
		id: string;
		override_date: string;
		is_blocked: boolean;
		start_time: string | null;
		end_time: string | null;
		reason: string | null;
	};

	let overrides = $state<Override[]>([]);
	let loading = $state(true);
	let creating = $state(false);
	let showForm = $state(false);

	let formDate = $state('');
	let formBlocked = $state(true);
	let formStart = $state('08:00');
	let formEnd = $state('17:00');
	let formReason = $state('');
	let fieldErrors = $state<Record<string, string>>({});

	let confirmOpen = $state(false);
	let pendingDelete = $state<string | null>(null);
	let deleting = $state(false);

	const today = new Date().toISOString().slice(0, 10);

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/booking-links/${data.id}/availability/overrides`);
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to load.');
				return;
			}
			overrides = body.data;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function resetForm() {
		formDate = '';
		formBlocked = true;
		formStart = '08:00';
		formEnd = '17:00';
		formReason = '';
		fieldErrors = {};
	}

	async function submit(e: Event) {
		e.preventDefault();
		if (creating) return;
		fieldErrors = {};
		creating = true;
		try {
			const payload: Record<string, unknown> = {
				override_date: formDate,
				is_blocked: formBlocked,
				reason: formReason.trim() || null
			};
			if (!formBlocked) {
				payload.start_time = formStart;
				payload.end_time = formEnd;
			}
			const res = await fetch(`/api/booking-links/${data.id}/availability/overrides`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to save.');
				return;
			}
			overrides = [...overrides, body.data].sort((a, b) =>
				a.override_date.localeCompare(b.override_date)
			);
			resetForm();
			showForm = false;
			toast.success('Override added');
		} finally {
			creating = false;
		}
	}

	function askDelete(id: string) {
		pendingDelete = id;
		confirmOpen = true;
	}

	async function doDelete() {
		if (!pendingDelete) return;
		deleting = true;
		try {
			const res = await fetch(
				`/api/booking-links/${data.id}/availability/overrides/${pendingDelete}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to delete.');
				return;
			}
			overrides = overrides.filter((o) => o.id !== pendingDelete);
			pendingDelete = null;
			toast.success('Override removed');
		} finally {
			deleting = false;
		}
	}

	function formatDate(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(t: string | null): string {
		if (!t) return '';
		return t.slice(0, 5);
	}
</script>

<svelte:head><title>Blocked Dates</title></svelte:head>

<div class="space-y-4">
	{#if !showForm}
		<Button onclick={() => (showForm = true)}>
			<Plus class="h-4 w-4" /> Block a date
		</Button>
	{:else}
		<form
			class="space-y-4 rounded-xl border border-border bg-card p-4"
			onsubmit={submit}
		>
			<div class="space-y-1.5">
				<Label for="ov-date">Date <span class="text-destructive">*</span></Label>
				<Input id="ov-date" type="date" bind:value={formDate} min={today} required />
				{#if fieldErrors.override_date}
					<p class="text-xs text-destructive">{fieldErrors.override_date}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label>Type <span class="text-destructive">*</span></Label>
				<div class="grid grid-cols-2 gap-2">
					<label
						class={[
							'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm',
							formBlocked ? 'border-primary bg-primary/5' : 'border-border'
						].join(' ')}
					>
						<input type="radio" name="block-type" checked={formBlocked} onchange={() => (formBlocked = true)} />
						Block all day
					</label>
					<label
						class={[
							'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm',
							!formBlocked ? 'border-primary bg-primary/5' : 'border-border'
						].join(' ')}
					>
						<input type="radio" name="block-type" checked={!formBlocked} onchange={() => (formBlocked = false)} />
						Custom hours
					</label>
				</div>
			</div>

			{#if !formBlocked}
				<div class="grid grid-cols-2 gap-2">
					<div class="space-y-1.5">
						<Label for="ov-start">Start <span class="text-destructive">*</span></Label>
						<input
							id="ov-start"
							type="time"
							bind:value={formStart}
							required
							class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="ov-end">End <span class="text-destructive">*</span></Label>
						<input
							id="ov-end"
							type="time"
							bind:value={formEnd}
							required
							class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
						/>
					</div>
					{#if fieldErrors.end_time}
						<p class="col-span-2 text-xs text-destructive">{fieldErrors.end_time}</p>
					{/if}
					{#if fieldErrors.start_time}
						<p class="col-span-2 text-xs text-destructive">{fieldErrors.start_time}</p>
					{/if}
				</div>
			{/if}

			<div class="space-y-1.5">
				<Label for="ov-reason">Reason (internal)</Label>
				<Input id="ov-reason" bind:value={formReason} maxlength={500} placeholder="Optional" />
			</div>

			<div class="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						resetForm();
						showForm = false;
					}}
					disabled={creating}
				>
					Cancel
				</Button>
				<JetEngineButton
					type="submit"
					label="Add override"
					loadingLabel="Saving…"
					successLabel="Added"
					state={creating ? 'loading' : 'idle'}
				/>
			</div>
		</form>
	{/if}

	{#if loading}
		<SkeletonLoader lines={3} height="64px" label="Loading overrides" />
	{:else if overrides.length === 0}
		<EmptyState
			icon={CalendarOff}
			title="No blocked dates"
			description="Add overrides for holidays, vacations, or one-off custom hours."
		/>
	{:else}
		<ul class="grid gap-2">
			{#each overrides as o (o.id)}
				<li class="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold text-foreground">{formatDate(o.override_date)}</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							{#if o.is_blocked}
								Blocked all day
							{:else}
								Custom: {formatTime(o.start_time)} – {formatTime(o.end_time)}
							{/if}
							{#if o.reason}
								· {o.reason}
							{/if}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						class="h-9 w-9"
						onclick={() => askDelete(o.id)}
						aria-label="Delete override"
					>
						<Trash2 class="h-4 w-4 text-destructive" />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Remove this override?"
	description="The date will return to the standard weekly availability."
	confirmLabel="Remove"
	variant="destructive"
	loading={deleting}
	onConfirm={doDelete}
/>
