<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { ArrowLeft } from '@lucide/svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';

	const member = getMemberContext();
	const flags = getFeatureFlagsContext();
	const org = getOrgContext();

	$effect(() => {
		if (member().role !== 'admin' || !flags().feature_online_booking) goto('/settings/booking');
	});

	let title = $state('Book an Appointment');
	let slug = $state('');
	let description = $state('');
	let appointment_type = $state<'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other'>(
		'estimate'
	);
	let slot_duration_minutes = $state(60);
	let buffer_minutes = $state(0);
	let min_advance_hours = $state(4);
	let max_future_days = $state(30);

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
	const normalizedSlug = $derived(slug.trim().toLowerCase());
	const previewUrl = $derived(
		normalizedSlug ? bookingPublicUrl(org().slug, normalizedSlug) : `/book/${org().slug}/…`
	);

	function validateSlug() {
		if (!normalizedSlug) {
			fieldErrors = { ...fieldErrors, slug: 'Slug is required.' };
		} else if (normalizedSlug.length < 3 || normalizedSlug.length > 60) {
			fieldErrors = { ...fieldErrors, slug: 'Slug must be 3–60 characters.' };
		} else if (!slugRegex.test(normalizedSlug)) {
			fieldErrors = { ...fieldErrors, slug: 'Use lowercase letters, numbers, and hyphens only.' };
		} else {
			const { slug: _drop, ...rest } = fieldErrors;
			fieldErrors = rest;
		}
	}

	async function save(e: Event) {
		e.preventDefault();
		if (saving) return;
		errorMsg = null;
		fieldErrors = {};
		saving = true;
		try {
			const res = await fetch('/api/booking-links', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					slug: normalizedSlug,
					description: description.trim() || null,
					appointment_type,
					slot_duration_minutes,
					buffer_minutes,
					min_advance_hours,
					max_future_days
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				errorMsg = body.error ?? 'Failed to create booking link.';
				return;
			}
			await goto(`/settings/booking/${body.data.id}/availability`);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New booking link</title></svelte:head>

<PageWrapper title="New booking link" subtitle="Configure how customers book this link">
	<Button variant="ghost" href="/settings/booking" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back
	</Button>

	<form class="max-w-lg space-y-6" onsubmit={save}>
		<div class="space-y-1.5">
			<Label for="title">Title <span class="text-destructive">*</span></Label>
			<Input id="title" bind:value={title} required maxlength={120} />
			<p class="text-xs text-muted-foreground">Shown to customers on the booking page.</p>
			{#if fieldErrors.title}
				<p class="text-xs text-destructive">{fieldErrors.title}</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<Label for="slug">URL slug <span class="text-destructive">*</span></Label>
			<Input
				id="slug"
				bind:value={slug}
				required
				maxlength={60}
				placeholder="estimate"
				onblur={validateSlug}
			/>
			<p class="text-xs text-muted-foreground break-all">{previewUrl}</p>
			{#if fieldErrors.slug}
				<p class="text-xs text-destructive">{fieldErrors.slug}</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<Label for="description">Description</Label>
			<Textarea id="description" bind:value={description} maxlength={2000} rows={3} />
		</div>

		<div class="space-y-1.5">
			<Label for="appointment_type">Appointment type <span class="text-destructive">*</span></Label>
			<select
				id="appointment_type"
				class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
				bind:value={appointment_type}
			>
				<option value="estimate">Estimate</option>
				<option value="job_start">Job start</option>
				<option value="follow_up">Follow up</option>
				<option value="inspection">Inspection</option>
				<option value="other">Other</option>
			</select>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="space-y-1.5">
				<Label for="slot">Slot duration <span class="text-destructive">*</span></Label>
				<select
					id="slot"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
					bind:value={slot_duration_minutes}
				>
					<option value={30}>30 min</option>
					<option value={45}>45 min</option>
					<option value={60}>60 min</option>
					<option value={90}>90 min</option>
					<option value={120}>120 min</option>
				</select>
			</div>

			<div class="space-y-1.5">
				<Label for="buffer">Buffer between bookings <span class="text-destructive">*</span></Label>
				<select
					id="buffer"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
					bind:value={buffer_minutes}
				>
					<option value={0}>None</option>
					<option value={15}>15 min</option>
					<option value={30}>30 min</option>
				</select>
			</div>

			<div class="space-y-1.5">
				<Label for="advance">Minimum advance notice <span class="text-destructive">*</span></Label>
				<select
					id="advance"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
					bind:value={min_advance_hours}
				>
					<option value={1}>1 hour</option>
					<option value={4}>4 hours</option>
					<option value={24}>24 hours</option>
					<option value={48}>48 hours</option>
				</select>
			</div>

			<div class="space-y-1.5">
				<Label for="horizon">Booking horizon <span class="text-destructive">*</span></Label>
				<select
					id="horizon"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
					bind:value={max_future_days}
				>
					<option value={14}>14 days</option>
					<option value={30}>30 days</option>
					<option value={60}>60 days</option>
				</select>
			</div>
		</div>

		{#if errorMsg}
			<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
				{errorMsg}
			</div>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" type="button" onclick={() => goto('/settings/booking')} disabled={saving}>
				Cancel
			</Button>
			<JetEngineButton
				type="submit"
				label="Create link"
				loadingLabel="Creating…"
				successLabel="Created"
				state={saving ? 'loading' : 'idle'}
			/>
		</div>
	</form>
</PageWrapper>
