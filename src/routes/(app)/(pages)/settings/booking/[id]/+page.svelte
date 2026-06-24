<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { toast } from '$lib/stores/toast.svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
	import { Copy, Trash2 } from '@lucide/svelte';

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
	<form class="space-y-6" onsubmit={save}>
		<div class="space-y-1.5">
			<Label for="public-url">Public URL</Label>
			<div class="flex gap-2">
				<Input id="public-url" value={publicUrl} readonly class="flex-1 font-mono text-xs" />
				<Button type="button" variant="outline" size="icon" onclick={copyUrl}>
					<Copy class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<div class="space-y-1.5">
			<Label for="slug-ro">URL slug</Label>
			<Input id="slug-ro" value={link.slug} readonly class="font-mono text-sm" />
			<p class="text-xs text-muted-foreground">URL cannot be changed after creation.</p>
		</div>

		<div class="space-y-1.5">
			<Label for="title">Title <span class="text-destructive">*</span></Label>
			<Input id="title" bind:value={link.title} required maxlength={120} />
			{#if fieldErrors.title}<p class="text-xs text-destructive">{fieldErrors.title}</p>{/if}
		</div>

		<div class="space-y-1.5">
			<Label for="desc">Description</Label>
			<Textarea
				id="desc"
				value={link.description ?? ''}
				oninput={(e) => (link!.description = (e.currentTarget as HTMLTextAreaElement).value)}
				maxlength={2000}
				rows={3}
			/>
		</div>

		<div class="space-y-1.5">
			<Label for="type">Appointment type <span class="text-destructive">*</span></Label>
			<Select.Root bind:value={link.appointment_type}>
				<Select.Trigger class="h-11 w-full">
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

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="space-y-1.5">
				<Label for="slot">Slot duration <span class="text-destructive">*</span></Label>
				<Select.Root bind:value={link.slot_duration_minutes}>
					<Select.Trigger class="h-11 w-full">
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
			<div class="space-y-1.5">
				<Label for="buf">Buffer <span class="text-destructive">*</span></Label>
				<Select.Root bind:value={link.buffer_minutes}>
					<Select.Trigger class="h-11 w-full">
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={0}>None</Select.Item>
						<Select.Item value={15}>15 min</Select.Item>
						<Select.Item value={30}>30 min</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="space-y-1.5">
				<Label for="adv">Min advance <span class="text-destructive">*</span></Label>
				<Select.Root bind:value={link.min_advance_hours}>
					<Select.Trigger class="h-11 w-full">
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
			<div class="space-y-1.5">
				<Label for="hor">Booking horizon <span class="text-destructive">*</span></Label>
				<Select.Root bind:value={link.max_future_days}>
					<Select.Trigger class="h-11 w-full">
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

		<div class="flex items-center justify-between rounded-lg border border-border bg-card p-4">
			<div>
				<p class="text-sm font-semibold text-foreground">
					Link is {link.is_active ? 'active' : 'inactive'}
				</p>
				<p class="text-xs text-muted-foreground">
					{link.is_active ? 'Customers can book through this link.' : 'Public URL returns 404.'}
				</p>
			</div>
			<Switch bind:checked={link.is_active} />
		</div>

		<div class="flex justify-end gap-2 pt-2">
			<JetEngineButton
				type="submit"
				label="Save changes"
				loadingLabel="Saving…"
				successLabel="Saved"
				state={saving ? 'loading' : 'idle'}
			/>
		</div>
	</form>

	<section class="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
		<h3 class="text-sm font-semibold text-foreground">Danger zone</h3>
		<p class="mt-1 text-xs text-muted-foreground">
			Deleting removes this link permanently. The public URL will return 404.
		</p>
		<div class="mt-3">
			<Button variant="destructive" onclick={() => (deleteOpen = true)}>
				<Trash2 class="h-4 w-4" /> Delete booking link
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
