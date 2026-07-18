<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getOrgContext } from '$lib/context/org';
	import { toast } from '$lib/stores/toast.svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
	import CustomQuestionsPanel from '$lib/components/booking/CustomQuestionsPanel.svelte';
	import {
		REQUEST_STANDARD_FIELD_META,
		type BuilderFormField,
		type BuilderCustomField
	} from '$lib/types/bookingForms';

	let { data }: { data: { id: string } } = $props();

	const org = getOrgContext();

	type BookingLink = {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		form_type: 'booking' | 'request';
		requires_approval: boolean;
		appointment_type: 'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other';
		slot_duration_minutes: number;
		buffer_minutes: number;
		min_advance_hours: number;
		max_future_days: number;
		is_active: boolean;
		fields: BuilderFormField[];
		custom_fields: BuilderCustomField[];
	};

	let link = $state<BookingLink | null>(null);
	let fields = $state<BuilderFormField[]>([]);
	let customFields = $state<BuilderCustomField[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let saving = $state(false);
	let deleting = $state(false);
	let deleteOpen = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	const publicUrl = $derived(link ? bookingPublicUrl(org().slug, link.slug) : '');

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/booking-links/${data.id}`);
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Failed to load.';
				return;
			}
			link = body.data;
			fields = body.data.fields ?? [];
			customFields = body.data.custom_fields ?? [];
		} finally {
			loading = false;
		}
	}

	onMount(load);

	// Delete confirm dialog — only needed when the user opens the danger zone.
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (ConfirmDialog || !deleteOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(publicUrl);
			toast.success('URL copied');
		} catch {
			toast.error('Could not copy');
		}
	}

	// ── Field builder (request forms) ──────────────────────────────────────────
	// Optimistic per-toggle save: flip locally, persist, reconcile with the server's
	// authoritative list; revert on failure. `savingFieldId` tracks WHICH row is
	// in-flight so we can show a spinner on just that toggle (not the whole list).
	let savingFieldId = $state<string | null>(null);

	async function persistField(target: BuilderFormField, enabled: boolean, required: boolean) {
		if (!link) return;
		const prev = fields;
		fields = fields.map((f) => (f.id === target.id ? { ...f, enabled, required } : f));
		savingFieldId = target.id;
		try {
			const res = await fetch(`/api/booking-links/${link.id}/fields`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					fields: [{ id: target.id, is_enabled: enabled, is_required: required }]
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				fields = prev;
				toast.error(body.error ?? 'Could not update the form.');
				return;
			}
			if (body.data?.fields) fields = body.data.fields;
		} catch {
			fields = prev;
			toast.error('Could not update the form.');
		} finally {
			savingFieldId = null;
		}
	}

	function toggleEnabled(f: BuilderFormField, enabled: boolean) {
		// Hiding a field also clears its required flag (a hidden field can't be required).
		persistField(f, enabled, enabled ? f.required : false);
	}

	function toggleRequired(f: BuilderFormField, required: boolean) {
		persistField(f, f.enabled, required);
	}

	async function save(e: Event) {
		e.preventDefault();
		if (!link || saving) return;
		saving = true;
		fieldErrors = {};
		try {
			const res = await fetch(`/api/booking-links/${link.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: link.title.trim(),
					description: link.description?.trim() || null,
					form_type: link.form_type,
					requires_approval: link.requires_approval,
					appointment_type: link.appointment_type,
					slot_duration_minutes: link.slot_duration_minutes,
					buffer_minutes: link.buffer_minutes,
					min_advance_hours: link.min_advance_hours,
					max_future_days: link.max_future_days,
					is_active: link.is_active
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to save.');
				return;
			}
			link = { ...link, ...body.data };
			toast.success('Saved');
		} finally {
			saving = false;
		}
	}

	async function doDelete() {
		if (!link) return;
		deleting = true;
		try {
			const res = await fetch(`/api/booking-links/${link.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to delete.');
				return;
			}
			toast.success('Booking link deleted');
			await goto('/settings/booking');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{link?.title ?? 'Form'}</title></svelte:head>

{#snippet schedulingFields(l: BookingLink)}
	<div class="book-grid book-grid--two">
		<div class="field">
			<Label for="slot" class="field__label field__label--required">Slot duration</Label>
			<Select.Root bind:value={l.slot_duration_minutes}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value={30} label="30 min">30 min</Select.Item>
					<Select.Item value={45} label="45 min">45 min</Select.Item>
					<Select.Item value={60} label="60 min">60 min</Select.Item>
					<Select.Item value={90} label="90 min">90 min</Select.Item>
					<Select.Item value={120} label="120 min">120 min</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<div class="field">
			<Label for="buf" class="field__label field__label--required">Buffer</Label>
			<Select.Root bind:value={l.buffer_minutes}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value={0} label="None">None</Select.Item>
					<Select.Item value={15} label="15 min">15 min</Select.Item>
					<Select.Item value={30} label="30 min">30 min</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<div class="field">
			<Label for="adv" class="field__label field__label--required">Min advance</Label>
			<Select.Root bind:value={l.min_advance_hours}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value={1} label="1 hour">1 hour</Select.Item>
					<Select.Item value={4} label="4 hours">4 hours</Select.Item>
					<Select.Item value={24} label="24 hours">24 hours</Select.Item>
					<Select.Item value={48} label="48 hours">48 hours</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<div class="field">
			<Label for="hor" class="field__label field__label--required">Booking horizon</Label>
			<Select.Root bind:value={l.max_future_days}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value={14} label="14 days">14 days</Select.Item>
					<Select.Item value={30} label="30 days">30 days</Select.Item>
					<Select.Item value={60} label="60 days">60 days</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
	</div>
{/snippet}

{#snippet activeAndDanger(l: BookingLink)}
	<div class="book-active">
		<div>
			<p class="book-active__title">Form is {l.is_active ? 'active' : 'inactive'}</p>
			<p class="book-active__desc">
				{l.is_active ? 'Customers can use this form.' : 'Public URL returns 404.'}
			</p>
		</div>
		<Switch bind:checked={l.is_active} />
	</div>
{/snippet}

{#if loading}
	<SkeletonLoader lines={6} height="64px" label="Loading" />
{:else if errorMsg || !link}
	<EmptyState title="Couldn't load form" description={errorMsg ?? 'Not found.'} />
{:else if link.form_type === 'request'}
	<!-- ── Single-column request-form editor (same clean layout as the booking form) ── -->
	<form class="book-form" onsubmit={save}>
		<div class="field">
			<Label for="public-url" class="field__label">Public URL</Label>
			<div class="book-url">
				<Input id="public-url" value={publicUrl} readonly class="book-url__input" />
				<Button variant="outline" size="icon" onclick={copyUrl} aria-label="Copy URL">
					<i class="ri-file-copy-line" aria-hidden="true"></i>
				</Button>
			</div>
		</div>

		<div class="field">
			<Label for="slug-ro" class="field__label">URL slug</Label>
			<Input id="slug-ro" value={link.slug} readonly class="book-url__input" />
			<p class="field__hint">URL cannot be changed after creation.</p>
		</div>

		<div class="field">
			<Label for="title" class="field__label field__label--required">Form title</Label>
			<Input id="title" bind:value={link.title} required maxlength={120} />
			{#if fieldErrors.title}<p class="field__error">{fieldErrors.title}</p>{/if}
		</div>

		<div class="field">
			<Label for="desc" class="field__label">Description</Label>
			<Textarea
				id="desc"
				value={link.description ?? ''}
				oninput={(e) => (link!.description = (e.currentTarget as HTMLTextAreaElement).value)}
				maxlength={2000}
				rows={3}
			/>
		</div>

		<div class="field">
			<Label for="form_type" class="field__label field__label--required">Form type</Label>
			<Select.Root bind:value={link.form_type}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value="booking" label="Booking form"
						>Booking form — instant confirmed appointment</Select.Item
					>
					<Select.Item value="request" label="Request form"
						>Request form — client describes work, you approve first</Select.Item
					>
				</Select.Content>
			</Select.Root>
		</div>

		<div class="settings-toggle">
			<div class="settings-toggle__text">
				<span class="settings-toggle__label">Require my approval</span>
				<p class="settings-toggle__desc">
					New requests wait as “Needs approval” until you accept them. Turn off to auto-approve.
				</p>
			</div>
			<Switch bind:checked={link.requires_approval} />
		</div>

		{@render schedulingFields(link)}

		<!-- Which fields the client fills out (saved instantly, on their own) -->
		<section class="book-fields">
			<h3 class="book-fields__title">Form fields</h3>
			<p class="book-fields__hint">
				Choose which fields clients fill out. First name, last name, phone, and service details are
				always collected.
			</p>
			<ul class="fb-list">
				{#each fields as f (f.id)}
					{@const meta = REQUEST_STANDARD_FIELD_META[f.key]}
					<li class="fb-field {f.locked ? 'fb-field--locked' : ''}">
						<div class="fb-field__main">
							<span class="fb-field__label">{meta.label}</span>
							<span class="fb-field__desc">{meta.description}</span>
						</div>
						{#if f.locked}
							<span class="fb-field__always"
								><i class="ri-lock-line" aria-hidden="true"></i> Always shown</span
							>
						{:else}
							{@const rowSaving = savingFieldId === f.id}
							<div class="fb-field__controls">
								<i
									class="ri-loader-4-line fb-field__spinner {rowSaving
										? 'fb-field__spinner--on'
										: ''}"
									aria-hidden={!rowSaving}
									aria-label={rowSaving ? 'Saving' : undefined}
								></i>
								{#if meta.canRequire && f.enabled}
									<label class="fb-field__toggle">
										<span class="fb-field__toggle-label">Required</span>
										<Switch
											checked={f.required}
											onchange={(v: boolean) => toggleRequired(f, v)}
											disabled={rowSaving}
										/>
									</label>
								{/if}
								<label class="fb-field__toggle fb-field__toggle--show">
									<span class="fb-field__toggle-label">{f.enabled ? 'Shown' : 'Hidden'}</span>
									<Switch
										checked={f.enabled}
										onchange={(v: boolean) => toggleEnabled(f, v)}
										disabled={rowSaving}
									/>
								</label>
							</div>
						{/if}
					</li>
				{/each}
			</ul>

			<CustomQuestionsPanel
				linkId={link.id}
				fields={customFields}
				onChange={(next) => (customFields = next)}
			/>
		</section>

		{@render activeAndDanger(link)}

		<div class="book-actions book-actions--end">
			<Button type="submit" loadingLabel="Saving…" successLabel="Saved" loading={saving}>
				Save changes
			</Button>
		</div>

		<section class="book-danger">
			<h3 class="book-danger__title">Danger zone</h3>
			<p class="book-danger__text">
				Deleting removes this form permanently. The public URL will return 404.
			</p>
			<div class="book-danger__action">
				<Button variant="destructive" onclick={() => (deleteOpen = true)}>
					<i class="ri-delete-bin-line" aria-hidden="true"></i> Delete form
				</Button>
			</div>
		</section>
	</form>
{:else}
	<!-- ── Booking form (unchanged single-column editor) ── -->
	<form class="book-form" onsubmit={save}>
		<div class="field">
			<Label for="public-url" class="field__label">Public URL</Label>
			<div class="book-url">
				<Input id="public-url" value={publicUrl} readonly class="book-url__input" />
				<Button variant="outline" size="icon" onclick={copyUrl} aria-label="Copy URL">
					<i class="ri-file-copy-line" aria-hidden="true"></i>
				</Button>
			</div>
		</div>

		<div class="field">
			<Label for="slug-ro" class="field__label">URL slug</Label>
			<Input id="slug-ro" value={link.slug} readonly class="book-url__input" />
			<p class="field__hint">URL cannot be changed after creation.</p>
		</div>

		<div class="field">
			<Label for="title" class="field__label field__label--required">Title</Label>
			<Input id="title" bind:value={link.title} required maxlength={120} />
			{#if fieldErrors.title}<p class="field__error">{fieldErrors.title}</p>{/if}
		</div>

		<div class="field">
			<Label for="desc" class="field__label">Description</Label>
			<Textarea
				id="desc"
				value={link.description ?? ''}
				oninput={(e) => (link!.description = (e.currentTarget as HTMLTextAreaElement).value)}
				maxlength={2000}
				rows={3}
			/>
		</div>

		<div class="field">
			<Label for="form_type" class="field__label field__label--required">Form type</Label>
			<Select.Root bind:value={link.form_type}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value="booking" label="Booking form"
						>Booking form — instant confirmed appointment</Select.Item
					>
					<Select.Item value="request" label="Request form"
						>Request form — client describes work, you approve first</Select.Item
					>
				</Select.Content>
			</Select.Root>
		</div>

		<div class="field">
			<Label for="type" class="field__label field__label--required">Appointment type</Label>
			<Select.Root bind:value={link.appointment_type}>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value="estimate" label="Estimate">Estimate</Select.Item>
					<Select.Item value="job_start" label="Job start">Job start</Select.Item>
					<Select.Item value="follow_up" label="Follow up">Follow up</Select.Item>
					<Select.Item value="inspection" label="Inspection">Inspection</Select.Item>
					<Select.Item value="other" label="Other">Other</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>

		{@render schedulingFields(link)}
		{@render activeAndDanger(link)}

		<div class="book-actions book-actions--end">
			<Button type="submit" loadingLabel="Saving…" successLabel="Saved" loading={saving}>
				Save changes
			</Button>
		</div>

		<section class="book-danger">
			<h3 class="book-danger__title">Danger zone</h3>
			<p class="book-danger__text">
				Deleting removes this link permanently. The public URL will return 404.
			</p>
			<div class="book-danger__action">
				<Button variant="destructive" onclick={() => (deleteOpen = true)}>
					<i class="ri-delete-bin-line" aria-hidden="true"></i> Delete booking link
				</Button>
			</div>
		</section>
	</form>
{/if}

{#if ConfirmDialog}
	<ConfirmDialog
		bind:open={deleteOpen}
		title="Delete this form?"
		description="The public URL will stop working. Existing appointments are preserved."
		confirmLabel="Delete"
		variant="destructive"
		loading={deleting}
		onConfirm={doDelete}
	/>
{/if}
