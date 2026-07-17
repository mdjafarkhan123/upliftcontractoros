<script lang="ts">
	import { goto } from '$app/navigation';
	import { getMemberContext } from '$lib/context/member';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { opportunityDetailStore } from '$lib/stores/opportunityDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		job_id,
		contact_id,
		contact_name,
		job_title,
		opportunity_id,
		has_line_items,
		invoice_count,
		appointment_count
	}: {
		job_id: string;
		contact_id: string;
		contact_name: string;
		job_title: string;
		opportunity_id: string | null;
		// Whether the job has any line items. Drives what "New invoice" does: pull the job's
		// work (convert-to-invoice) when there are lines, else open a blank invoice form.
		has_line_items: boolean;
		invoice_count: number;
		appointment_count: number;
	} = $props();

	const member = getMemberContext();
	const canCreateInvoice = $derived(member().can_create_invoices);
	const canCreateAppointment = $derived(member().can_create_appointments);

	// Blank-invoice form, pre-linked to this job/contact. Used as the fallback when the job has
	// no line items to pull from.
	const invoiceHref = $derived(
		`/invoices/new?contact_id=${encodeURIComponent(contact_id)}` +
			`&contact_name=${encodeURIComponent(contact_name)}` +
			`&job_id=${encodeURIComponent(job_id)}` +
			`&job_title=${encodeURIComponent(job_title)}`
	);

	// "New invoice": mirror the "Products & Services → Create invoice" flow so the invoice opens
	// pre-filled with the job's line items, tax, and discount (Jobber/Housecall model). Reuses the
	// existing active invoice if one exists (no duplicates). When the job has no lines yet, fall
	// back to the blank invoice form so the contractor can still bill.
	let converting = $state(false);
	async function createInvoice() {
		if (!has_line_items) {
			void goto(invoiceHref);
			return;
		}
		converting = true;
		try {
			const res = await fetch(`/api/jobs/${job_id}/convert-to-invoice`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not create invoice.');
				return;
			}
			const d = body.data as {
				id: string;
				invoice_number_display: string;
				already_existed: boolean;
			};
			if (d.already_existed) {
				toast.info(`Invoice ${d.invoice_number_display} already exists`);
			} else {
				toast.success(`Invoice ${d.invoice_number_display} created`);
			}
			await goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			converting = false;
		}
	}

	const appointmentHref = $derived(
		`/appointments/new?contact_id=${encodeURIComponent(contact_id)}` +
			`&contact_name=${encodeURIComponent(contact_name)}` +
			`&job_id=${encodeURIComponent(job_id)}` +
			`&job_title=${encodeURIComponent(job_title)}`
	);
</script>

<section class="job-links">
	{#if opportunity_id}
		<a
			href={`/pipeline/${opportunity_id}`}
			use:prefetchOnIntent={() => opportunityDetailStore.prefetch(opportunity_id)}
			class="job-links__row job-links__row--link"
		>
			<div class="job-links__main">
				<i class="ri-git-branch-line job-links__icon" aria-hidden="true"></i>
				<span class="job-links__label">View opportunity</span>
			</div>
			<i class="ri-arrow-right-s-line job-links__chevron" aria-hidden="true"></i>
		</a>
	{:else}
		<div class="job-links__row">
			<div class="job-links__main">
				<i class="ri-cursor-line job-links__icon" aria-hidden="true"></i>
				<span class="job-links__label">Created manually</span>
			</div>
			<span class="job-links__hint">No linked opportunity</span>
		</div>
	{/if}

	<div class="job-links__row">
		<div class="job-links__main">
			<i class="ri-file-text-line job-links__icon" aria-hidden="true"></i>
			<span class="job-links__label">Invoices</span>
			<span class="job-links__count">({invoice_count})</span>
		</div>
		{#if canCreateInvoice}
			<Button variant="secondary" size="sm" loading={converting} onclick={createInvoice}>
				<i class="ri-add-line" aria-hidden="true"></i>
				New invoice
			</Button>
		{/if}
	</div>

	<div class="job-links__row">
		<div class="job-links__main">
			<i class="ri-calendar-line job-links__icon" aria-hidden="true"></i>
			<span class="job-links__label">Appointments</span>
			<span class="job-links__count">({appointment_count})</span>
		</div>
		{#if canCreateAppointment}
			<Button href={appointmentHref} variant="secondary" size="sm">
				<i class="ri-add-line" aria-hidden="true"></i> New appointment
			</Button>
		{/if}
	</div>
</section>
