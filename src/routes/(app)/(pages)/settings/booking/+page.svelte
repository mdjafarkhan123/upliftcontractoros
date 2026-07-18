<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import RowActionsMenu, {
		type RowAction
	} from '$lib/components/shared/RowActionsMenu.svelte';
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
		is_default: boolean;
		form_type: 'booking' | 'request';
		requires_approval: boolean;
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
	let savingDefaultId = $state<string | null>(null);

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
				errorMsg = body.error ?? 'Failed to load forms.';
				return;
			}
			items = body.data;
		} catch {
			errorMsg = 'Failed to load forms.';
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
			toast.success('Link copied');
		} catch {
			toast.error('Could not copy link');
		}
	}

	function preview(slug: string) {
		window.open(bookingPublicUrl(org().slug, slug), '_blank', 'noopener');
	}

	// Toggle a form as the org's default for its type. Optimistic: flip locally
	// (and flip the previous default of the same type off), revert on failure.
	async function setDefault(link: LinkRow, next: boolean) {
		if (savingDefaultId) return;
		const snapshot = items.map((i) => ({ ...i }));
		items = items.map((i) => {
			if (i.id === link.id) return { ...i, is_default: next };
			if (next && i.form_type === link.form_type) return { ...i, is_default: false };
			return i;
		});
		savingDefaultId = link.id;
		try {
			const res = await fetch(`/api/booking-links/${link.id}/set-default`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ is_default: next })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				items = snapshot;
				toast.error(body.error ?? 'Could not update default.');
				return;
			}
			const label = link.form_type === 'request' ? 'request' : 'booking';
			toast.success(next ? `Set as default ${label} form` : `Cleared default ${label} form`);
		} catch {
			items = snapshot;
			toast.error('Could not update default.');
		} finally {
			savingDefaultId = null;
		}
	}

	function rowActions(link: LinkRow): RowAction[] {
		return [
			{
				key: 'edit',
				label: 'Edit',
				icon: 'ri-pencil-line',
				onSelect: () => goto(`/settings/booking/${link.id}`)
			},
			{
				key: 'preview',
				label: 'Preview',
				icon: 'ri-eye-line',
				onSelect: () => preview(link.slug)
			},
			{
				key: 'copy',
				label: 'Copy link',
				icon: 'ri-links-line',
				onSelect: () => copyUrl(link.slug)
			}
		];
	}
</script>

<svelte:head><title>Requests and bookings</title></svelte:head>

<PageWrapper
	title="Requests and bookings"
	subtitle="Manage the public forms customers use to request work or book with you"
	back="/settings"
>
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
	{:else}
		<div class="book-hub">
			<!-- ── Forms ─────────────────────────────────────────────────────── -->
			<section class="book-hub__section">
				<header class="book-hub__head">
					<h2 class="book-hub__title">Forms</h2>
					<Button size="sm" onclick={() => goto('/settings/booking/new')}>
						<i class="ri-add-line" aria-hidden="true"></i> Add New Form
					</Button>
				</header>

				{#if loading}
					<SkeletonLoader lines={3} height="72px" label="Loading forms" />
				{:else if errorMsg}
					<p class="book-error">{errorMsg}</p>
				{:else if items.length === 0}
					<EmptyState
						iconClass="ri-calendar-schedule-line"
						title="No forms yet"
						description="Create your first request or booking form so customers can reach you online."
						actionLabel="Add New Form"
						onAction={() => goto('/settings/booking/new')}
					/>
				{:else}
					<ul class="book-forms">
						{#each items as link (link.id)}
							<li class="book-form-row">
								<div class="book-form-row__main">
									<div class="book-form-row__title-line">
										<span class="book-form-row__title">{link.title}</span>
										<span class="book-card__badge book-card__badge--type">
											{link.form_type === 'request' ? 'Request form' : 'Booking form'}
										</span>
										{#if !link.is_active}
											<span class="book-card__badge book-card__badge--inactive">Inactive</span>
										{/if}
									</div>
									<p class="book-form-row__meta">
										{bookingPublicUrl(org().slug, link.slug)}
									</p>
								</div>

								<div class="book-form-row__default">
									<span class="book-form-row__default-label">
										{link.form_type === 'request' ? 'Request default' : 'Booking default'}
									</span>
									<Switch
										checked={link.is_default}
										disabled={savingDefaultId === link.id}
										aria-label={`Set ${link.title} as the default ${link.form_type} form`}
										onchange={(v) => setDefault(link, v)}
									/>
								</div>

								<RowActionsMenu
									actions={rowActions(link)}
									label={`Actions for ${link.title}`}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- ── Customization ─────────────────────────────────────────────── -->
			<section class="book-hub__section">
				<header class="book-hub__head">
					<h2 class="book-hub__title">Customization</h2>
				</header>
				<div class="book-hub__row">
					<div class="book-hub__row-main">
						<p class="book-hub__row-title">Personalize your forms with your brand</p>
						<p class="book-hub__row-text">
							Add your logo so forms match your business. Branding is managed in your
							organization settings.
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={() => goto('/settings/org')}>
						Business profile
					</Button>
				</div>
			</section>

			<!-- ── Availability ──────────────────────────────────────────────── -->
			<section class="book-hub__section">
				<header class="book-hub__head">
					<h2 class="book-hub__title">Availability</h2>
				</header>

				<div class="book-hub__row">
					<div class="book-hub__row-main">
						<p class="book-hub__row-title">Business hours</p>
						<p class="book-hub__row-text">
							Set your organization's timezone and hours in company settings. Each form's
							bookable windows are set on the form itself.
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={() => goto('/settings/org')}>
						Company settings
					</Button>
				</div>

				<div class="book-hub__row">
					<div class="book-hub__row-main">
						<p class="book-hub__row-title">Service areas</p>
						<p class="book-hub__row-text">
							Define which areas you serve for online requests and bookings.
						</p>
					</div>
					<span class="book-hub__soon">Coming soon</span>
				</div>

				<div class="book-hub__row">
					<div class="book-hub__row-main">
						<p class="book-hub__row-title">Team members</p>
						<p class="book-hub__row-text">
							Change who can be booked by managing your team's availability.
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={() => goto('/settings/team')}>
						Manage team
					</Button>
				</div>
			</section>
		</div>
	{/if}
</PageWrapper>
