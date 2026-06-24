<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import QuoteProgressStrip from '$lib/components/quotes/QuoteProgressStrip.svelte';
	import ServiceAddressPicker from '$lib/components/quotes/ServiceAddressPicker.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { AlertTriangle, MapPin, Target, User } from '@lucide/svelte';

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
	<div class="mx-auto w-full max-w-2xl space-y-5">
		<!-- Progress -->
		<div class="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
			<QuoteProgressStrip current="customer" />
		</div>

		<!-- Customer + address + opportunity -->
		<div class="rounded-xl border border-border/60 bg-card p-5 shadow-card">
			<h2 class="text-sm font-semibold text-foreground">Who's this quote for?</h2>
			<p class="mt-0.5 text-xs text-muted-foreground">
				Pick the customer and the job site. You'll build the line items next.
			</p>

			<div class="mt-4 grid gap-4">
				<!-- Contact -->
				<div class="grid gap-2">
					<Label>Contact <span class="text-destructive">*</span></Label>
					{#if selectedContact}
						<button
							type="button"
							class="flex items-center gap-3 rounded-lg border border-border bg-card-raised p-3 text-left transition-colors hover:bg-accent"
							onclick={() => (pickerOpen = true)}
						>
							<div
								class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
							>
								<User class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{selectedContact.full_name}</p>
								<p class="truncate text-xs text-muted-foreground">
									{selectedContact.phone}{selectedContact.email
										? ` · ${selectedContact.email}`
										: ''}
								</p>
							</div>
							<span class="shrink-0 text-xs text-muted-foreground">Change</span>
						</button>
					{:else}
						<Button variant="outline" onclick={() => (pickerOpen = true)}>
							<User class="mr-1 h-4 w-4" />Choose contact
						</Button>
					{/if}
					{#if selectedContact && !selectedContact.email}
						<p
							class="inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
						>
							<AlertTriangle class="h-3 w-3 shrink-0" />No email on file — you'll only be able to
							send this quote by SMS
						</p>
					{/if}
					{#if fieldErrors.contact_id}
						<p class="text-xs text-destructive">{fieldErrors.contact_id}</p>
					{/if}
				</div>

				<!-- Service address -->
				{#if selectedContact}
					<div class="grid gap-2">
						<Label class="flex items-center gap-1.5">
							<MapPin class="h-3.5 w-3.5 text-muted-foreground" />
							Service address
							<span class="text-xs font-normal text-muted-foreground">(optional)</span>
						</Label>
						<ServiceAddressPicker
							contactId={selectedContact.id}
							bind:selectedAddressId={serviceAddressId}
							autoSelectPrimary
						/>
					</div>
				{/if}

				<!-- Opportunity -->
				{#if selectedContact}
					<div class="grid gap-2">
						<Label class="flex items-center gap-1.5">
							<Target class="h-3.5 w-3.5 text-muted-foreground" />
							Opportunity
							<span class="text-xs font-normal text-muted-foreground">(optional)</span>
						</Label>
						{#if opportunityLocked && selectedOpportunityId}
							{@const locked = opportunities.find((o) => o.id === selectedOpportunityId)}
							<div
								class="flex items-center gap-3 rounded-lg border border-border bg-card-raised p-3"
							>
								<div
									class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"
								>
									<Target class="h-4 w-4" />
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">
										{locked?.title ?? 'Linked opportunity'}
									</p>
									<p class="truncate text-xs text-muted-foreground">Attached from pipeline</p>
								</div>
							</div>
						{:else if opportunitiesLoading}
							<p class="text-xs text-muted-foreground">Loading…</p>
						{:else if opportunities.length === 0}
							<p
								class="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300"
							>
								No open opportunities for this contact. The quote will be saved without a pipeline
								link.
							</p>
						{:else}
							<div class="grid gap-2">
								{#each opportunities as opp (opp.id)}
									<button
										type="button"
										class="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors {selectedOpportunityId ===
										opp.id
											? 'border-primary bg-primary/5'
											: 'border-border bg-card-raised hover:bg-accent'}"
										onclick={() =>
											(selectedOpportunityId = selectedOpportunityId === opp.id ? null : opp.id)}
									>
										<div
											class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
										>
											<Target class="h-4 w-4" />
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{opp.title}</p>
											{#if opp.value}<p class="text-xs text-muted-foreground">${opp.value}</p>{/if}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Details -->
		<div class="rounded-xl border border-border/60 bg-card p-5 shadow-card">
			<h2 class="text-sm font-semibold text-foreground">Quote details</h2>
			<div class="mt-4 grid gap-4">
				<div class="grid gap-2">
					<Label for="title">Title <span class="text-destructive">*</span></Label>
					<Input id="title" bind:value={title} placeholder="e.g. Roof replacement" />
					{#if fieldErrors.title}<p class="text-xs text-destructive">{fieldErrors.title}</p>{/if}
				</div>
				<div class="grid gap-2">
					<Label for="notes"
						>Client note <span class="text-xs font-normal text-muted-foreground">(optional)</span
						></Label
					>
					<Textarea
						id="notes"
						bind:value={notes}
						rows={2}
						placeholder="e.g. All work includes a 1-year warranty."
					/>
				</div>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button variant="outline" onclick={() => history.back()} disabled={saving} class="sm:w-auto">
				Cancel
			</Button>
			<JetEngineButton
				label="Start quote"
				loadingLabel="Creating…"
				successLabel="Created"
				state={saving ? 'loading' : 'idle'}
				onclick={start}
				class="sm:w-auto"
			/>
		</div>
	</div>

	{#if ContactPickerSheet}
		<ContactPickerSheet bind:open={pickerOpen} onPick={onContactPicked} />
	{/if}
</PageWrapper>
