<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { toast } from '$lib/stores/toast.svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
	import { CalendarClock, Plus, Copy, Lock, ChevronRight, ArrowLeft } from '@lucide/svelte';

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
				<Plus class="h-4 w-4" /> New booking link
			</Button>
		{/if}
	{/snippet}

	<Button variant="ghost" href="/settings" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to settings
	</Button>

	{#if !featureEnabled}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-12 text-center"
		>
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
			>
				<Lock class="h-6 w-6" />
			</div>
			<h3 class="text-base font-semibold text-foreground">Online booking is not enabled</h3>
			<p class="max-w-sm text-sm text-muted-foreground">
				This feature is not enabled for your account. Contact your agency to enable customer
				self-booking.
			</p>
		</div>
	{:else if loading}
		<SkeletonLoader lines={4} height="96px" label="Loading booking links" />
	{:else if errorMsg}
		<p class="text-sm text-destructive">{errorMsg}</p>
	{:else if items.length === 0}
		<EmptyState
			icon={CalendarClock}
			title="No booking links yet"
			description="Create your first booking link so customers can book themselves."
			actionLabel="New booking link"
			onAction={() => goto('/settings/booking/new')}
		/>
	{:else}
		<ul class="grid gap-3">
			{#each items as link (link.id)}
				{@const url = bookingPublicUrl(org().slug, link.slug)}
				<li class="rounded-xl border border-border bg-card p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<h3 class="truncate text-base font-semibold text-foreground">{link.title}</h3>
								<span
									class={[
										'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
										link.is_active
											? 'bg-[hsl(var(--status-active))]/10 text-[hsl(var(--status-active))]'
											: 'bg-muted text-muted-foreground'
									].join(' ')}
								>
									{link.is_active ? 'Active' : 'Inactive'}
								</span>
							</div>
							<p class="mt-1 truncate text-xs text-muted-foreground">{url}</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{link.slot_duration_minutes} min · {link.window_count} weekly window{link.window_count ===
								1
									? ''
									: 's'}
								{#if link.override_count > 0}
									· {link.override_count} override{link.override_count === 1 ? '' : 's'}
								{/if}
							</p>
						</div>
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onclick={() => copyUrl(link.slug)}>
							<Copy class="h-3.5 w-3.5" /> Copy URL
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() => goto(`/settings/booking/${link.id}`)}
						>
							Edit <ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageWrapper>
