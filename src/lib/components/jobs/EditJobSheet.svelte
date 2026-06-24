<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import JobTagsEditor from '$lib/components/jobs/JobTagsEditor.svelte';
	import { SUGGESTED_JOB_TYPES } from '$lib/jobs/jobMeta';
	import { cn } from '$lib/utils/cn';
	import { formatCurrency } from '$lib/utils/format';
	import { Briefcase, Tag } from '@lucide/svelte';
	import type { JobDetail } from '$lib/types/jobs';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	type Assignee = { id: string; full_name: string };

	let {
		open = $bindable(),
		job,
		assignees,
		canEditAssignee,
		onClose,
		onSaved
	}: {
		open: boolean;
		job: JobDetail;
		assignees: Assignee[];
		canEditAssignee: boolean;
		onClose: () => void;
		onSaved: (next: JobDetail) => void;
	} = $props();

	function toInputValue(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function rateToPct(rate: string): string {
		const r = Number(rate);
		return r > 0 ? String(Math.round(r * 10000) / 100) : '';
	}

	function draftsFromJob(j: JobDetail): QuoteLineDraft[] {
		return j.line_items.map((li) => ({
			client_id: crypto.randomUUID(),
			line_key: li.line_key,
			description: li.description,
			details: li.details ?? '',
			quantity: li.quantity,
			unit: li.unit ?? '',
			section_label: li.section_label,
			unit_price: li.unit_price,
			unit_cost: li.unit_cost,
			source_catalog_item_id: li.source_catalog_item_id
		}));
	}

	let assignedTo = $state(job.assigned_to ?? '');
	let scheduledStart = $state(toInputValue(job.scheduled_start));
	let scheduledEnd = $state(toInputValue(job.scheduled_end));
	let notes = $state(job.notes ?? '');
	let scopeOfWork = $state(job.scope_of_work ?? '');
	let jobType = $state(job.job_type ?? '');
	let tags = $state<string[]>(job.tags ?? []);
	let lineItems = $state<QuoteLineDraft[]>(draftsFromJob(job));
	let discountType = $state<'none' | 'fixed' | 'percent'>(
		(job.discount_type as 'none' | 'fixed' | 'percent') ?? 'none'
	);
	let discountValue = $state(job.discount_value ?? '');
	let discountLabel = $state(job.discount_label ?? '');
	let taxRatePct = $state(rateToPct(job.tax_rate));

	// Reset all fields when a different job is loaded into the sheet.
	$effect(() => {
		assignedTo = job.assigned_to ?? '';
		scheduledStart = toInputValue(job.scheduled_start);
		scheduledEnd = toInputValue(job.scheduled_end);
		notes = job.notes ?? '';
		scopeOfWork = job.scope_of_work ?? '';
		jobType = job.job_type ?? '';
		tags = job.tags ?? [];
		lineItems = draftsFromJob(job);
		discountType = (job.discount_type as 'none' | 'fixed' | 'percent') ?? 'none';
		discountValue = job.discount_value ?? '';
		discountLabel = job.discount_label ?? '';
		taxRatePct = rateToPct(job.tax_rate);
	});

	// Live totals — mirror recalcJobTotals (discount before tax, clamps) for a preview.
	const subtotal = $derived(
		lineItems.reduce((sum, li) => {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return sum;
			return sum + Math.round(q * p * 100) / 100;
		}, 0)
	);
	const discountAmount = $derived.by(() => {
		if (discountType === 'none') return 0;
		const v = Number(discountValue);
		if (!Number.isFinite(v) || v <= 0) return 0;
		if (discountType === 'percent')
			return Math.round(((subtotal * Math.min(v, 100)) / 100) * 100) / 100;
		return Math.min(Math.max(v, 0), subtotal);
	});
	const taxRate = $derived(Number(taxRatePct) > 0 ? Number(taxRatePct) / 100 : 0);
	const discountedBase = $derived(Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100));
	const taxAmount = $derived(Math.round(discountedBase * taxRate * 100) / 100);
	const total = $derived(Math.round((discountedBase + taxAmount) * 100) / 100);

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	async function save() {
		saving = true;
		errorMsg = null;
		try {
			const payload: Record<string, unknown> = {
				scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
				scheduled_end: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
				notes: notes.trim() || null,
				scope_of_work: scopeOfWork.trim() || null,
				job_type: jobType.trim() || null,
				tags
			};
			if (canEditAssignee) {
				payload.assigned_to = assignedTo || null;
			}

			// Pricing — always send so clearing a discount / tax persists.
			payload.tax_rate = taxRate;
			payload.discount_type = discountType;
			if (discountType !== 'none') {
				payload.discount_value = Number(discountValue) || 0;
				payload.discount_label = discountLabel.trim() || null;
			}

			// Line items — drop blank rows; server coerces numeric strings + recomputes totals.
			// Always sent (an empty array clears all lines).
			payload.line_items = lineItems
				.filter((li) => li.description.trim())
				.map((li, idx) => ({
					line_key: li.line_key ?? null,
					description: li.description.trim(),
					details: li.details?.trim() || null,
					quantity: li.quantity,
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					unit_price: li.unit_price,
					unit_cost: li.unit_cost ?? null,
					source_catalog_item_id: li.source_catalog_item_id ?? null,
					position: idx
				}));

			const res = await fetch(`/api/jobs/${job.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not save.';
				return;
			}
			const updatedAssigneeName =
				canEditAssignee && assignedTo
					? (assignees.find((a) => a.id === assignedTo)?.full_name ?? job.assignee_name)
					: canEditAssignee
						? null
						: job.assignee_name;

			onSaved({
				...job,
				...body.job,
				assignee_name: updatedAssigneeName
			});
			open = false;
		} catch {
			errorMsg = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<Sheet.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Sheet.Content side="bottom" class="max-h-[92vh] overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>Edit job</Sheet.Title>
		</Sheet.Header>

		<div class="mt-4 space-y-4">
			{#if canEditAssignee}
				<div class="space-y-1.5">
					<Label for="j-assignee">Assigned to</Label>
					<Select.Root bind:value={assignedTo}>
						<Select.Trigger class="h-11 w-full">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Unassigned</Select.Item>
							{#each assignees as a (a.id)}
								<Select.Item value={a.id}>{a.full_name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="j-start">Scheduled start</Label>
					<DateTimePicker bind:value={scheduledStart} placeholder="Pick start date & time" />
				</div>
				<div class="space-y-1.5">
					<Label for="j-end">Scheduled end</Label>
					<DateTimePicker bind:value={scheduledEnd} placeholder="Pick end date & time" />
				</div>
			</div>

			<!-- Job type -->
			<div class="space-y-2">
				<Label>Job type</Label>
				<div class="flex flex-wrap gap-1.5">
					{#each SUGGESTED_JOB_TYPES as t (t)}
						<button
							type="button"
							onclick={() => (jobType = jobType === t ? '' : t)}
							aria-pressed={jobType === t}
							class={cn(
								'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
								jobType === t
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground'
							)}
						>
							{t}
						</button>
					{/each}
				</div>
				<Input bind:value={jobType} placeholder="Or type a custom job type" class="h-9 text-sm" />
			</div>

			<!-- Tags -->
			<div class="space-y-2">
				<Label class="flex items-center gap-1.5">
					<Tag class="h-3.5 w-3.5 text-muted-foreground" /> Tags
				</Label>
				<JobTagsEditor bind:value={tags} />
			</div>

			<!-- Line items & pricing -->
			<div class="space-y-4 border-t border-border/50 pt-4">
				<div class="flex items-center gap-2">
					<Briefcase class="h-4 w-4 text-muted-foreground" />
					<h3 class="text-sm font-semibold text-foreground">Products & Services</h3>
				</div>

				<LineItemEditor bind:lineItems enableCatalog enableOptional={false} />

				<!-- Discount + tax -->
				<div class="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
					<div class="space-y-1.5">
						<Label>Discount</Label>
						<div class="flex gap-2">
							<Select.Root bind:value={discountType}>
								<Select.Trigger class="h-10 w-32 shrink-0">
									<Select.Value />
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="none">None</Select.Item>
									<Select.Item value="percent">Percent</Select.Item>
									<Select.Item value="fixed">Fixed $</Select.Item>
								</Select.Content>
							</Select.Root>
							{#if discountType !== 'none'}
								<Input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="h-10"
									placeholder={discountType === 'percent' ? '%' : '$'}
									bind:value={discountValue}
								/>
							{/if}
						</div>
						{#if discountType !== 'none'}
							<Input
								bind:value={discountLabel}
								placeholder="Discount label (e.g. Spring promo)"
								class="h-9 text-sm"
								maxlength={60}
							/>
						{/if}
					</div>
					<div class="space-y-1.5">
						<Label for="j-tax-rate">Tax rate (%)</Label>
						<Input
							id="j-tax-rate"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							class="h-10"
							placeholder="e.g. 8.25"
							bind:value={taxRatePct}
						/>
					</div>
				</div>

				<!-- Totals preview -->
				<div class="rounded-lg border border-border/60 bg-muted/20 p-3">
					<dl class="space-y-1.5 text-sm">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Subtotal</dt>
							<dd class="tabular-nums">{formatCurrency(subtotal)}</dd>
						</div>
						{#if discountAmount > 0}
							<div class="flex justify-between">
								<dt class="text-emerald-600 dark:text-emerald-400">
									{discountLabel.trim() || 'Discount'}{discountType === 'percent' &&
									Number(discountValue) > 0
										? ` (${Number(discountValue)}%)`
										: ''}
								</dt>
								<dd class="tabular-nums text-emerald-600 dark:text-emerald-400">
									−{formatCurrency(discountAmount)}
								</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Tax ({(taxRate * 100).toFixed(2)}%)</dt>
							<dd class="tabular-nums">{formatCurrency(taxAmount)}</dd>
						</div>
						<div class="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
							<dt>Total</dt>
							<dd class="tabular-nums">{formatCurrency(total)}</dd>
						</div>
					</dl>
				</div>
			</div>

			<div class="space-y-1.5 border-t border-border/50 pt-4">
				<Label for="j-scope">Scope of work</Label>
				<Textarea id="j-scope" bind:value={scopeOfWork} rows={4} />
			</div>

			<div class="space-y-1.5">
				<Label for="j-notes">Notes</Label>
				<Textarea id="j-notes" bind:value={notes} rows={3} />
			</div>

			{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}

			<div class="flex gap-2 pt-2">
				<Button variant="outline" class="flex-1" disabled={saving} onclick={() => (open = false)}>
					Cancel
				</Button>
				<JetEngineButton
					class="flex-1"
					label="Save changes"
					loadingLabel="Saving…"
					successLabel="Saved"
					state={saving ? 'loading' : 'idle'}
					onclick={save}
				/>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
