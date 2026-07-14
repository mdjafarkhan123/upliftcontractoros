<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import QuoteProgressStrip from '$lib/components/quotes/QuoteProgressStrip.svelte';
	import ServiceAddressPicker from '$lib/components/quotes/ServiceAddressPicker.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	type OpportunityPick = {
		id: string;
		title: string;
		value: string | null;
		stage_id: string;
	};

	type ContactPick = { id: string; full_name: string; phone: string; email: string | null };

	let selectedContact = $state<ContactPick | null>(null);
	let serviceAddressId = $state<string | null>(null);
	let title = $state('');
	let notes = $state('');
	let pickerOpen = $state(false);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	const prefilledOpportunityId = $derived(page.url.searchParams.get('opportunity_id'));
	const prefilledContactId = $derived(page.url.searchParams.get('contact_id'));
	let opportunities = $state<OpportunityPick[]>([]);
	let opportunitiesLoading = $state(false);
	let selectedOpportunityId = $state<string | null>(null);
	let opportunityLocked = $state(false);

	async function loadContactPrefill(contactId: string) {
		try {
			const res = await fetch(`/api/contacts/${contactId}`);
			if (!res.ok) return;
			const body = await res.json();
			const c = body.data ?? body;
			// loadContactDetail returns { contact: {...}, ... }
			const contact = c?.contact ?? c;
			if (contact && contact.id) {
				selectedContact = {
					id: contact.id,
					full_name: contact.full_name,
					phone: contact.phone,
					email: contact.email ?? null
				};
			}
		} catch {
			// silent — user can still pick manually
		}
	}

	async function loadOpportunitiesForContact(contactId: string) {
		opportunitiesLoading = true;
		try {
			const res = await fetch(
				`/api/pipeline/opportunities?contact_id=${encodeURIComponent(contactId)}&open=true`
			);
			if (!res.ok) {
				opportunities = [];
				return;
			}
			const body = await res.json();
			opportunities = (body.opportunities ?? []) as OpportunityPick[];
			// Auto-attach when the contact has exactly one open deal (Jobber/Housecall
			// pattern). Skip when locked from the pipeline or the user already picked.
			if (!opportunityLocked && selectedOpportunityId === null && opportunities.length === 1) {
				selectedOpportunityId = opportunities[0]!.id;
			}
		} finally {
			opportunitiesLoading = false;
		}
	}

	$effect(() => {
		const oppId = prefilledOpportunityId;
		const ctcId = prefilledContactId;
		if (!oppId || !ctcId) return;
		opportunityLocked = true;
		selectedOpportunityId = oppId;
		void loadContactPrefill(ctcId);
		void loadOpportunitiesForContact(ctcId);
	});

	$effect(() => {
		const c = selectedContact;
		if (!c) {
			opportunities = [];
			if (!opportunityLocked) selectedOpportunityId = null;
			return;
		}
		if (opportunityLocked) return;
		void loadOpportunitiesForContact(c.id);
		selectedOpportunityId = null;
	});

	function onContactPicked(c: ContactPick) {
		selectedContact = c;
		// New contact → reset the (auto-selected) service address; picker re-resolves primary.
		serviceAddressId = null;
	}

	let ContactPickerSheet = $state<
		typeof import('$lib/components/quotes/ContactPickerSheet.svelte').default | null
	>(null);
	$effect(() => {
		if (!pickerOpen || ContactPickerSheet) return;
		void import('$lib/components/quotes/ContactPickerSheet.svelte').then((m) => {
			ContactPickerSheet = m.default;
		});
	});

	async function start() {
		fieldErrors = {};
		if (!selectedContact) {
			fieldErrors.contact_id = 'Choose a contact';
			return;
		}
		if (!title.trim()) {
			fieldErrors.title = 'Title is required';
			return;
		}

		saving = true;
		try {
			const res = await fetch('/api/quotes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contact_id: selectedContact.id,
					service_address_id: serviceAddressId,
					opportunity_id: selectedOpportunityId,
					title: title.trim(),
					notes: notes.trim() || null
				})
			});
			const body = await res.json();
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to create quote');
				return;
			}
			quotesStore.invalidate();
			toast.success(`${body.data.quote_number_display} created`);
			goto(`/quotes/${body.data.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New quote</title></svelte:head>

<PageWrapper title="New quote" back="/quotes">
	<div class="quote-start">
		<!-- Progress -->
		<div class="quote-start__progress-card">
			<QuoteProgressStrip current="customer" />
		</div>

		<!-- Customer + address + opportunity -->
		<div class="quote-start__card">
			<h2 class="quote-start__card-title">Who's this quote for?</h2>
			<p class="quote-start__card-sub">
				Pick the customer and the job site. You'll build the line items next.
			</p>

			<div class="quote-start__fields">
				<!-- Contact -->
				<div class="quote-start__field">
					<span class="quote-start__label">Contact <span class="quote-start__req">*</span></span>
					{#if selectedContact}
						<button
							type="button"
							class="quote-start__contact-btn"
							onclick={() => (pickerOpen = true)}
						>
							<span class="quote-start__avatar">
								<i class="ri-user-line" aria-hidden="true"></i>
							</span>
							<span class="quote-start__contact-info">
								<span class="quote-start__contact-name">{selectedContact.full_name}</span>
								<span class="quote-start__contact-sub">
									{selectedContact.phone}{selectedContact.email
										? ` · ${selectedContact.email}`
										: ''}
								</span>
							</span>
							<span class="quote-start__contact-change">Change</span>
						</button>
					{:else}
						<button
							type="button"
							class="btn btn--outline btn--lg"
							onclick={() => (pickerOpen = true)}
						>
							<i class="ri-user-line" aria-hidden="true"></i>Choose contact
						</button>
					{/if}
					{#if selectedContact && !selectedContact.email}
						<p class="quote-start__warn">
							<i class="ri-alert-line" aria-hidden="true"></i>No email on file — you'll only be able
							to send this quote by SMS
						</p>
					{/if}
					{#if fieldErrors.contact_id}
						<p class="quote-start__error">{fieldErrors.contact_id}</p>
					{/if}
				</div>

				<!-- Service address -->
				{#if selectedContact}
					<div class="quote-start__field">
						<span class="quote-start__label">
							<i class="ri-map-pin-line" aria-hidden="true"></i>
							Service address
							<span class="quote-start__label-opt">(optional)</span>
						</span>
						<ServiceAddressPicker
							contactId={selectedContact.id}
							bind:selectedAddressId={serviceAddressId}
							autoSelectPrimary
						/>
					</div>
				{/if}

				<!-- Opportunity -->
				{#if selectedContact}
					<div class="quote-start__field">
						<span class="quote-start__label">
							<i class="ri-focus-3-line" aria-hidden="true"></i>
							Opportunity
							<span class="quote-start__label-opt">(optional)</span>
						</span>
						{#if opportunityLocked && selectedOpportunityId}
							{@const locked = opportunities.find((o) => o.id === selectedOpportunityId)}
							<div class="quote-start__opp quote-start__opp--locked">
								<span class="quote-start__avatar quote-start__avatar--brand">
									<i class="ri-focus-3-line" aria-hidden="true"></i>
								</span>
								<span class="quote-start__opp-info">
									<span class="quote-start__opp-title">{locked?.title ?? 'Linked opportunity'}</span
									>
									<span class="quote-start__opp-sub">Attached from pipeline</span>
								</span>
							</div>
						{:else if opportunitiesLoading}
							<p class="quote-start__note">Loading…</p>
						{:else if opportunities.length === 0}
							<p class="quote-start__note quote-start__note--warn">
								No open opportunities for this contact. The quote will be saved without a pipeline
								link.
							</p>
						{:else}
							<div class="quote-start__opp-list">
								{#each opportunities as opp (opp.id)}
									<button
										type="button"
										class="quote-start__opp {selectedOpportunityId === opp.id
											? 'quote-start__opp--active'
											: ''}"
										onclick={() =>
											(selectedOpportunityId = selectedOpportunityId === opp.id ? null : opp.id)}
									>
										<span class="quote-start__avatar">
											<i class="ri-focus-3-line" aria-hidden="true"></i>
										</span>
										<span class="quote-start__opp-info">
											<span class="quote-start__opp-title">{opp.title}</span>
											{#if opp.value}<span class="quote-start__opp-sub">${opp.value}</span>{/if}
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Details -->
		<div class="quote-start__card">
			<h2 class="quote-start__card-title">Quote details</h2>
			<div class="quote-start__fields">
				<div class="quote-start__field">
					<label class="quote-start__label" for="title"
						>Title <span class="quote-start__req">*</span></label
					>
					<input
						id="title"
						class="field__input"
						bind:value={title}
						placeholder="e.g. Roof replacement"
					/>
					{#if fieldErrors.title}<p class="quote-start__error">{fieldErrors.title}</p>{/if}
				</div>
				<div class="quote-start__field">
					<label class="quote-start__label" for="notes">
						Client note <span class="quote-start__label-opt">(optional)</span>
					</label>
					<textarea
						id="notes"
						class="field__textarea"
						bind:value={notes}
						rows={2}
						placeholder="e.g. All work includes a 1-year warranty."
					></textarea>
				</div>
			</div>
		</div>

		<!-- Actions -->
		<div class="quote-start__actions">
			<button
				type="button"
				class="btn btn--secondary"
				onclick={() => history.back()}
				disabled={saving}
			>
				Cancel
			</button>
			<Button
				loadingLabel="Creating…"
				successLabel="Created"
				loading={saving}
				onclick={start}
			>
				Start quote
			</Button>
		</div>
	</div>

	{#if ContactPickerSheet}
		<ContactPickerSheet bind:open={pickerOpen} onPick={onContactPicked} />
	{/if}
</PageWrapper>
