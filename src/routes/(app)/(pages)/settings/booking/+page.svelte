<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { toast } from '$lib/stores/toast.svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';

	type LinkRow = {
		id: string;
		slug: string;
		title: string;
		is_active: boolean;
		appointment_type: string;
		slot_duration_minutes: number;
		window_count: number;
		override_count: number;
	};

	const member = getMemberContext();
	const flags = getFeatureFlagsContext();
	const org = getOrgContext();

	let items = $state<LinkRow[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	const featureEnabled = $derived(flags().feature_online_booking);
	const isAdmin = $derived(member().role === 'admin');

	$effect(() => {
		if (!isAdmin) goto('/settings');
	});

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/booking-links');
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Failed to load booking links.';
				return;
			}
			items = body.data;
		} catch {
			errorMsg = 'Failed to load booking links.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (featureEnabled && isAdmin) void load();
		else loading = false;
	});

	async function copyUrl(slug: string) {
		const url = bookingPublicUrl(org().slug, slug);
		try {
			await navigator.clipboard.writeText(url);
			toast.success('Booking link copied');
		} catch {
			toast.error('Could not copy link');
		}
	}
</script>

<svelte:head><title>Booking Availability</title></svelte:head>

<PageWrapper
	title="Booking Availability"
	subtitle="Manage links customers use to book themselves"
	back="/settings"
>
	{#snippet actions()}
		{#if featureEnabled && isAdmin}
			<Button onclick={() => goto('/settings/booking/new')}>
				<i class="ri-add-line" aria-hidden="true"></i> New booking link
			</Button>
		{/if}
	{/snippet}

	<a href="/settings" class="book-back">
		<i class="ri-arrow-left-line" aria-hidden="true"></i> Back to settings
	</a>

	{#if !featureEnabled}
		<div class="book-locked">
			<div class="book-locked__icon"><i class="ri-lock-line" aria-hidden="true"></i></div>
			<h3 class="book-locked__title">Online booking is not enabled</h3>
			<p class="book-locked__text">
				This feature is not enabled for your account. Contact your agency to enable customer
				self-booking.
			</p>
		</div>
	{:else if loading}
		<SkeletonLoader lines={4} height="96px" label="Loading booking links" />
	{:else if errorMsg}
		<p class="book-error">{errorMsg}</p>
	{:else if items.length === 0}
		<EmptyState
			iconClass="ri-calendar-schedule-line"
			title="No booking links yet"
			description="Create your first booking link so customers can book themselves."
			actionLabel="New booking link"
			onAction={() => goto('/settings/booking/new')}
		/>
	{:else}
		<ul class="book-list">
			{#each items as link (link.id)}
				{@const url = bookingPublicUrl(org().slug, link.slug)}
				<li class="book-card">
					<div class="book-card__title-row">
						<h3 class="book-card__title">{link.title}</h3>
						<span
							class="book-card__badge book-card__badge--{link.is_active ? 'active' : 'inactive'}"
						>
							{link.is_active ? 'Active' : 'Inactive'}
						</span>
					</div>
					<p class="book-card__url">{url}</p>
					<p class="book-card__meta">
						{link.slot_duration_minutes} min · {link.window_count} weekly window{link.window_count ===
						1
							? ''
							: 's'}
						{#if link.override_count > 0}
							· {link.override_count} override{link.override_count === 1 ? '' : 's'}
						{/if}
					</p>
					<div class="book-card__actions">
						<Button variant="outline" size="sm" onclick={() => copyUrl(link.slug)}>
							<i class="ri-file-copy-line" aria-hidden="true"></i> Copy URL
						</Button>
						<Button variant="outline" size="sm" onclick={() => goto(`/settings/booking/${link.id}`)}>
							Edit <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageWrapper>
