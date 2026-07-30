<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import SelectVisitsToInvoiceDialog from '$lib/components/jobs/SelectVisitsToInvoiceDialog.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { offersInvoice, offersClose } from '$lib/jobs/visitCompletePrompt';
	import { toast } from '$lib/stores/toast.svelte';
	import type { AppointmentStatusJobEcho } from '$lib/types/jobs';

	// Jobber's post-completion prompt (VisitActionUponComplete, jobber-04 §3.3). Raised after a
	// visit is marked complete. Offers "Invoice now / later" when billing is configured, and —
	// only on the LAST visit — "Close job / Leave open". On the last visit both combine into
	// Jobber's four outcomes (close+now / close+later / open+now / open+later). Creating an
	// invoice never closes the job; closing is always its own action.

	let {
		open = $bindable(),
		jobId,
		jobTitle,
		echo,
		onClosed,
		onInvoiced
	}: {
		open: boolean;
		jobId: string;
		jobTitle: string | null;
		// The `data.job` echo returned by the appointment-status PATCH (billing + last-visit signals).
		echo: AppointmentStatusJobEcho;
		// Fired after the job is closed so the caller can refresh its row/badge.
		onClosed?: () => void;
		// Fired after an invoice is created (direct/convert path; the visit-picker fires its own).
		onInvoiced?: () => void;
	} = $props();

	const member = getMemberContext();
	const m = $derived(member());
	const canInvoice = $derived(offersInvoice(echo, m));
	const canClose = $derived(offersClose(echo, m));
	const billingType = $derived(echo?.billing_type ?? null);
	const billingFrequency = $derived(echo?.billing_frequency ?? null);

	type Choice = {
		key: string;
		label: string;
		close: boolean;
		invoice: 'now' | 'later' | null;
		primary?: boolean;
	};

	// The button set mirrors Jobber's VisitActionUponComplete enum exactly.
	const choices = $derived.by<Choice[]>(() => {
		if (canClose && canInvoice) {
			return [
				{
					key: 'close-now',
					label: 'Close job & invoice now',
					close: true,
					invoice: 'now',
					primary: true
				},
				{ key: 'close-later', label: 'Close job & invoice later', close: true, invoice: 'later' },
				{ key: 'open-now', label: 'Leave open & invoice now', close: false, invoice: 'now' },
				{ key: 'open-later', label: 'Leave open & invoice later', close: false, invoice: 'later' }
			];
		}
		if (canInvoice) {
			return [
				{ key: 'now', label: 'Invoice now', close: false, invoice: 'now', primary: true },
				{ key: 'later', label: 'Invoice later', close: false, invoice: 'later' }
			];
		}
		// canClose only
		return [
			{ key: 'close', label: 'Close job', close: true, invoice: null, primary: true },
			{ key: 'open', label: 'Leave open', close: false, invoice: null }
		];
	});

	const heading = $derived(canClose ? 'Last visit complete' : 'Visit complete');

	let busy = $state<string | null>(null);
	let selectVisitsOpen = $state(false);

	async function closeJob(): Promise<boolean> {
		try {
			const res = await fetch(`/api/jobs/${jobId}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'complete' })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not close the job.');
				return false;
			}
			toast.success('Job closed.');
			onClosed?.();
			return true;
		} catch {
			toast.error('Network error. Please try again.');
			return false;
		}
	}

	// visit-based → the visit-selection picker (it creates the invoice + navigates itself);
	// periodic fixed → generate a fresh period invoice from the line items; on-completion fixed
	// → convert the whole job to one invoice. Mirrors JobBillingSection's invoice-now branching.
	async function invoiceNow(): Promise<void> {
		if (billingType === 'visit_based') {
			open = false;
			selectVisitsOpen = true;
			return;
		}
		const endpoint = billingFrequency === 'periodic' ? 'generate-invoice' : 'convert-to-invoice';
		try {
			const res = await fetch(`/api/jobs/${jobId}/${endpoint}`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not create the invoice.');
				return;
			}
			const inv = body.data as { id: string; invoice_number_display: string };
			toast.success(`Invoice ${inv.invoice_number_display} created`);
			onInvoiced?.();
			open = false;
			await goto(`/invoices/${inv.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		}
	}

	async function choose(c: Choice): Promise<void> {
		if (busy) return;
		busy = c.key;
		try {
			if (c.close && !(await closeJob())) return;
			if (c.invoice === 'now') {
				await invoiceNow();
				return;
			}
			// Invoice later / Leave open — the decision is recorded by doing nothing more.
			open = false;
		} finally {
			busy = null;
		}
	}

	function onOpenChange(next: boolean): void {
		if (!next && !busy) open = false;
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="visit-complete" showClose={false}>
		<div class="visit-complete__head">
			<div class="visit-complete__icon">
				<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
			</div>
			<div>
				<h2 class="visit-complete__title">{heading}</h2>
				{#if jobTitle}<p class="visit-complete__sub">{jobTitle}</p>{/if}
			</div>
		</div>

		<p class="visit-complete__prompt">
			{#if canClose && canInvoice}
				This was the last visit. Close the job and/or invoice it?
			{:else if canClose}
				This was the last visit. Close the job, or leave it open for more?
			{:else}
				Would you like to invoice this now?
			{/if}
		</p>

		<div class="visit-complete__actions">
			{#each choices as c (c.key)}
				<Button
					variant={c.primary ? 'default' : 'outline'}
					loading={busy === c.key}
					disabled={busy != null && busy !== c.key}
					onclick={() => choose(c)}
				>
					{c.label}
				</Button>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- visit-based "Invoice now" routes through the same picker as the Billing tab. -->
<SelectVisitsToInvoiceDialog
	bind:open={selectVisitsOpen}
	{jobId}
	onInvoiced={() => onInvoiced?.()}
/>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	:global(.dialog-content.visit-complete) {
		max-width: 420px;
		padding: $space-5;
	}

	.visit-complete {
		&__head {
			display: flex;
			align-items: center;
			gap: $space-3;
			margin-bottom: $space-3;
		}

		&__icon {
			display: grid;
			place-items: center;
			width: 2.25rem;
			height: 2.25rem;
			flex-shrink: 0;
			border-radius: $radius-full;
			background: var(--success-bg);
			color: var(--success-solid);
			font-size: 1.4rem;
		}

		&__title {
			font-size: $fs-h3;
			font-weight: 700;
			color: var(--color-text-primary);
		}

		&__sub {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__prompt {
			margin-bottom: $space-4;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__actions {
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}
	}
</style>
