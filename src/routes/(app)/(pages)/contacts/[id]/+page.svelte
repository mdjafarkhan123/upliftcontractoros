<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ContactDetailHeader from '$lib/components/contacts/ContactDetailHeader.svelte';
	import ContactKpiStrip from '$lib/components/contacts/ContactKpiStrip.svelte';
	import ContactQuickActions from '$lib/components/contacts/ContactQuickActions.svelte';
	import ActiveAutomations from '$lib/components/automation/ActiveAutomations.svelte';
	import SmsOptOutBanner from '$lib/components/contacts/SmsOptOutBanner.svelte';
	import ContactOverviewTab from '$lib/components/contacts/ContactOverviewTab.svelte';
	import ContactDetailsPanel from '$lib/components/contacts/ContactDetailsPanel.svelte';
	import CommunicationPreferencesPanel from '$lib/components/contacts/CommunicationPreferencesPanel.svelte';
	import TimelineTab from '$lib/components/contacts/TimelineTab.svelte';
	import NotesTab from '$lib/components/contacts/NotesTab.svelte';
	import AddressesTab from '$lib/components/contacts/AddressesTab.svelte';
	import AttachmentsTab from '$lib/components/contacts/AttachmentsTab.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';
	import { contactDetailStore } from '$lib/stores/contactDetail.svelte';
	import { contactsStore } from '$lib/stores/contacts.svelte';
	import type { ContactDetailResponse } from '$lib/stores/contactDetail.svelte';
	import { formatDateTime } from '$lib/utils/format';
	import { InlineEditController } from '$lib/components/shared/inlineEditController.svelte';

	let { data }: { data: { id: string } } = $props();

	const member = getMemberContext();

	// One inline-edit coordinator for the whole page. The header name and every
	// details-panel field share it, so there is exactly ONE Save/Cancel (in the
	// header topbar) no matter what's being edited.
	const editCtl = new InlineEditController();

	// Sticky-only-if-it-fits: a rail sticks to the top while scrolling ONLY when
	// its full height fits within the viewport. If it's taller (which would hide
	// its bottom when pinned), it scrolls normally with the page. Re-checked on
	// content resize and window resize. The `.is-sticky` class is applied here but
	// only takes effect at column-layout widths (see scoped CSS).
	function stickyIfFits(node: HTMLElement) {
		const TOP_GAP = 16; // matches `top` offset below
		function check() {
			const fits = node.offsetHeight + TOP_GAP * 2 <= window.innerHeight;
			node.classList.toggle('is-sticky', fits);
		}
		check();
		const ro = new ResizeObserver(check);
		ro.observe(node);
		window.addEventListener('resize', check);
		return {
			destroy() {
				ro.disconnect();
				window.removeEventListener('resize', check);
			}
		};
	}

	const id = $derived(data.id);

	// Stale-while-revalidate load: instant from cache (or after a prefetch on
	// hover), otherwise fetches. Re-runs when navigating between contacts.
	$effect(() => {
		void contactDetailStore.load(id);
	});

	const detail = $derived(contactDetailStore.get(id));
	const seed = $derived(contactsStore.getById(id));
	// Cold load only when we have nothing to show at all (deep link, no list seed).
	const loadingCold = $derived(contactDetailStore.isLoading(id) && !seed);
	const errorMsg = $derived(contactDetailStore.getError(id));

	let notesComposerOpen = $state(false);

	let bindableNotes = $state<ContactDetailResponse['notes']>([]);
	let bindableAddresses = $state<ContactDetailResponse['addresses']>([]);

	// Seed the editable notes/addresses once per contact, when the full record
	// first arrives. We deliberately don't re-sync on later detail changes so
	// in-tab optimistic edits (e.g. adding a note) aren't clobbered.
	let seededFor = $state('');
	$effect(() => {
		const d = detail;
		if (d && seededFor !== id) {
			seededFor = id;
			bindableNotes = d.notes;
			bindableAddresses = d.addresses;
		}
	});

	const assigneeName = $derived(detail?.assignee?.name ?? null);

	// Instant-shell header model: prefer the full record, fall back to the list
	// row we already had (name, avatar, phone, status, temperature) so the header
	// paints immediately. The remaining fields fill in when the record loads.
	const headerVM = $derived.by(() => {
		if (detail) {
			return {
				full_name: detail.contact.full_name,
				company_name: detail.contact.company_name,
				avatar_url: detail.contact.avatar_url,
				phone: detail.contact.phone,
				alt_phone: detail.contact.alt_phone,
				alt_phone_label: detail.contact.alt_phone_label,
				email: detail.contact.email,
				status: detail.contact.status,
				assignee_name: assigneeName,
				referrer: detail.referrer,
				lead_source: detail.contact.lead_source,
				lead_temperature: detail.contact.lead_temperature,
				next_follow_up_at: detail.contact.next_follow_up_at,
				do_not_contact: detail.contact.do_not_contact
			};
		}
		if (seed) {
			return {
				full_name: seed.full_name,
				company_name: seed.company_name,
				avatar_url: seed.avatar_url,
				phone: seed.phone,
				alt_phone: null,
				alt_phone_label: null,
				email: seed.email,
				status: seed.status,
				assignee_name: seed.assignee_name,
				referrer: null,
				lead_source: seed.lead_source,
				lead_temperature: seed.lead_temperature,
				next_follow_up_at: null,
				do_not_contact: false
			};
		}
		return null;
	});

	function openAddNote() {
		notesComposerOpen = true;
	}

	function applyOptimisticPatch(patch: { status?: 'customer'; next_follow_up_at?: string | null }) {
		contactDetailStore.patch(id, (prev) => {
			const now = new Date().toISOString();
			const next = { ...prev.contact };
			if (patch.status) {
				next.status = patch.status;
				if (next.converted_at === null) next.converted_at = now;
			}
			if (patch.next_follow_up_at !== undefined) next.next_follow_up_at = patch.next_follow_up_at;
			next.updated_at = now;
			return { ...prev, contact: next };
		});
	}

	// Inline name edit from the header. One-field PATCH with the optimistic stamp,
	// mirroring the Details panel's save flow.
	async function saveName(name: string): Promise<string | null> {
		if (!detail) return 'Still loading — try again in a moment.';
		const trimmed = name.trim();
		if (!trimmed) return 'Name is required.';
		try {
			const res = await fetch(`/api/contacts/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ full_name: trimmed, updated_at: detail.contact.updated_at })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				contactDetailStore.patch(id, (prev) => ({
					...prev,
					contact: { ...prev.contact, ...body.contact }
				}));
				contactsStore.invalidate();
				toast.success('Saved');
				return null;
			}
			if (res.status === 409 && body.code === 'STALE_UPDATE')
				return 'This contact was changed elsewhere. Reload the page and try again.';
			return body.error ?? 'Failed to save.';
		} catch {
			return 'Failed to save. Check your connection and try again.';
		}
	}

	const canEdit = $derived(member().can_edit_contacts);
	const canDelete = $derived(member().can_delete_contacts);
	const canMerge = $derived(member().can_merge_contacts);

	let mergeOpen = $state(false);

	// Merge + delete dialogs are only needed once invoked from the header menu.
	// Load each lazily so the contact detail paints without their chunks — they
	// fetch the first time the user opens them and are cached afterward.
	let MergeContactDialog = $state<
		typeof import('$lib/components/contacts/MergeContactDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!mergeOpen || MergeContactDialog) return;
		void import('$lib/components/contacts/MergeContactDialog.svelte').then((m) => {
			MergeContactDialog = m.default;
		});
	});

	let DeleteContactDialog = $state<
		typeof import('$lib/components/contacts/DeleteContactDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!confirmDeleteOpen || DeleteContactDialog) return;
		void import('$lib/components/contacts/DeleteContactDialog.svelte').then((m) => {
			DeleteContactDialog = m.default;
		});
	});

	async function reloadDetail() {
		await contactDetailStore.load(id, true);
		seededFor = ''; // allow notes/addresses to re-seed from the fresh record
	}

	async function onMerged(survivorId: string) {
		contactsStore.invalidate();
		if (survivorId === id) {
			contactDetailStore.remove(id);
			await reloadDetail();
		} else {
			contactDetailStore.remove(id);
			goto(`/contacts/${survivorId}`);
		}
	}

	// --- Archive / Unarchive ---
	let archiveBusy = $state(false);

	async function setStatus(nextStatus: 'lead' | 'customer' | 'archived', successMsg: string) {
		if (archiveBusy) return;
		archiveBusy = true;
		try {
			const res = await fetch(`/api/contacts/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: nextStatus })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				contactDetailStore.patch(id, (prev) => ({
					...prev,
					contact: { ...prev.contact, status: nextStatus, updated_at: body.contact.updated_at }
				}));
				contactsStore.invalidate();
				toast.success(successMsg);
			} else if (res.status === 409 && body.code === 'CONTACT_HAS_LINKS') {
				toast.error('Close or reassign linked jobs, quotes, and invoices before archiving.');
			} else {
				toast.error(body.error ?? 'Failed to update contact.');
			}
		} catch {
			toast.error('Failed to update contact.');
		} finally {
			archiveBusy = false;
		}
	}

	function archiveContact() {
		void setStatus('archived', 'Contact archived');
	}
	function unarchiveContact() {
		// No stored pre-archive status; a converted contact returns to customer,
		// otherwise to lead.
		void setStatus(
			detail?.contact.converted_at ? 'customer' : 'lead',
			'Contact restored to active'
		);
	}

	let confirmDeleteOpen = $state(false);

	async function performDelete() {
		if (!detail) return;
		const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
		if (res.ok) {
			contactsStore.invalidate();
			contactDetailStore.remove(id);
			toast.success(`${detail.contact.full_name} deleted.`);
			goto('/contacts');
			return;
		}
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		toast.error(body.error ?? 'Failed to delete contact. Please try again.');
		throw new Error(body.error ?? 'Failed to delete.');
	}

	// Linked record rows — shown as a stacked card in the main column.
	const sidebarRecords = $derived(
		detail
			? [
					{
						label: 'Opportunities',
						count: detail.counts.opportunities,
						href: `/pipeline?contact=${detail.contact.id}`,
						icon: 'ri-git-branch-line'
					},
					{
						label: 'Jobs',
						count: detail.counts.jobs,
						href: `/jobs?contact_id=${detail.contact.id}`,
						icon: 'ri-briefcase-line'
					},
					{
						label: 'Quotes',
						count: detail.counts.quotes,
						href: `/quotes?contact=${detail.contact.id}`,
						icon: 'ri-file-text-line'
					},
					{
						label: 'Invoices',
						count: detail.counts.invoices,
						href: `/invoices?contact=${detail.contact.id}`,
						icon: 'ri-receipt-line'
					},
					{
						label: 'Conversations',
						count: detail.counts.conversations,
						href: `/inbox?contact=${detail.contact.id}`,
						icon: 'ri-message-2-line'
					}
				]
			: []
	);
