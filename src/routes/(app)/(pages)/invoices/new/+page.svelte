<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import QuoteProgressStrip from '$lib/components/quotes/QuoteProgressStrip.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/stores/toast.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	const org = getOrgContext();

	type ContactPick = { id: string; full_name: string; phone: string; email: string | null };

	const prefillContactId = page.url.searchParams.get('contact_id');
	const prefillContactName = page.url.searchParams.get('contact_name');
	const prefillJobId = page.url.searchParams.get('job_id');
	const prefillJobTitle = page.url.searchParams.get('job_title');

	let selectedContact = $state<ContactPick | null>(
		prefillContactId && prefillContactName
			? { id: prefillContactId, full_name: prefillContactName, phone: '', email: null }
			: null
	);
	let linkedJobId = $state<string | null>(prefillJobId);
	let title = $state(prefillJobTitle ? `${prefillJobTitle} — invoice` : '');
	let taxRatePct = $state('0');
	let dueDate = $state('');
	let notes = $state('');
	let sendReminders = $state(true);
	// Per-invoice accept-tips opt-in (default true). Only shown when the org has tips enabled;
	// org tips_enabled stays the master gate. Suppresses the tip selector for this invoice.
	let acceptTips = $state(true);
	// Per-invoice late-fee opt-in (M8 Phase 2). Seeded ON from the company default and only shown
	// when the org has late fees enabled. The amount/type are snapshot from the org here; full
	// per-invoice editing lives on the detail page. Uncheck to waive the fee for this client.
	let lateFeeEnabled = $state(org().late_fee_enabled ?? false);
	const lateFeeType = (org().late_fee_type === 'flat' ? 'flat' : 'percent') as 'flat' | 'percent';
	const lateFeeValue =
		lateFeeType === 'flat' ? (org().late_fee_flat_amount ?? '') : (org().late_fee_percent ?? '');
	const lateFeeSummary =
		lateFeeType === 'flat'
			? `A $${Number(lateFeeValue || 0).toFixed(2)} fee once this invoice is overdue.`
			: `A ${Number(lateFeeValue || 0)}% fee on the balance once this invoice is overdue.`;
	// Org-level reminder schedule, shown read-only under the per-invoice toggle so the
	// contractor sees exactly what "automatic payment reminders" will do.
	let reminderSummary = $state('');
	let reminderOrgEnabled = $state(false);
	let pickerOpen = $state(false);
	let saving = $state(false);
	// Create-mode progressive disclosure: essentials first (customer + title), the rest
	// behind "More details". Line items are built on the invoice detail page, not here.
	let showMore = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	const taxRateNum = $derived.by(() => {
		const n = Number(taxRatePct);
		return Number.isFinite(n) ? n / 100 : 0;
	});

	// The contact picker sheet is click-gated — load it lazily so the form shell
	// paints instantly; the chunk fetches the first time the picker opens.
	let ContactPickerSheet = $state<
		typeof import('$lib/components/quotes/ContactPickerSheet.svelte').default | null
	>(null);
	$effect(() => {
		if (!pickerOpen || ContactPickerSheet) return;
		void import('$lib/components/quotes/ContactPickerSheet.svelte').then((m) => {
			ContactPickerSheet = m.default;
		});
	});

	// Load the org's live reminder schedule once for the summary line.
	$effect(() => {
		void fetch('/api/invoices/reminder-schedule')
			.then((r) => (r.ok ? r.json() : null))
			.then((b) => {
				if (b?.data) {
					reminderSummary = b.data.summary ?? '';
					reminderOrgEnabled = Boolean(b.data.enabled);
				}
			})
			.catch(() => {});
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
			const res = await fetch('/api/invoices', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contact_id: selectedContact.id,
					job_id: linkedJobId,
					title: title.trim(),
					tax_rate: Number.isFinite(taxRateNum) ? taxRateNum : 0,
					due_date: dueDate.trim() || null,
					notes: notes.trim() || null,
					send_payment_reminders: sendReminders,
					accept_tips: acceptTips,
					late_fee_enabled: lateFeeEnabled,
					late_fee_type: lateFeeType,
					late_fee_value: lateFeeValue === '' ? null : Number(lateFeeValue)
				})
			});
			const body = await res.json();
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to create invoice');
				return;
			}
			invoicesStore.invalidate();
			toast.success(`${body.data.invoice_number_display} created`);
			goto(`/invoices/${body.data.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New invoice</title></svelte:head>

<PageWrapper title="New invoice" back="/invoices">
	<div class="invoice-new">
		<!-- Progress -->
		<div class="invoice-new__progress-card">
			<QuoteProgressStrip current="customer" />
		</div>

		<!-- Customer -->
		<div class="invoice-new__card">
			<h2 class="invoice-new__card-title">Who's this invoice for?</h2>
			<p class="invoice-new__card-sub">Pick the customer. You'll build the line items next.</p>

			<div class="invoice-new__fields">
				<div class="invoice-new__field">
					<Label>Contact <span class="invoice-new__req">*</span></Label>
					{#if selectedContact}
						<button
							type="button"
							class="invoice-new__contact-btn"
							onclick={() => (pickerOpen = true)}
						>
							<span class="invoice-new__avatar">
								<i class="ri-user-line" aria-hidden="true"></i>
							</span>
							<span class="invoice-new__contact-info">
								<span class="invoice-new__contact-name">{selectedContact.full_name}</span>
								{#if selectedContact.phone}
									<span class="invoice-new__contact-sub">{selectedContact.phone}</span>
								{/if}
							</span>
							<span class="invoice-new__contact-change">Change</span>
						</button>
					{:else}
						<Button type="button" variant="outline" size="lg" onclick={() => (pickerOpen = true)}>
							<i class="ri-user-line" aria-hidden="true"></i>Choose contact
						</Button>
					{/if}
					{#if fieldErrors.contact_id}
						<p class="invoice-new__error">{fieldErrors.contact_id}</p>
					{/if}
					{#if linkedJobId && prefillJobTitle}
						<p class="invoice-new__linked">
							Linked to job: <span>{prefillJobTitle}</span>
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Details -->
		<div class="invoice-new__card">
			<h2 class="invoice-new__card-title">Invoice details</h2>
			<div class="invoice-new__fields">
				<div class="invoice-new__field">
					<Label for="title">Title <span class="invoice-new__req">*</span></Label>
					<Input id="title" bind:value={title} placeholder="e.g. Roof replacement — final" />
					{#if fieldErrors.title}<p class="invoice-new__error">{fieldErrors.title}</p>{/if}
				</div>

				{#if showMore}
					<div class="invoice-new__grid">
						<div class="invoice-new__field">
							<Label for="taxRate">Tax rate (%)</Label>
							<Input
								id="taxRate"
								type="number"
								inputmode="decimal"
								min="0"
								max="100"
								step="0.01"
								bind:value={taxRatePct}
							/>
						</div>
						<div class="invoice-new__field">
							<Label for="dueDate">Due date</Label>
							<Calendar bind:value={dueDate} placeholder="Pick due date" />
						</div>
					</div>
					<div class="invoice-new__field">
						<Label for="notes">Notes</Label>
						<Textarea
							id="notes"
							bind:value={notes}
							rows={3}
							placeholder="Visible to customer on the invoice"
						/>
					</div>
					<div class="invoice-new__reminders">
						<div class="invoice-new__reminders-row">
							<div class="invoice-new__reminders-text">
								<p class="invoice-new__reminders-title">Send automatic payment reminders</p>
								{#if reminderOrgEnabled && reminderSummary}
									<p class="invoice-new__reminders-hint">{reminderSummary}</p>
								{:else}
									<p class="invoice-new__reminders-hint">
										Reminders are turned off for your account.
										<a href="/settings/automation">Turn them on →</a>
									</p>
								{/if}
							</div>
							<Switch id="reminders-switch" bind:checked={sendReminders} />
						</div>
						{#if reminderOrgEnabled && reminderSummary}
							<a class="invoice-new__reminders-link" href="/settings/automation">Edit schedule →</a>
						{/if}
					</div>
					{#if org().tips_enabled}
						<div class="invoice-new__reminders">
							<div class="invoice-new__reminders-row">
								<div class="invoice-new__reminders-text">
									<p class="invoice-new__reminders-title">Accept tips</p>
									<p class="invoice-new__reminders-hint">
										Let this client add a tip when they pay online.
									</p>
								</div>
								<Switch id="tips-switch" bind:checked={acceptTips} />
							</div>
						</div>
					{/if}
					{#if org().late_fee_enabled}
						<div class="invoice-new__reminders">
							<div class="invoice-new__reminders-row">
								<div class="invoice-new__reminders-text">
									<p class="invoice-new__reminders-title">Charge a late fee if overdue</p>
									<p class="invoice-new__reminders-hint">
										{lateFeeSummary} Applied automatically after the grace period. You can change the
										amount on the invoice.
									</p>
								</div>
								<Switch id="latefee-switch" bind:checked={lateFeeEnabled} />
							</div>
						</div>
					{/if}
				{:else}
					<button type="button" class="invoice-new__more" onclick={() => (showMore = true)}>
						<i class="ri-add-line" aria-hidden="true"></i>
						More details
					</button>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="invoice-new__actions">
			<button
				type="button"
				class="btn btn--secondary"
				onclick={() => history.back()}
				disabled={saving}
			>
				Cancel
			</button>
			<Button loadingLabel="Creating…" successLabel="Created" loading={saving} onclick={start}>
				Start invoice
			</Button>
		</div>
	</div>

	{#if ContactPickerSheet}
		<ContactPickerSheet
			bind:open={pickerOpen}
			onPick={(c) => {
				selectedContact = c;
				linkedJobId = null;
			}}
		/>
	{/if}
</PageWrapper>
