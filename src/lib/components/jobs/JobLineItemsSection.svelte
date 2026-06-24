<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { formatCurrency } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import { FileText, Loader2, Receipt } from '@lucide/svelte';
	import type { JobDetail, JobLineItemRow } from '$lib/types/jobs';

	let {
		job,
		canInvoice
	}: {
		job: JobDetail;
		canInvoice: boolean;
	} = $props();

	const hasLines = $derived(job.line_items.length > 0);
	const taxPct = $derived((Number(job.tax_rate) * 100).toFixed(2));
	const discountNum = $derived(Number(job.discount_amount ?? 0));
	const discountText = $derived.by(() => {
		const base = job.discount_label?.trim() || 'Discount';
		if (job.discount_type === 'percent' && job.discount_value) {
			const v = Number(job.discount_value);
			return `${base} (${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}%)`;
		}
		return base;
	});

	// Group lines by section_label for display, preserving order (lines are position-sorted).
	const sections = $derived.by(() => {
		const out: { label: string | null; items: JobLineItemRow[] }[] = [];
		for (const li of job.line_items) {
			const label = li.section_label ?? null;
			let sec = out.find((s) => s.label === label);
			if (!sec) {
				sec = { label, items: [] };
				out.push(sec);
			}
			sec.items.push(li);
		}
		return out;
	});

	let converting = $state(false);
	async function createInvoice() {
		converting = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/convert-to-invoice`, { method: 'POST' });
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
</script>

<section class="rounded-xl border border-border bg-card p-4">
	<div class="mb-3 flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<Receipt class="h-4 w-4 text-muted-foreground" />
			<h2 class="text-sm font-semibold text-foreground">Products & Services</h2>
		</div>
		{#if hasLines && canInvoice}
			<Button
				size="sm"
				variant={job.has_active_invoice ? 'outline' : 'default'}
				onclick={createInvoice}
				disabled={converting}
			>
				{#if converting}
					<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
				{:else}
					<FileText class="mr-1.5 h-4 w-4" />
				{/if}
				{job.has_active_invoice ? 'View invoice' : 'Create invoice'}
			</Button>
		{/if}
	</div>

	{#if !hasLines}
		<p class="py-2 text-sm text-muted-foreground">No products or services on this job.</p>
	{:else}
		<div class="space-y-4">
			{#each sections as sec (sec.label ?? '__ungrouped')}
				<div class="space-y-2">
					{#if sec.label}
						<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{sec.label}
						</h3>
					{/if}
					{#each sec.items as li (li.line_key)}
						<div
							class="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0"
						>
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground">{li.description}</p>
								{#if li.details}
									<p class="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
										{li.details}
									</p>
								{/if}
								<p class="mt-0.5 text-xs text-muted-foreground tabular-nums">
									{Number(li.quantity)}{li.unit ? ` ${li.unit}` : ''} × {formatCurrency(
										li.unit_price
									)}
								</p>
							</div>
							<span class="shrink-0 text-sm font-medium tabular-nums text-foreground">
								{formatCurrency(li.total)}
							</span>
						</div>
					{/each}
				</div>
			{/each}

			<dl class="space-y-1.5 border-t border-border pt-3 text-sm">
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Subtotal</dt>
					<dd class="tabular-nums">{formatCurrency(job.subtotal)}</dd>
				</div>
				{#if discountNum > 0}
					<div class="flex justify-between">
						<dt class="text-emerald-600 dark:text-emerald-400">{discountText}</dt>
						<dd class="tabular-nums text-emerald-600 dark:text-emerald-400">
							−{formatCurrency(job.discount_amount ?? '0')}
						</dd>
					</div>
				{/if}
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Tax ({taxPct}%)</dt>
					<dd class="tabular-nums">{formatCurrency(job.tax_amount)}</dd>
				</div>
				<div class="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
					<dt>Total</dt>
					<dd class="tabular-nums">{formatCurrency(job.total)}</dd>
				</div>
			</dl>
		</div>
	{/if}
</section>