</script>

<svelte:head><title>{headerVM?.full_name ?? 'Contact'}</title></svelte:head>

<PageWrapper>
	{#if loadingCold}
		<!-- Cold deep link, no list seed yet — light shell, never a full blank. -->
		<div class="contact-page">
			<SkeletonLoader lines={2} height="56px" label="Loading contact" />
			<SkeletonLoader lines={1} height="92px" label="" />
			<SkeletonLoader lines={5} height="44px" label="" />
		</div>
	{:else if errorMsg && !detail}
		<EmptyState title="Couldn't load contact" description={errorMsg} />
	{:else if headerVM}
		{@const h = headerVM}
		<div class="contact-page">
			<!-- Header — renders instantly from list seed, enriches when loaded -->
			<ContactDetailHeader
				contact_id={id}
				full_name={h.full_name}
				company_name={h.company_name}
				avatar_url={h.avatar_url}
				phone={h.phone}
				alt_phone={h.alt_phone}
				alt_phone_label={h.alt_phone_label}
				email={h.email}
				status={h.status}
				assignee_name={h.assignee_name}
				referrer={h.referrer}
				lead_source={h.lead_source}
				lead_temperature={h.lead_temperature}
				next_follow_up_at={h.next_follow_up_at}
				do_not_contact={h.do_not_contact}
				{canEdit}
				{canDelete}
				{canMerge}
				{archiveBusy}
				onMerge={() => (mergeOpen = true)}
				onBack={() => {
					if (page.url.search) goto('/contacts');
					else history.back();
				}}
				onDelete={() => {
					confirmDeleteOpen = true;
				}}
				onArchive={archiveContact}
				onUnarchive={unarchiveContact}
				onSaveName={detail ? saveName : undefined}
				{editCtl}
				onAvatarChange={(r) => {
					contactDetailStore.patch(id, (prev) => ({
						...prev,
						contact: { ...prev.contact, avatar_url: r.avatar_url, updated_at: r.updated_at }
					}));
				}}
			/>

			{#if detail}
				{#if detail.contact.sms_opt_out}
					<SmsOptOutBanner
						source={detail.contact.sms_opt_out_source}
						opted_out_at={detail.contact.sms_opt_out_at}
					/>
				{/if}

				<!-- Pinned action bar (call / message / quote / book / note / follow-up / convert) -->
				<div class="contact-page__actions">
					<ContactQuickActions
						contactId={detail.contact.id}
						contactName={detail.contact.full_name}
						phone={detail.contact.phone}
						status={detail.contact.status}
						nextFollowUpAt={detail.contact.next_follow_up_at}
						onAddNote={openAddNote}
						onUpdated={applyOptimisticPatch}
					/>
				</div>

				<!-- Two-rail, no-tabs body (Jobber client-page layout) -->
				<div class="contact-page__body">
					<!-- LEFT rail — identity / editable details -->
					<div class="contact-page__rail contact-page__rail--left" use:stickyIfFits>
						<ContactDetailsPanel
							contactId={detail.contact.id}
							contact={detail.contact}
							{assigneeName}
							referrerId={detail.referrer?.id ?? null}
							referrerName={detail.referrer?.name ?? null}
							{canEdit}
							{editCtl}
						/>

						<div class="contact-page__card">
							<div class="contact-page__card-head">
								<p class="eyebrow">Addresses</p>
							</div>
							<div class="contact-page__card-body">
								<AddressesTab
									contactId={detail.contact.id}
									bind:addresses={bindableAddresses}
									{canEdit}
								/>
							</div>
						</div>

						<ActiveAutomations contactId={detail.contact.id} />
					</div>

					<!-- MAIN column — overview + records + activity -->
					<div class="contact-page__main">
						<ContactKpiStrip
							lifetime_revenue={detail.kpi.lifetime_revenue}
							open_quotes_count={detail.kpi.open_quotes_count}
							open_quotes_value={detail.kpi.open_quotes_value}
							active_jobs_count={detail.kpi.active_jobs_count}
							last_contacted_at={detail.contact.last_contacted_at}
							next_follow_up_at={detail.contact.next_follow_up_at}
							contactId={detail.contact.id}
						/>

						<CommunicationPreferencesPanel contactId={detail.contact.id} />

						<!-- Money records — self-carded stacked sections (Quotes / Jobs / Invoices / Appointments) -->
						<ContactOverviewTab contactId={detail.contact.id} />

						<!-- Linked records -->
						<div class="contact-page__card">
							<div class="contact-page__card-head">
								<p class="eyebrow">Linked Records</p>
							</div>
							<ul class="contact-linked">
								{#each sidebarRecords as row (row.label)}
									<li>
										<a href={row.href} class="contact-linked__row">
											<span class="contact-linked__label">
												<i class={row.icon} aria-hidden="true"></i>
												{row.label}
											</span>
											<span class="contact-linked__right">
												<span
													class="contact-linked__count"
													class:contact-linked__count--active={row.count > 0}
												>
													{row.count}
												</span>
												{#if row.count > 0}
													<i
														class="ri-arrow-right-s-line contact-linked__chevron"
														aria-hidden="true"
													></i>
												{/if}
											</span>
										</a>
									</li>
								{/each}
							</ul>
						</div>

						<!-- Activity timeline -->
						<div class="contact-page__card">
							<div class="contact-page__card-head">
								<p class="eyebrow">Activity</p>
							</div>
							<div class="contact-page__card-body">
								<TimelineTab contactId={detail.contact.id} compact />
							</div>
						</div>

						<!-- Files -->
						<div class="contact-page__card">
							<div class="contact-page__card-head">
								<p class="eyebrow">Files</p>
							</div>
							<div class="contact-page__card-body">
								<AttachmentsTab contactId={detail.contact.id} />
							</div>
						</div>
					</div>

					<!-- RIGHT rail — notes + activity meta -->
					<div class="contact-page__rail contact-page__rail--right" use:stickyIfFits>
						<div class="contact-page__card">
							<div class="contact-page__card-head">
								<p class="eyebrow">Notes</p>
							</div>
							<div class="contact-page__card-body">
								<NotesTab
									contactId={detail.contact.id}
									bind:notes={bindableNotes}
									{canEdit}
									bind:composerOpen={notesComposerOpen}
								/>
							</div>
						</div>

						<div class="contact-page__card">
							<div class="contact-page__card-head">
								<p class="eyebrow">Activity meta</p>
							</div>
							<dl class="contact-activity">
								<div class="contact-activity__row">
									<dt class="contact-activity__term">
										<i class="ri-time-line" aria-hidden="true"></i>
										Last contact
									</dt>
									<dd class="contact-activity__val">
										{detail.contact.last_contacted_at
											? formatDateTime(detail.contact.last_contacted_at)
											: '—'}
									</dd>
								</div>
								<div class="contact-activity__row">
									<dt class="contact-activity__term">
										<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
										Converted
									</dt>
									<dd class="contact-activity__val">
										{detail.contact.converted_at
											? formatDateTime(detail.contact.converted_at)
											: '—'}
									</dd>
								</div>
							</dl>
						</div>
					</div>
				</div>
			{:else}
				<!-- Header is up; the data-heavy panels hydrate a beat later. -->
				<SkeletonLoader lines={1} height="92px" label="Loading details" />
				<SkeletonLoader lines={5} height="44px" label="" />
			{/if}
		</div>
	{:else}
		<EmptyState title="Couldn't load contact" description={errorMsg ?? 'Unknown error.'} />
	{/if}
</PageWrapper>

{#if detail && MergeContactDialog}
	<MergeContactDialog
		bind:open={mergeOpen}
		current={{
			id: detail.contact.id,
			full_name: detail.contact.full_name,
			phone: detail.contact.phone
		}}
		{onMerged}
	/>
{/if}

{#if detail && DeleteContactDialog}
	<DeleteContactDialog
		bind:open={confirmDeleteOpen}
		full_name={detail.contact.full_name}
		counts={detail.counts}
		onConfirm={performDelete}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-page {
		display: flex;
		flex-direction: column;
		gap: $space-4;

		&__actions {
			display: flex;
			flex-wrap: wrap;
			gap: $space-2;
		}

		// Two-rail, no-tabs body. Mobile: single stacked column. Tablet: left rail
		// + main, notes rail drops under main. Wide: three columns.
		&__body {
			display: grid;
			gap: $space-5;
			grid-template-columns: 1fr;
			grid-template-areas:
				'main'
				'left'
				'right';

			@media (min-width: $bp-tablet) {
				grid-template-columns: 300px minmax(0, 1fr);
				grid-template-areas:
					'left main'
					'left right';
				align-items: start;
			}

			@media (min-width: 1280px) {
				grid-template-columns: 320px minmax(0, 1fr) 320px;
				grid-template-areas: 'left main right';
			}
		}

		&__rail {
			display: flex;
			flex-direction: column;
			gap: $space-4;
			min-width: 0;

			&--left {
				grid-area: left;
			}

			&--right {
				grid-area: right;
			}

			// Only sticks when JS has determined the rail fits in the viewport
			// (`.is-sticky`), and only once the layout actually has side columns.
			@media (min-width: $bp-tablet) {
				&.is-sticky {
					position: sticky;
					top: $space-4;
				}
			}
		}

		&__main {
			grid-area: main;
			display: flex;
			flex-direction: column;
			gap: $space-4;
			min-width: 0;
		}

		&__card {
			background: var(--color-bg-surface);
			border-radius: $radius-lg;
			box-shadow: var(--shadow-sm);
			overflow: hidden;
		}

		&__card-head {
			padding: $space-3 $space-4;
			border-bottom: 1px solid var(--color-border);
		}

		&__card-body {
			padding: $space-4;
		}
	}

	.contact-activity {
		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			padding: $space-2 $space-4;

			& + & {
				border-top: 1px solid var(--color-border);
			}
		}

		&__term {
			display: flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-secondary);

			i {
				font-size: 1.5rem;
				flex-shrink: 0;
			}
		}

		&__val {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}
	}

	.contact-linked {
		list-style: none;
		padding: 0;

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: $space-2 $space-4;
			text-decoration: none;
			transition: background-color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}

			li + li & {
				border-top: 1px solid var(--color-border);
			}
		}

		&__label {
			display: flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-primary);

			i {
				font-size: 1.5rem;
				color: var(--color-text-secondary);
			}
		}

		&__right {
			display: flex;
			align-items: center;
			gap: $space-1;
		}

		&__count {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-muted);

			&--active {
				color: var(--color-brand);
			}
		}

		&__chevron {
			font-size: 1.5rem;
			color: var(--color-text-muted);
		}
	}
</style>
