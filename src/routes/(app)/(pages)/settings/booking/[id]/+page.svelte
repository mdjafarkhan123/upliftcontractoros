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

	let { data }: { data: { id: string } } = $props();

	const org = getOrgContext();

	type BookingLink = {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		appointment_type: 'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other';
		slot_duration_minutes: number;
		buffer_minutes: number;
		min_advance_hours: number;
		max_future_days: number;
		is_active: boolean;
	};

	let link = $state<BookingLink | null>(null);
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

<svelte:head><title>{link?.title ?? 'Booking link'}</title></svelte:head>

{#if loading}
	<SkeletonLoader lines={6} height="64px" label="Loading" />
{:else if errorMsg || !link}
	<EmptyState title="Couldn't load booking link" description={errorMsg ?? 'Not found.'} />
{:else}
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
			<Label for="type" class="field__label field__label--required">Appointment type</Label>
			<Select.Root bind:value={link.appointment_type}>
				<Select.Trigger>
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="estimate">Estimate</Select.Item>
					<Select.Item value="job_start">Job start</Select.Item>
					<Select.Item value="follow_up">Follow up</Select.Item>
					<Select.Item value="inspection">Inspection</Select.Item>
					<Select.Item value="other">Other</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>

		<div class="book-grid book-grid--two">
			<div class="field">
				<Label for="slot" class="field__label field__label--required">Slot duration</Label>
				<Select.Root bind:value={link.slot_duration_minutes}>
					<Select.Trigger>
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={30}>30 min</Select.Item>
						<Select.Item value={45}>45 min</Select.Item>
						<Select.Item value={60}>60 min</Select.Item>
						<Select.Item value={90}>90 min</Select.Item>
						<Select.Item value={120}>120 min</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="field">
				<Label for="buf" class="field__label field__label--required">Buffer</Label>
				<Select.Root bind:value={link.buffer_minutes}>
					<Select.Trigger>
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={0}>None</Select.Item>
						<Select.Item value={15}>15 min</Select.Item>
						<Select.Item value={30}>30 min</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="field">
				<Label for="adv" class="field__label field__label--required">Min advance</Label>
				<Select.Root bind:value={link.min_advance_hours}>
					<Select.Trigger>
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={1}>1 hour</Select.Item>
						<Select.Item value={4}>4 hours</Select.Item>
						<Select.Item value={24}>24 hours</Select.Item>
						<Select.Item value={48}>48 hours</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="field">
				<Label for="hor" class="field__label field__label--required">Booking horizon</Label>
				<Select.Root bind:value={link.max_future_days}>
					<Select.Trigger>
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={14}>14 days</Select.Item>
						<Select.Item value={30}>30 days</Select.Item>
						<Select.Item value={60}>60 days</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<div class="book-active">
			<div>
				<p class="book-active__title">Link is {link.is_active ? 'active' : 'inactive'}</p>
				<p class="book-active__desc">
					{link.is_active ? 'Customers can book through this link.' : 'Public URL returns 404.'}
				</p>
			</div>
			<Switch bind:checked={link.is_active} />
		</div>

		<div class="book-actions book-actions--end">
			<Button
				type="submit"
				loadingLabel="Saving…"
				successLabel="Saved"
				loading={saving}
			>
				Save changes
			</Button>
		</div>
	</form>

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

	{#if ConfirmDialog}
		<ConfirmDialog
			bind:open={deleteOpen}
			title="Delete this booking link?"
			description="The public URL will stop working. Existing appointments are preserved."
			confirmLabel="Delete"
			variant="destructive"
			loading={deleting}
			onConfirm={doDelete}
		/>
	{/if}
{/if}
