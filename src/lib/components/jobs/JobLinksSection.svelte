<script lang="ts">
	import { ChevronRight, FileText, Calendar, GitBranch, Hand, Plus } from '@lucide/svelte';
	import { getMemberContext } from '$lib/context/member';

	let {
		job_id,
		contact_id,
		contact_name,
		job_title,
		opportunity_id,
		invoice_count,
		appointment_count
	}: {
		job_id: string;
		contact_id: string;
		contact_name: string;
		job_title: string;
		opportunity_id: string | null;
		invoice_count: number;
		appointment_count: number;
	} = $props();

	const member = getMemberContext();
	const canCreateInvoice = $derived(member().can_create_invoices);
	const canCreateAppointment = $derived(member().can_create_appointments);

	const invoiceHref = $derived(
		`/invoices/new?contact_id=${encodeURIComponent(contact_id)}` +
			`&contact_name=${encodeURIComponent(contact_name)}` +
			`&job_id=${encodeURIComponent(job_id)}` +
			`&job_title=${encodeURIComponent(job_title)}`
	);

	const appointmentHref = $derived(
		`/appointments/new?contact_id=${encodeURIComponent(contact_id)}` +
			`&contact_name=${encodeURIComponent(contact_name)}` +
			`&job_id=${encodeURIComponent(job_id)}` +
			`&job_title=${encodeURIComponent(job_title)}`
	);
</script>

<section class="rounded-xl border border-border bg-card">
	{#if opportunity_id}
		<a
			href={`/pipeline/${opportunity_id}`}
			class="flex items-center justify-between gap-3 border-b border-border p-4 transition-colors hover:bg-accent/40 active:bg-accent/60"
		>
			<div class="flex items-center gap-3">
				<GitBranch class="h-4 w-4 text-muted-foreground" />
				<span class="text-sm font-medium">View opportunity</span>
			</div>
			<ChevronRight class="h-4 w-4 text-muted-foreground" />
		</a>
	{:else}
		<div class="flex items-center justify-between gap-3 border-b border-border p-4">
			<div class="flex items-center gap-3">
				<Hand class="h-4 w-4 text-muted-foreground" />
				<span class="text-sm font-medium">Created manually</span>
			</div>
			<span class="text-xs text-muted-foreground">No linked opportunity</span>
		</div>
	{/if}

	<div class="flex items-center justify-between gap-2 border-b border-border p-4">
		<div class="flex min-w-0 items-center gap-3">
			<FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
			<span class="text-sm font-medium">Invoices</span>
			<span class="text-xs text-muted-foreground">({invoice_count})</span>
		</div>
		{#if canCreateInvoice}
			<a
				href={invoiceHref}
				class="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent active:bg-accent/80"
			>
				<Plus class="h-3.5 w-3.5" /> New invoice
			</a>
		{/if}
	</div>

	<div class="flex items-center justify-between gap-2 p-4">
		<div class="flex min-w-0 items-center gap-3">
			<Calendar class="h-4 w-4 shrink-0 text-muted-foreground" />
			<span class="text-sm font-medium">Appointments</span>
			<span class="text-xs text-muted-foreground">({appointment_count})</span>
		</div>
		{#if canCreateAppointment}
			<a
				href={appointmentHref}
				class="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent active:bg-accent/80"
			>
				<Plus class="h-3.5 w-3.5" /> New appointment
			</a>
		{/if}
	</div>
</section>
