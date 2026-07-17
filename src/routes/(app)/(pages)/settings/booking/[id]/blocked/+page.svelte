<script lang="ts">
	import { onMount } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';

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

	// Heavy pop-ups load only when the relevant action starts: the Calendar
	// (bits-ui) when the user opens the block-a-date form, the ConfirmDialog when
	// they click delete. Keeps the initial list parse light.
	let Calendar = $state<typeof import('$lib/components/ui/calendar').Calendar | null>(null);
	$effect(() => {
		if (Calendar || !showForm) return;
		void import('$lib/components/ui/calendar').then((m) => {
			Calendar = m.Calendar;
		});
	});

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (ConfirmDialog || !confirmOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

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

<div class="book-form">
	{#if !showForm}
		<div>
			<Button onclick={() => (showForm = true)}>
				<i class="ri-add-line" aria-hidden="true"></i> Block a date
			</Button>
		</div>
	{:else}
		<form class="book-ovform" onsubmit={submit}>
			<div class="field">
				<Label for="ov-date" class="field__label field__label--required">Date</Label>
				{#if Calendar}
					<Calendar bind:value={formDate} placeholder="Pick a date" min={today} />
				{/if}
				{#if fieldErrors.override_date}
					<p class="field__error">{fieldErrors.override_date}</p>
				{/if}
			</div>

			<div class="field">
				<Label class="field__label field__label--required">Type</Label>
				<div class="book-ovform__types">
					<label class="book-radio" class:book-radio--active={formBlocked}>
						<input
							type="radio"
							name="block-type"
							checked={formBlocked}
							onchange={() => (formBlocked = true)}
						/>
						Block all day
					</label>
					<label class="book-radio" class:book-radio--active={!formBlocked}>
						<input
							type="radio"
							name="block-type"
							checked={!formBlocked}
							onchange={() => (formBlocked = false)}
						/>
						Custom hours
					</label>
				</div>
			</div>

			{#if !formBlocked}
				<div class="field">
					<div class="book-ovform__times">
						<div class="field">
							<Label for="ov-start" class="field__label field__label--required">Start</Label>
							<input id="ov-start" type="time" bind:value={formStart} required class="book-time" />
						</div>
						<div class="field">
							<Label for="ov-end" class="field__label field__label--required">End</Label>
							<input id="ov-end" type="time" bind:value={formEnd} required class="book-time" />
						</div>
					</div>
					{#if fieldErrors.end_time}<p class="field__error">{fieldErrors.end_time}</p>{/if}
					{#if fieldErrors.start_time}<p class="field__error">{fieldErrors.start_time}</p>{/if}
				</div>
			{/if}

			<div class="field">
				<Label for="ov-reason" class="field__label">Reason (internal)</Label>
				<Input id="ov-reason" bind:value={formReason} maxlength={500} placeholder="Optional" />
			</div>

			<div class="book-ovform__actions">
				<Button
					variant="outline"
					onclick={() => {
						resetForm();
						showForm = false;
					}}
					disabled={creating}
				>
					Cancel
				</Button>
				<Button type="submit" loadingLabel="Saving…" successLabel="Added" loading={creating}>
					Add override
				</Button>
			</div>
		</form>
	{/if}

	{#if loading}
		<SkeletonLoader lines={3} height="64px" label="Loading overrides" />
	{:else if overrides.length === 0}
		<EmptyState
			iconClass="ri-calendar-close-line"
			title="No blocked dates"
			description="Add overrides for holidays, vacations, or one-off custom hours."
		/>
	{:else}
		<ul class="book-overrides">
			{#each overrides as o (o.id)}
				<li class="book-override">
					<div class="book-override__main">
						<p class="book-override__date">{formatDate(o.override_date)}</p>
						<p class="book-override__detail">
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
					<button
						type="button"
						class="book-iconbtn book-iconbtn--sm"
						onclick={() => askDelete(o.id)}
						aria-label="Delete override"
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
		bind:open={confirmOpen}
		title="Remove this override?"
		description="The date will return to the standard weekly availability."
		confirmLabel="Remove"
		variant="destructive"
		loading={deleting}
		onConfirm={doDelete}
	/>
{/if}
