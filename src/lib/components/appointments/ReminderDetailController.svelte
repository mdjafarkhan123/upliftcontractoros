<script lang="ts">
	import { goto } from '$app/navigation';
	import InvoiceReminderDetailPopover from '$lib/components/jobs/InvoiceReminderDetailPopover.svelte';
	import SelectVisitsToInvoiceDialog from '$lib/components/jobs/SelectVisitsToInvoiceDialog.svelte';
	import { remindersStore } from '$lib/stores/reminders.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ReminderCalendarItem } from '$lib/types/reminders';

	// One shared controller for the calendar's invoice-reminder popover (Deliverable 2). Each
	// calendar view (week grid / day list / month) renders a single instance and calls
	// `open(reminder, anchorEl)` on a reminder click. Create-invoice opens the SAME select-visits
	// picker used by the visit-complete flow and the job Billing tab (Jobber "Create Invoice");
	// edit deep-links to the job's Billing page; mark-complete/reopen and delete run inline.
	let { canInvoice = false }: { canInvoice?: boolean } = $props();

	let openState = $state<{ id: string; anchorEl: HTMLElement } | null>(null);
	let busy = $state(false);
	// Create-invoice → the shared "Select visits to invoice" picker. `invoiceJobId` is captured
	// before the popover closes (the live `item` clears on close), so the dialog keeps its target.
	let selectVisitsOpen = $state(false);
	let invoiceJobId = $state<string | null>(null);

	// Read the LIVE store row so an optimistic complete/reopen re-renders the open popover
	// (per the render-from-store rule), instead of a frozen copy from open-time.
	const item = $derived(
		openState ? (remindersStore.items.find((r) => r.id === openState!.id) ?? null) : null
	);

	export function open(reminder: ReminderCalendarItem, anchorEl: HTMLElement) {
		openState = { id: reminder.id, anchorEl };
	}

	function close() {
		openState = null;
	}

	// Marking a reminder complete makes it LEAVE the calendar (Jobber shows no "Completed"
	// reminder — its duty ended). Only active reminders are fed to the calendar, so this is always
	// a complete; on success we drop the card, matching the delete flow. Non-optimistic (await
	// first) so a failed PATCH simply leaves the card in place.
	async function toggleComplete() {
		const r = item;
		if (!r) return;
		busy = true;
		try {
			const res = await fetch(`/api/jobs/${r.job_id}/reminders/${r.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'completed' })
			});
			if (!res.ok) throw new Error();
			remindersStore.removeItem(r.id);
			toast.success('Reminder marked complete.');
			close();
		} catch {
			toast.error('Could not update the reminder.');
		} finally {
			busy = false;
		}
	}

	async function del() {
		const r = item;
		if (!r) return;
		busy = true;
		try {
			const res = await fetch(`/api/jobs/${r.job_id}/reminders/${r.id}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 204) throw new Error();
			remindersStore.removeItem(r.id);
			toast.success('Reminder deleted.');
			close();
		} catch {
			toast.error('Could not delete the reminder.');
		} finally {
			busy = false;
		}
	}

	// Create-invoice opens the shared select-visits picker for the reminder's job (same flow as
	// completing a visit / the Billing tab). Capture the job id, close the popover, open the picker.
	function createInvoice() {
		if (!item) return;
		invoiceJobId = item.job_id;
		close();
		selectVisitsOpen = true;
	}
	// Edit still lives on the job's Billing page — deep-link there.
	function edit() {
		if (item) goto(`/jobs/${item.job_id}`);
	}
</script>

{#if openState && item}
	<InvoiceReminderDetailPopover
		reminder={item}
		anchorEl={openState.anchorEl}
		jobId={item.job_id}
		jobTitle={item.job_title}
		contactId={item.contact_id}
		contactName={item.contact_name}
		contactPhone={item.contact_phone}
		contactEmail={item.contact_email}
		{canInvoice}
		{busy}
		onCreateInvoice={createInvoice}
		onEdit={edit}
		onToggleComplete={toggleComplete}
		onDelete={del}
		onClose={close}
	/>
{/if}

<!-- "Select visits to invoice" picker — opened by the reminder's Create Invoice action. -->
{#if invoiceJobId}
	<SelectVisitsToInvoiceDialog bind:open={selectVisitsOpen} jobId={invoiceJobId} />
{/if}
