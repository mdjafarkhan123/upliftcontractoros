<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import DateTimePicker from '$lib/components/ui/date-time-picker/DateTimePicker.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import JobTagsEditor from '$lib/components/jobs/JobTagsEditor.svelte';
	import { SUGGESTED_JOB_TYPES } from '$lib/jobs/jobMeta';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { cn } from '$lib/utils/cn';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteLineDraft } from '$lib/types/quotes';
	import {
		Briefcase,
		Calendar,
		Clock,
		ExternalLink,
		FileText,
		Loader2,
		Mail,
		Phone,
		Search,
		Tag,
		User,
		X
	} from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const canAssign = $derived(member().can_view_full_pipeline);

	// ── Prefill (from quote) ────────────────────────────────────────────────────
	type LineDraftFromQuote = {
		line_key: string;
		description: string;
		details: string | null;
		quantity: string;
		unit: string | null;
		section_label: string | null;
		unit_price: string;
		unit_cost: string | null;
		source_catalog_item_id: string | null;
		position: number;
	};
	type PrefillData = {
		title: string;
		contact_id: string;
		contact_name: string;
		contact_phone: string | null;
		contact_email: string | null;
		opportunity_id: string | null;
		quote_number_display: string;
		notes: string | null;
		service_address: {
			line1: string | null;
			line2: string | null;
			city: string | null;
			state: string | null;
			zip: string | null;
		};
		discount_type: string;
		discount_value: string | null;
		discount_label: string | null;
		tax_rate: string;
		line_items: LineDraftFromQuote[];
	};
	let prefill = $state<PrefillData | null>(null);
	let prefillLoading = $state(false);

	// ── Contact search (manual creation) ───────────────────────────────────────
	type ContactHit = { id: string; full_name: string; phone: string };
	let contactQuery = $state('');
	let contactResults = $state<ContactHit[]>([]);
	let selectedContact = $state<ContactHit | null>(null);
	let contactSearching = $state(false);
	let contactSearchTimer: ReturnType<typeof setTimeout> | null = null;

	// ── Assignees ───────────────────────────────────────────────────────────────
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let assignedToId = $state('');
	let notifyAssignee = $state(false);
	const assignedToName = $derived(assignees.find((a) => a.id === assignedToId)?.full_name ?? '');

	// ── Form fields ─────────────────────────────────────────────────────────────
	let title = $state('');
	let jobType = $state('');
	let tags = $state<string[]>([]);
	let scopeOfWork = $state('');
	let visitNotes = $state('');
	let status = $state<'scheduled' | 'in_progress' | 'completed'>('scheduled');
	let anytime = $state(false);
	let scheduledStart = $state('');
	let scheduledEnd = $state('');

	let addrLine1 = $state('');
	let addrLine2 = $state('');
	let addrCity = $state('');
	let addrState = $state('');
	let addrZip = $state('');

	// ── Line items & pricing ─────────────────────────────────────────────────────
	let lineItems = $state<QuoteLineDraft[]>([]);
	let discountType = $state<'none' | 'fixed' | 'percent'>('none');
	let discountValue = $state('');
	let discountLabel = $state('');
	let taxRatePct = $state(''); // percentage as typed (e.g. "8.25"); converted to rate on save

	// ── UI state ────────────────────────────────────────────────────────────────
	let errors = $state<Record<string, string>>({});
	let globalError = $state('');
	let saving = $state(false);

	// ── Derived ─────────────────────────────────────────────────────────────────
	const scopeCharsLeft = $derived(10000 - scopeOfWork.length);

	// Totals — mirror recalcJobTotals (discount before tax, clamps) for a live preview.
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

	const estimatedDuration = $derived.by(() => {
		if (!scheduledStart || !scheduledEnd || anytime) return null;
		const start = new Date(scheduledStart);
		const end = new Date(scheduledEnd);
		const diffMs = end.getTime() - start.getTime();
		if (diffMs <= 0) return null;
		const totalMins = Math.round(diffMs / 60000);
		const hrs = Math.floor(totalMins / 60);
		const mins = totalMins % 60;
		if (hrs === 0) return `Est. ${mins} min`;
		if (mins === 0) return `Est. ${hrs} hr${hrs > 1 ? 's' : ''}`;
		return `Est. ${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min`;
	});

	const mapsUrl = $derived.by(() => {
		const parts = [addrLine1, addrCity, addrState, addrZip].filter(Boolean).join(', ');
		if (!parts) return null;
		return `https://maps.google.com/?q=${encodeURIComponent(parts)}`;
	});

	function initials(name: string): string {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}

	// ── Quick date shortcuts ────────────────────────────────────────────────────
	function setDateQuick(offsetDays: number) {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const existingTime = scheduledStart?.split('T')[1] || '09:00';
		scheduledStart = `${dateStr}T${existingTime}`;
	}

	// ── Contact search ──────────────────────────────────────────────────────────
	function onContactInput(value: string) {
		contactQuery = value;
		if (contactSearchTimer) clearTimeout(contactSearchTimer);
		if (value.trim().length < 2) {
			contactResults = [];
			return;
		}
		contactSearchTimer = setTimeout(async () => {
			contactSearching = true;
			try {
				const res = await fetch(`/api/contacts?q=${encodeURIComponent(value.trim())}`);
				if (!res.ok) return;
				const body = (await res.json()) as { items: ContactHit[] };
				contactResults = body.items.slice(0, 8);
			} finally {
				contactSearching = false;
			}
		}, 250);
	}

	function pickContact(c: ContactHit) {
		selectedContact = c;
		contactQuery = c.full_name;
		contactResults = [];
		errors = { ...errors, contact: '' };
	}

	function clearContact() {
		selectedContact = null;
		contactQuery = '';
		contactResults = [];
	}

	// ── Save ────────────────────────────────────────────────────────────────────
	async function save() {
		errors = {};
		globalError = '';

		const contactId = data.fromQuoteId ? prefill?.contact_id : selectedContact?.id;
		if (!contactId) {
			errors = { ...errors, contact: 'Please select a contact.' };
			return;
		}
		if (!title.trim()) {
			errors = { ...errors, title: 'Job title is required.' };
			return;
		}
		if (scheduledEnd && scheduledStart && new Date(scheduledEnd) < new Date(scheduledStart)) {
			errors = { ...errors, scheduledEnd: 'End must be after start.' };
			return;
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = {
				contact_id: contactId,
				title: title.trim(),
				status
			};
			if (prefill?.opportunity_id) payload.opportunity_id = prefill.opportunity_id;
			if (assignedToId) payload.assigned_to = assignedToId;
			if (jobType.trim()) payload.job_type = jobType.trim();
			if (tags.length > 0) payload.tags = tags;
			if (!anytime) {
				if (scheduledStart) payload.scheduled_start = new Date(scheduledStart).toISOString();
				if (scheduledEnd) payload.scheduled_end = new Date(scheduledEnd).toISOString();
			}
			if (scopeOfWork.trim()) payload.scope_of_work = scopeOfWork.trim();
			if (visitNotes.trim()) payload.notes = visitNotes.trim();
			if (addrLine1.trim()) payload.service_address_line_1 = addrLine1.trim();
			if (addrLine2.trim()) payload.service_address_line_2 = addrLine2.trim();
			if (addrCity.trim()) payload.service_address_city = addrCity.trim();
			if (addrState.trim()) payload.service_address_state = addrState.trim();
			if (addrZip.trim()) payload.service_address_zip = addrZip.trim();

			// Pricing
			payload.tax_rate = taxRate;
			if (discountType !== 'none') {
				payload.discount_type = discountType;
				payload.discount_value = Number(discountValue) || 0;
				if (discountLabel.trim()) payload.discount_label = discountLabel.trim();
			}

			// Line items — drop blank rows; server coerces numeric strings + recomputes totals.
			const lines = lineItems
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
			if (lines.length > 0) payload.line_items = lines;

			const res = await fetch('/api/jobs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as {
				job?: { id: string };
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok || !body.job) {
				globalError = body.error ?? 'Could not create job.';
				if (body.field_errors) errors = { ...errors, ...body.field_errors };
				return;
			}
			toast.success('Job created successfully');
			await goto(`/jobs/${body.job.id}`);
		} catch {
			globalError = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}

	// ── Mount ───────────────────────────────────────────────────────────────────
	onMount(async () => {
		const tasks: Promise<void>[] = [];

		if (canAssign) {
			tasks.push(
				fetch('/api/contacts/assignees').then(async (res) => {
					if (!res.ok) return;
					const a = (await res.json()) as { assignees: { id: string; full_name: string }[] };
					assignees = a.assignees;
				})
			);
		}

		if (data.fromQuoteId) {
			prefillLoading = true;
			tasks.push(
				fetch(`/api/quotes/${data.fromQuoteId}/job-prefill`)
					.then(async (res) => {
						if (!res.ok) {
							globalError = 'Could not load quote data.';
							return;
						}
						const body = (await res.json()) as { data: PrefillData };
						prefill = body.data;
						title = prefill.title;
						visitNotes = prefill.notes ?? '';
						addrLine1 = prefill.service_address.line1 ?? '';
						addrLine2 = prefill.service_address.line2 ?? '';
						addrCity = prefill.service_address.city ?? '';
						addrState = prefill.service_address.state ?? '';
						addrZip = prefill.service_address.zip ?? '';
						// Pricing snapshot
						discountType = (prefill.discount_type as typeof discountType) ?? 'none';
						discountValue = prefill.discount_value ?? '';
						discountLabel = prefill.discount_label ?? '';
						const rate = Number(prefill.tax_rate);
						taxRatePct = rate > 0 ? String(Math.round(rate * 10000) / 100) : '';
						// Snapshot-copy the quote's lines into the editable job line editor.
						lineItems = prefill.line_items.map((li) => ({
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
					})
					.catch(() => {
						globalError = 'Could not load quote data.';
					})
					.finally(() => {
						prefillLoading = false;
					})
			);
		}

		await Promise.all(tasks);
	});
</script>

<svelte:head><title>New Job</title></svelte:head>

<PageWrapper title="New Job" back="/jobs">
	{#snippet actions()}
		<Button onclick={save} disabled={saving} class="hidden min-h-[44px] lg:inline-flex">
			{#if saving}
				<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
				Creating…
			{:else}
				<Briefcase class="mr-1.5 h-4 w-4" />
				Create Job
			{/if}
		</Button>
	{/snippet}

	<div class="grid gap-6 pb-28 lg:grid-cols-[1fr_320px] lg:pb-6">
		<!-- ── LEFT COLUMN: Main content ────────────────────────────────────── -->
		<div class="space-y-4">
			<!-- Job title -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="space-y-1.5">
					<Label for="job-title">Job title <span class="text-destructive">*</span></Label>
					<Input
						id="job-title"
						bind:value={title}
						placeholder="e.g. Fence repair, Lawn cleanup, HVAC tune-up"
						class="h-11 text-base"
					/>
					{#if errors.title}
						<p class="text-sm text-destructive">{errors.title}</p>
					{/if}
				</div>
			</div>

			<!-- Schedule -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Calendar class="h-4 w-4 text-muted-foreground" />
						<h3 class="text-sm font-semibold text-foreground">Schedule</h3>
					</div>
					<span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">One-off job</span>
				</div>

				<div class="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
					<div>
						<p class="text-sm font-medium text-foreground">All day / Anytime</p>
						<p class="text-xs text-muted-foreground">No specific time window needed</p>
					</div>
					<Switch id="anytime-switch" bind:checked={anytime} />
				</div>

				{#if !anytime}
					<div class="mt-4 space-y-2">
						<p class="text-xs font-medium text-muted-foreground">Quick select</p>
						<div class="flex flex-wrap gap-2">
							{#each [{ label: 'Today', offset: 0 }, { label: 'Tomorrow', offset: 1 }, { label: 'In 2 days', offset: 2 }, { label: 'Next week', offset: 7 }] as s}
								<button
									type="button"
									onclick={() => setDateQuick(s.offset)}
									class="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95"
								>
									{s.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<div class="space-y-1.5">
							<Label>Start date & time</Label>
							<DateTimePicker bind:value={scheduledStart} placeholder="Pick start" />
						</div>
						<div class="space-y-1.5">
							<Label>End date & time</Label>
							<DateTimePicker bind:value={scheduledEnd} placeholder="Pick end" />
							{#if errors.scheduledEnd}
								<p class="text-xs text-destructive">{errors.scheduledEnd}</p>
							{/if}
						</div>
					</div>

					{#if estimatedDuration}
						<div class="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
							<Clock class="h-3.5 w-3.5" />
							{estimatedDuration}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Line items & pricing -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="mb-4 flex items-center gap-2">
					<Briefcase class="h-4 w-4 text-muted-foreground" />
					<h3 class="text-sm font-semibold text-foreground">Products & Services</h3>
				</div>

				{#if prefillLoading && data.fromQuoteId}
					<SkeletonLoader lines={3} />
				{:else}
					<LineItemEditor bind:lineItems enableCatalog enableOptional={false} />

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
							{#if errors.discount_value}
								<p class="text-xs text-destructive">{errors.discount_value}</p>
							{/if}
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
							<Label for="tax-rate">Tax rate (%)</Label>
							<Input
								id="tax-rate"
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

					<div class="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
						<dl class="space-y-1.5 text-sm">
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Subtotal</dt>
								<dd class="tabular-nums">{formatCurrency(subtotal)}</dd>
							</div>
							{#if discountAmount > 0}
								<div class="flex justify-between">
									<dt class="text-emerald-600 dark:text-emerald-400">
										{discountLabel.trim() || 'Discount'}{discountType === 'percent' && Number(discountValue) > 0 ? ` (${Number(discountValue)}%)` : ''}
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
				{/if}
			</div>

			<!-- Scope of work -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<Label for="scope-field">Scope of work</Label>
						<span class={cn('text-xs tabular-nums', scopeCharsLeft < 500 ? 'text-destructive' : 'text-muted-foreground')}>
							{scopeCharsLeft.toLocaleString()} left
						</span>
					</div>
					<Textarea
						id="scope-field"
						bind:value={scopeOfWork}
						rows={5}
						placeholder="Crew-facing details — materials, process, access, anything the line items don't capture…"
					/>
				</div>
			</div>

			<!-- Visit instructions -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="space-y-1.5">
					<Label for="notes-field">Visit instructions</Label>
					<p class="text-xs text-muted-foreground">Internal — visible to your team only, not the client</p>
					<Textarea
						id="notes-field"
						bind:value={visitNotes}
						rows={3}
						placeholder="Access code, parking notes, gate code, client preferences…"
					/>
				</div>
			</div>

			<!-- Status -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="space-y-1.5">
					<Label>Status</Label>
					<Select.Root bind:value={status}>
						<Select.Trigger class="h-11 w-full">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="scheduled">Scheduled</Select.Item>
							<Select.Item value="in_progress">In progress</Select.Item>
							<Select.Item value="completed">Completed</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			{#if globalError}
				<div class="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{globalError}
				</div>
			{/if}
		</div>

		<!-- ── RIGHT SIDEBAR ────────────────────────────────────────────────── -->
		<div class="space-y-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
			<!-- Provenance badge -->
			{#if data.fromQuoteId}
				{#if prefillLoading}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<SkeletonLoader lines={2} />
					</div>
				{:else if prefill}
					<div
						class="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
					>
						<FileText class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
						<p class="text-sm font-medium text-amber-800 dark:text-amber-200">
							From Quote <span class="font-semibold">{prefill.quote_number_display}</span>
						</p>
					</div>
				{/if}
			{/if}

			<!-- Client section -->
			{#if data.fromQuoteId}
				{#if prefillLoading}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<SkeletonLoader lines={3} />
					</div>
				{:else if prefill}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<p
							class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
						>
							Client
						</p>
						<div class="flex items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary"
							>
								{initials(prefill.contact_name)}
							</div>
							<div class="min-w-0 space-y-1">
								<p class="truncate font-semibold text-foreground">{prefill.contact_name}</p>
								{#if prefill.contact_phone}
									<a
										href="tel:{prefill.contact_phone}"
										class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
									>
										<Phone class="h-3.5 w-3.5 shrink-0" />
										{prefill.contact_phone}
									</a>
								{/if}
								{#if prefill.contact_email}
									<div class="flex min-w-0 items-center gap-1.5">
										<Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										<span class="truncate text-sm text-muted-foreground"
											>{prefill.contact_email}</span
										>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Contact search for manual creation -->
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<p class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
						Client <span class="text-destructive">*</span>
					</p>
					{#if selectedContact}
						<div
							class="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{selectedContact.full_name}</p>
								{#if selectedContact.phone}
									<p class="truncate text-xs text-muted-foreground">{selectedContact.phone}</p>
								{/if}
							</div>
							<Button variant="ghost" size="sm" onclick={clearContact}>Change</Button>
						</div>
					{:else}
						<div class="relative">
							<Search
								class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								placeholder="Search by name or phone"
								value={contactQuery}
								oninput={(e) => onContactInput((e.target as HTMLInputElement).value)}
								class="h-11 pl-9"
							/>
							{#if contactResults.length > 0}
								<ul
									class="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-dropdown"
								>
									{#each contactResults as c (c.id)}
										<li>
											<button
												type="button"
												class="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
												onclick={() => pickContact(c)}
											>
												<span class="text-sm font-medium">{c.full_name}</span>
												{#if c.phone}
													<span class="text-xs text-muted-foreground">{c.phone}</span>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{:else if contactSearching}
								<p class="mt-1.5 text-xs text-muted-foreground">Searching…</p>
							{/if}
						</div>
					{/if}
					{#if errors.contact}
						<p class="mt-1.5 text-sm text-destructive">{errors.contact}</p>
					{/if}
				</div>
			{/if}

			<!-- Service address -->
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<div class="mb-3 flex items-center justify-between">
					<p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
						Service Address
					</p>
					{#if mapsUrl}
						<a
							href={mapsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
						>
							<ExternalLink class="h-3 w-3" />
							Open in Maps
						</a>
					{/if}
				</div>
				<div class="space-y-2">
					<Input placeholder="Address line 1" bind:value={addrLine1} class="h-9 text-sm" />
					<Input
						placeholder="Address line 2 (optional)"
						bind:value={addrLine2}
						class="h-9 text-sm"
					/>
					<div class="grid grid-cols-2 gap-2">
						<Input placeholder="City" bind:value={addrCity} class="h-9 text-sm" />
						<Input placeholder="State" bind:value={addrState} class="h-9 text-sm" />
					</div>
					<Input placeholder="ZIP code" bind:value={addrZip} class="h-9 text-sm" />
				</div>
				{#if prefillLoading && data.fromQuoteId}
					<div class="mt-3">
						<SkeletonLoader lines={2} />
					</div>
				{/if}
			</div>

			<!-- Job type & tags -->
			<div class="space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-card">
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
				<div class="space-y-2 border-t border-border/50 pt-4">
					<Label class="flex items-center gap-1.5">
						<Tag class="h-3.5 w-3.5 text-muted-foreground" /> Tags
					</Label>
					<JobTagsEditor bind:value={tags} />
				</div>
			</div>

			<!-- Assigned technician -->
			{#if canAssign}
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<Label class="mb-2 block">Assigned technician</Label>
					{#if assignedToId && assignedToName}
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<span
									class="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary"
								>
									<User class="h-3.5 w-3.5" />
									{assignedToName}
									<button
										type="button"
										onclick={() => { assignedToId = ''; notifyAssignee = false; }}
										class="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20"
										aria-label="Remove assignee"
									>
										<X class="h-3 w-3" />
									</button>
								</span>
							</div>
							<div class="flex items-center gap-2">
								<Switch id="notify-switch" bind:checked={notifyAssignee} />
								<Label for="notify-switch" class="cursor-pointer text-sm text-muted-foreground">
									Notify {assignedToName} when job is created
								</Label>
							</div>
						</div>
					{:else}
						<Select.Root bind:value={assignedToId}>
							<Select.Trigger class="h-11 w-full">
								<Select.Value placeholder="Select a team member" />
							</Select.Trigger>
							<Select.Content>
								{#each assignees as a (a.id)}
									<Select.Item value={a.id}>{a.full_name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</PageWrapper>

<!-- Mobile sticky action bar -->
<div
	class="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-20 flex gap-3 border-t border-border/80 bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden"
>
	<Button variant="outline" class="flex-1" onclick={() => goto('/jobs')} disabled={saving}>
		Cancel
	</Button>
	<Button class="flex-1" onclick={save} disabled={saving}>
		{#if saving}<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />{/if}
		{saving ? 'Creating…' : 'Create Job'}
	</Button>
</div>