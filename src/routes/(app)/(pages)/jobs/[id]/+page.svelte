<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import JobStatusBadge from '$lib/components/jobs/JobStatusBadge.svelte';
	import JobScheduleSection from '$lib/components/jobs/JobScheduleSection.svelte';
	import JobScopeSection from '$lib/components/jobs/JobScopeSection.svelte';
	import JobLineItemsSection from '$lib/components/jobs/JobLineItemsSection.svelte';
	import JobLinksSection from '$lib/components/jobs/JobLinksSection.svelte';
	import JobUpcomingAppointments from '$lib/components/jobs/JobUpcomingAppointments.svelte';
	import JobReviewIndicator from '$lib/components/jobs/JobReviewIndicator.svelte';
	import JobClientCard from '$lib/components/jobs/JobClientCard.svelte';
	import JobTagsEditor from '$lib/components/jobs/JobTagsEditor.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { SUGGESTED_JOB_TYPES } from '$lib/jobs/jobMeta';
	import { getMemberContext } from '$lib/context/member';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import { formatCurrency } from '$lib/utils/format';
	import type { JobDetail, JobStatus } from '$lib/types/jobs';
	import type { QuoteLineDraft } from '$lib/types/quotes';
	import MediaGallery from '$lib/components/media/MediaGallery.svelte';
	import {
		Briefcase,
		Calendar,
		CheckCircle2,
		Clock,
		ExternalLink,
		Loader2,
		Play,
		Tag,
		User,
		X,
		XCircle
	} from '@lucide/svelte';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const id = $derived(data.id);

	$effect(() => {
		void jobDetailStore.load(id);
	});

	const job = $derived(jobDetailStore.get(id));
	const seed = $derived(jobsStore.getById(id));
	const loadingCold = $derived(jobDetailStore.isLoading(id) && !seed);
	const errorMsg = $derived(jobDetailStore.getError(id));

	const canFullPipeline = $derived(member().can_view_full_pipeline);
	const canEdit = $derived.by(() => {
		const m = member();
		if (!job) return false;
		if (m.can_view_full_pipeline) return true;
		if (m.can_view_assigned_jobs) return job.assigned_to === m.id;
		return false;
	});
	const canCancel = $derived(member().can_view_full_pipeline);
	const canInvoice = $derived(member().can_create_invoices);

	const headerVM = $derived.by(() => {
		if (job)
			return { contact_name: job.contact_name, title: job.title, status: job.status };
		if (seed)
			return { contact_name: seed.contact_name, title: seed.title, status: seed.status };
		return null;
	});

	// ── Assignees ────────────────────────────────────────────────────────────────
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let assigneesLoaded = $state(false);
	$effect(() => {
		if (!canFullPipeline || assigneesLoaded) return;
		assigneesLoaded = true;
		void fetch('/api/contacts/assignees').then(async (r) => {
			if (!r.ok) return;
			const a = (await r.json()) as { assignees: { id: string; full_name: string }[] };
			assignees = a.assignees;
		});
	});

	// ── Form state (for inline editing) ─────────────────────────────────────────
	let title = $state('');
	let assignedTo = $state('');
	let scheduledStart = $state('');
	let scheduledEnd = $state('');
	let anytime = $state(false);
	let scopeOfWork = $state('');
	let notes = $state('');
	let jobType = $state('');
	let tags = $state<string[]>([]);
	let lineItems = $state<QuoteLineDraft[]>([]);
	let discountType = $state<'none' | 'fixed' | 'percent'>('none');
	let discountValue = $state('');
	let discountLabel = $state('');
	let taxRatePct = $state('');
	let addrLine1 = $state('');
	let addrLine2 = $state('');
	let addrCity = $state('');
	let addrState = $state('');
	let addrZip = $state('');

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

	function resetFormFromJob(j: JobDetail) {
		title = j.title;
		assignedTo = j.assigned_to ?? '';
		scheduledStart = toInputValue(j.scheduled_start);
		scheduledEnd = toInputValue(j.scheduled_end);
		anytime = false;
		scopeOfWork = j.scope_of_work ?? '';
		notes = j.notes ?? '';
		jobType = j.job_type ?? '';
		tags = [...(j.tags ?? [])];
		lineItems = draftsFromJob(j);
		discountType = (j.discount_type as 'none' | 'fixed' | 'percent') ?? 'none';
		discountValue = j.discount_value ?? '';
		discountLabel = j.discount_label ?? '';
		taxRatePct = rateToPct(j.tax_rate);
		addrLine1 = j.service_address_line_1 ?? '';
		addrLine2 = j.service_address_line_2 ?? '';
		addrCity = j.service_address_city ?? '';
		addrState = j.service_address_state ?? '';
		addrZip = j.service_address_zip ?? '';
	}

	// Init form when job first loads; re-init on job-id navigation
	let loadedJobId = $state<string | null>(null);
	$effect(() => {
		const j = job;
		if (!j || j.id === loadedJobId) return;
		resetFormFromJob(j);
		loadedJobId = j.id;
	});

	// ── Edit mode ────────────────────────────────────────────────────────────────
	let isEditing = $state(false);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let initialSnapshot = $state('');

	function currentSnapshot() {
		return JSON.stringify({
			title,
			assignedTo,
			scheduledStart,
			scheduledEnd,
			anytime,
			scopeOfWork,
			notes,
			jobType,
			tags: [...tags].sort().join(','),
			lineItems: JSON.stringify($state.snapshot(lineItems)),
			discountType,
			discountValue,
			discountLabel,
			taxRatePct,
			addrLine1,
			addrLine2,
			addrCity,
			addrState,
			addrZip
		});
	}

	const isDirty = $derived.by(() => {
		if (!isEditing) return false;
		return currentSnapshot() !== initialSnapshot;
	});

	function startEdit() {
		initialSnapshot = currentSnapshot();
		isEditing = true;
		saveError = null;
	}

	function discard() {
		if (job) resetFormFromJob(job);
		isEditing = false;
		saveError = null;
	}

	// Live totals for edit mode
	const editSubtotal = $derived(
		lineItems.reduce((sum, li) => {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return sum;
			return sum + Math.round(q * p * 100) / 100;
		}, 0)
	);
	const editDiscountAmount = $derived.by(() => {
		if (discountType === 'none') return 0;
		const v = Number(discountValue);
		if (!Number.isFinite(v) || v <= 0) return 0;
		if (discountType === 'percent')
			return Math.round(((editSubtotal * Math.min(v, 100)) / 100) * 100) / 100;
		return Math.min(Math.max(v, 0), editSubtotal);
	});
	const editTaxRate = $derived(Number(taxRatePct) > 0 ? Number(taxRatePct) / 100 : 0);
	const editDiscountedBase = $derived(
		Math.max(0, Math.round((editSubtotal - editDiscountAmount) * 100) / 100)
	);
	const editTaxAmount = $derived(Math.round(editDiscountedBase * editTaxRate * 100) / 100);
	const editTotal = $derived(Math.round((editDiscountedBase + editTaxAmount) * 100) / 100);

	const scopeCharsLeft = $derived(10000 - scopeOfWork.length);

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

	function setDateQuick(offsetDays: number) {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const existingTime = scheduledStart?.split('T')[1] || '09:00';
		scheduledStart = `${dateStr}T${existingTime}`;
	}

	async function saveEdits() {
		if (!job) return;
		saving = true;
		saveError = null;
		try {
			const taxRate = Number(taxRatePct) > 0 ? Number(taxRatePct) / 100 : 0;
			const payload: Record<string, unknown> = {
				title: title.trim(),
				scheduled_start: !anytime && scheduledStart ? new Date(scheduledStart).toISOString() : null,
				scheduled_end: !anytime && scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
				notes: notes.trim() || null,
				scope_of_work: scopeOfWork.trim() || null,
				job_type: jobType.trim() || null,
				tags,
				service_address_line_1: addrLine1.trim() || null,
				service_address_line_2: addrLine2.trim() || null,
				service_address_city: addrCity.trim() || null,
				service_address_state: addrState.trim() || null,
				service_address_zip: addrZip.trim() || null,
				tax_rate: taxRate,
				discount_type: discountType
			};

			if (canFullPipeline) payload.assigned_to = assignedTo || null;
			if (discountType !== 'none') {
				payload.discount_value = Number(discountValue) || 0;
				payload.discount_label = discountLabel.trim() || null;
			}

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

			const res = await fetch(`/api/jobs/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok) {
				saveError = body.error ?? 'Could not save.';
				toast.error(saveError ?? 'Could not save.');
				return;
			}

			const updatedAssigneeName =
				canFullPipeline && assignedTo
					? (assignees.find((a) => a.id === assignedTo)?.full_name ?? job.assignee_name)
					: canFullPipeline
						? null
						: job.assignee_name;

			const merged: JobDetail = { ...job, ...body.job, assignee_name: updatedAssigneeName };
			jobDetailStore.set(id, merged);
			jobsStore.update({
				id: merged.id,
				title: merged.title,
				status: merged.status,
				assigned_to: merged.assigned_to,
				assignee_name: merged.assignee_name,
				scheduled_start: merged.scheduled_start,
				scheduled_end: merged.scheduled_end
			});
			initialSnapshot = currentSnapshot();
			isEditing = false;
			toast.success('Job saved');
		} catch {
			saveError = 'Network error. Try again.';
			toast.error('Network error. Try again.');
		} finally {
			saving = false;
		}
	}

	// ── Status transitions ────────────────────────────────────────────────────────
	let actionLoading = $state(false);
	let completeOpen = $state(false);
	let cancelOpen = $state(false);
	let actionError = $state<string | null>(null);

	async function transition(next: JobStatus) {
		if (!job) return;
		actionLoading = true;
		actionError = null;
		try {
			const res = await fetch(`/api/jobs/${id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			const body = await res.json();
			if (!res.ok) {
				actionError = body.error ?? 'Could not update status.';
				return;
			}
			const merged: JobDetail = { ...job, ...body.job };
			jobDetailStore.set(id, merged);
			jobsStore.update({
				id: merged.id,
				title: merged.title,
				status: merged.status,
				assigned_to: merged.assigned_to,
				assignee_name: merged.assignee_name,
				scheduled_start: merged.scheduled_start,
				scheduled_end: merged.scheduled_end
			});
			// Keep form in sync after status transition
			resetFormFromJob(merged);
			loadedJobId = merged.id;
		} finally {
			actionLoading = false;
		}
	}

	// ── Confirm dialogs (lazy) ───────────────────────────────────────────────────
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!(completeOpen || cancelOpen) || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	// ── Nav guard ────────────────────────────────────────────────────────────────
	beforeNavigate(({ cancel }) => {
		if (isDirty && !saving) {
			if (!confirm('You have unsaved changes. Leave anyway?')) cancel();
		}
	});

	const showStart = $derived(canEdit && job?.status === 'scheduled');
	const showComplete = $derived(
		canEdit && (job?.status === 'scheduled' || job?.status === 'in_progress')
	);
	const showCancel = $derived(
		canCancel && (job?.status === 'scheduled' || job?.status === 'in_progress')
	);
	const showActions = $derived(!isEditing && (showStart || showComplete || showCancel));
	const isTerminal = $derived(
		job?.status === 'completed' || job?.status === 'cancelled'
	);

	const mapsUrl = $derived.by(() => {
		if (!job) return null;
		const parts = [
			job.service_address_line_1,
			job.service_address_city,
			job.service_address_state,
			job.service_address_zip
		]
			.filter(Boolean)
			.join(', ');
		return parts ? `https://maps.google.com/?q=${encodeURIComponent(parts)}` : null;
	});
</script>

<svelte:head><title>{headerVM?.title ?? 'Job'}</title></svelte:head>

<PageWrapper back="/jobs">
	{#snippet actions()}
		{#if isEditing}
			<Button
				variant="ghost"
				onclick={discard}
				disabled={saving}
				class="min-h-[44px] text-muted-foreground"
			>
				Discard
			</Button>
			<Button onclick={saveEdits} disabled={saving || !isDirty} class="min-h-[44px]">
				{#if saving}
					<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
					Saving…
				{:else}
					Save Changes
				{/if}
			</Button>
		{:else if headerVM && canEdit && !isTerminal}
			<Button variant="outline" onclick={startEdit} class="min-h-[44px]">Edit</Button>
		{/if}
	{/snippet}

	{#if loadingCold}
		<SkeletonLoader lines={6} height="92px" label="Loading job" />
	{:else if errorMsg && !job}
		<EmptyState title="Couldn't load job" description={errorMsg ?? 'Unknown error.'} />
	{:else if headerVM}
		{@const h = headerVM}

		<!-- Job title + status banner -->
		<div class="mb-6">
			{#if isEditing}
				<div class="space-y-1.5">
					<Label for="job-title-edit">Job title <span class="text-destructive">*</span></Label>
					<Input
						id="job-title-edit"
						bind:value={title}
						placeholder="e.g. Fence repair, Lawn cleanup, HVAC tune-up"
						class="h-11 text-base font-medium"
					/>
				</div>
			{:else}
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs font-medium text-muted-foreground">{h.contact_name}</p>
						<h1 class="mt-0.5 text-xl font-semibold leading-tight text-foreground">{h.title}</h1>
					</div>
					<JobStatusBadge status={h.status} />
				</div>
			{/if}
		</div>

		<!-- Two-column layout -->
		<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
			<!-- ── LEFT COLUMN ─────────────────────────────────────────────────── -->
			<div class="space-y-4">
				<!-- Schedule -->
				{#if isEditing}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="mb-4 flex items-center gap-2">
							<Calendar class="h-4 w-4 text-muted-foreground" />
							<h2 class="text-sm font-semibold text-foreground">Schedule</h2>
						</div>

						<div
							class="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3"
						>
							<div>
								<p class="text-sm font-medium text-foreground">All day / Anytime</p>
								<p class="text-xs text-muted-foreground">No specific time window needed</p>
							</div>
							<Switch bind:checked={anytime} />
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
								</div>
							</div>

							{#if estimatedDuration}
								<div class="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
									<Clock class="h-3.5 w-3.5" />
									{estimatedDuration}
								</div>
							{/if}
						{/if}

						{#if canFullPipeline}
							<div class="mt-5 space-y-2 border-t border-border/50 pt-4">
								<Label>Assigned technician</Label>
								{#if assignedTo}
									{@const name = assignees.find((a) => a.id === assignedTo)?.full_name ?? assignedTo}
									<div class="flex items-center gap-2">
										<span
											class="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary"
										>
											<User class="h-3.5 w-3.5" />
											{name}
											<button
												type="button"
												onclick={() => (assignedTo = '')}
												class="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20"
												aria-label="Remove assignee"
											>
												<X class="h-3 w-3" />
											</button>
										</span>
									</div>
								{:else}
									<Select.Root bind:value={assignedTo}>
										<Select.Trigger class="h-11 w-full">
											<Select.Value placeholder="Select a team member" />
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="">Unassigned</Select.Item>
											{#each assignees as a (a.id)}
												<Select.Item value={a.id}>{a.full_name}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								{/if}
							</div>
						{/if}
					</div>
				{:else if job}
					<JobScheduleSection
						scheduled_start={job.scheduled_start}
						scheduled_end={job.scheduled_end}
						assignee_name={job.assignee_name}
					/>
				{/if}

				<!-- Scope of work + Notes -->
				{#if isEditing}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<Label for="scope-field">Scope of work</Label>
								<span
									class={cn(
										'text-xs tabular-nums',
										scopeCharsLeft < 500 ? 'text-destructive' : 'text-muted-foreground'
									)}
								>
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

					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="space-y-1.5">
							<Label for="notes-field">Visit instructions</Label>
							<p class="text-xs text-muted-foreground">
								Internal — visible to your team only, not the client
							</p>
							<Textarea
								id="notes-field"
								bind:value={notes}
								rows={3}
								placeholder="Access code, parking notes, gate code, client preferences…"
							/>
						</div>
					</div>
				{:else if job}
					<JobScopeSection scope_of_work={job.scope_of_work} notes={job.notes} />
				{/if}

				<!-- Line items & pricing -->
				{#if isEditing}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="mb-4 flex items-center gap-2">
							<Briefcase class="h-4 w-4 text-muted-foreground" />
							<h2 class="text-sm font-semibold text-foreground">Products & Services</h2>
						</div>

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
								<Label for="tax-rate-edit">Tax rate (%)</Label>
								<Input
									id="tax-rate-edit"
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
									<dd class="tabular-nums">{formatCurrency(editSubtotal)}</dd>
								</div>
								{#if editDiscountAmount > 0}
									<div class="flex justify-between">
										<dt class="text-emerald-600 dark:text-emerald-400">
											{discountLabel.trim() || 'Discount'}{discountType === 'percent' &&
											Number(discountValue) > 0
												? ` (${Number(discountValue)}%)`
												: ''}
										</dt>
										<dd class="tabular-nums text-emerald-600 dark:text-emerald-400">
											−{formatCurrency(editDiscountAmount)}
										</dd>
									</div>
								{/if}
								<div class="flex justify-between">
									<dt class="text-muted-foreground">
										Tax ({(editTaxRate * 100).toFixed(2)}%)
									</dt>
									<dd class="tabular-nums">{formatCurrency(editTaxAmount)}</dd>
								</div>
								<div
									class="flex justify-between border-t border-border pt-1.5 text-base font-semibold"
								>
									<dt>Total</dt>
									<dd class="tabular-nums">{formatCurrency(editTotal)}</dd>
								</div>
							</dl>
						</div>
					</div>
				{:else if job}
					<JobLineItemsSection {job} {canInvoice} />
				{/if}

				<!-- Upcoming appointments (always visible) -->
				{#if job}
					<JobUpcomingAppointments jobId={job.id} />
				{:else}
					<SkeletonLoader lines={3} height="64px" />
				{/if}

				<!-- Photos & attachments (always visible) -->
				{#if job}
					<MediaGallery
						jobId={job.id}
						canUpload={member().can_upload_files}
						canDelete={member().can_upload_files}
					/>
				{/if}
			</div>

			<!-- ── RIGHT SIDEBAR ───────────────────────────────────────────────── -->
			<div
				class="space-y-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start"
			>
				<!-- Client card (always visible) -->
				{#if job}
					<JobClientCard
						contact_id={job.contact_id}
						contact_name={job.contact_name}
						contact_phone={job.contact_phone}
						contact_email={job.contact_email}
						service_address_line_1={job.service_address_line_1}
						service_address_line_2={job.service_address_line_2}
						service_address_city={job.service_address_city}
						service_address_state={job.service_address_state}
						service_address_zip={job.service_address_zip}
					/>
				{:else}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<SkeletonLoader lines={3} />
					</div>
				{/if}

				<!-- Service address editor (edit mode only) -->
				{#if isEditing}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="mb-3 flex items-center justify-between">
							<p
								class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
							>
								Service Address
							</p>
							{#if mapsUrl}
								<a
									href={mapsUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
								>
									<ExternalLink class="h-3 w-3" /> Open in Maps
								</a>
							{/if}
						</div>
						<div class="space-y-2">
							<Input
								placeholder="Address line 1"
								bind:value={addrLine1}
								class="h-9 text-sm"
							/>
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
					</div>
				{/if}

				<!-- Status + actions (view mode only, non-terminal) -->
				{#if job && !isEditing}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="flex items-center justify-between gap-3">
							<p
								class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
							>
								Status
							</p>
							<JobStatusBadge status={job.status} />
						</div>

						{#if job.review_request_status !== undefined}
							<div class="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
								<span class="text-xs text-muted-foreground">Review request</span>
								<JobReviewIndicator
									jobId={job.id}
									jobStatus={job.status}
									status={job.review_request_status}
									onSent={(next) => {
										jobDetailStore.patch(id, (prev) => ({
											...prev,
											review_request_status: next
										}));
									}}
								/>
							</div>
						{/if}

						{#if actionError}
							<p class="mt-2 text-sm text-destructive">{actionError}</p>
						{/if}

						{#if showActions}
							<div class="mt-3 grid gap-2 border-t border-border/50 pt-3">
								{#if showStart}
									<JetEngineButton
										class="w-full"
										label="Start job"
										loadingLabel="Starting…"
										successLabel="Started"
										state={actionLoading ? 'loading' : 'idle'}
										onclick={() => void transition('in_progress')}
									>
										{#snippet icon()}<Play class="h-4 w-4" />{/snippet}
									</JetEngineButton>
								{/if}
								{#if showComplete}
									<JetEngineButton
										variant="outline"
										class="w-full border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
										label="Mark complete"
										loadingLabel="Saving…"
										successLabel="Complete"
										state={actionLoading ? 'loading' : 'idle'}
										onclick={() => (completeOpen = true)}
									>
										{#snippet icon()}<CheckCircle2 class="h-4 w-4" />{/snippet}
									</JetEngineButton>
								{/if}
								{#if showCancel}
									<JetEngineButton
										variant="outline"
										class="w-full border-rose-500/40 text-rose-700 hover:bg-rose-500/10"
										label="Cancel job"
										loadingLabel="Cancelling…"
										successLabel="Cancelled"
										state={actionLoading ? 'loading' : 'idle'}
										onclick={() => (cancelOpen = true)}
									>
										{#snippet icon()}<XCircle class="h-4 w-4" />{/snippet}
									</JetEngineButton>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Job info (type, tags) -->
				{#if job}
					{#if isEditing}
						<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
							<div class="space-y-4">
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
									<Input
										bind:value={jobType}
										placeholder="Or type a custom job type"
										class="h-9 text-sm"
									/>
								</div>
								<div class="space-y-2 border-t border-border/50 pt-4">
									<Label class="flex items-center gap-1.5">
										<Tag class="h-3.5 w-3.5 text-muted-foreground" /> Tags
									</Label>
									<JobTagsEditor bind:value={tags} />
								</div>
							</div>
						</div>
					{:else}
						{@const hasInfo = job.job_type || job.tags?.length > 0 || job.assignee_name}
						{#if hasInfo}
							<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
								<p
									class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
								>
									Job Info
								</p>
								{#if job.job_type}
									<div class="mb-2 flex items-center gap-2 text-sm">
										<Briefcase class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										<span class="text-foreground">{job.job_type}</span>
									</div>
								{/if}
								{#if job.assignee_name}
									<div class="mb-2 flex items-center gap-2 text-sm">
										<User class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										<span class="text-foreground">{job.assignee_name}</span>
									</div>
								{/if}
								{#if job.tags?.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#each job.tags as tag (tag)}
											<span
												class="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-xs font-medium text-accent-foreground"
											>
												{tag}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				{/if}

				<!-- Related links (view mode only) -->
				{#if job && !isEditing}
					<JobLinksSection
						job_id={job.id}
						contact_id={job.contact_id}
						contact_name={job.contact_name}
						job_title={job.title}
						opportunity_id={job.opportunity_id}
						invoice_count={job.invoice_count}
						appointment_count={job.appointment_count}
					/>
				{/if}
			</div>
		</div>

		<!-- Confirm dialogs -->
		{#if job && ConfirmDialog}
			<ConfirmDialog
				bind:open={completeOpen}
				title="Mark job complete?"
				description="A review request will be triggered for the customer."
				confirmLabel="Mark complete"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('completed');
				}}
			/>
			<ConfirmDialog
				bind:open={cancelOpen}
				title="Cancel this job?"
				description="The job will be marked cancelled. This action cannot be undone."
				confirmLabel="Cancel job"
				variant="destructive"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('cancelled');
				}}
			/>
		{/if}
	{:else}
		<EmptyState title="Couldn't load job" description={errorMsg ?? 'Unknown error.'} />
	{/if}

	<!-- Mobile save bar (visible when editing) -->
	{#if isEditing}
		<div
			class="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-20 flex gap-3 border-t border-border/80 bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden"
		>
			<Button
				variant="outline"
				class="flex-1"
				onclick={discard}
				disabled={saving}
			>
				Discard
			</Button>
			<Button class="flex-1" onclick={saveEdits} disabled={saving || !isDirty}>
				{#if saving}
					<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
					Saving…
				{:else}
					Save Changes
				{/if}
			</Button>
		</div>
	{/if}
</PageWrapper>
