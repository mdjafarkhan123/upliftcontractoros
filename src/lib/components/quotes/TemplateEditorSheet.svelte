<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import LineItemEditor from './LineItemEditor.svelte';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { quoteTemplatesStore } from '$lib/stores/quoteTemplates.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteTemplateDetail, QuoteLineDraft } from '$lib/types/quotes';

	let {
		open = $bindable(false),
		templateId = null,
		onSaved
	}: {
		open?: boolean;
		templateId?: string | null;
		onSaved?: () => void;
	} = $props();

	const mode = $derived<'create' | 'edit'>(templateId ? 'edit' : 'create');

	let name = $state('');
	let description = $state('');
	let lineItems = $state<QuoteLineDraft[]>([]);
	let loadingDetail = $state(false);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	const subtotal = $derived(
		lineItems.reduce((s, li) => {
			if (li.is_optional) return s;
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);

	function reset() {
		name = '';
		description = '';
		lineItems = [];
		fieldErrors = {};
	}

	$effect(() => {
		if (!open) return;
		fieldErrors = {};
		if (templateId) {
			void loadDetail(templateId);
		} else {
			reset();
		}
	});

	async function loadDetail(id: string) {
		loadingDetail = true;
		try {
			const res = await fetch(`/api/quote-templates/${id}`);
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to load template');
				open = false;
				return;
			}
			const tpl = body.data as QuoteTemplateDetail;
			name = tpl.name;
			description = tpl.description ?? '';
			lineItems = tpl.line_items.map((li) => ({
				client_id: crypto.randomUUID(),
				description: li.description,
				details: li.details ?? null,
				quantity: li.quantity,
				unit: li.unit ?? '',
				section_label: li.section_label ?? null,
				is_optional: li.is_optional ?? false,
				unit_price: li.unit_price
			}));
		} catch {
			toast.error('Network error');
			open = false;
		} finally {
			loadingDetail = false;
		}
	}

	async function save() {
		fieldErrors = {};
		if (!name.trim()) {
			fieldErrors.name = 'Name is required';
			return;
		}
		for (const li of lineItems) {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!li.description.trim()) {
				toast.error('Every line item needs a title');
				return;
			}
			if (!Number.isFinite(q) || q <= 0) {
				toast.error('Every line item needs a quantity greater than 0');
				return;
			}
			if (!Number.isFinite(p) || p < 0) {
				toast.error('Unit price cannot be negative');
				return;
			}
		}

		saving = true;
		try {
			const payload = {
				name: name.trim(),
				description: description.trim() || null,
				line_items: lineItems.map((li, idx) => ({
					description: li.description.trim(),
					details: li.details?.trim() || null,
					quantity: Number(li.quantity),
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					is_optional: li.is_optional ?? false,
					unit_price: Number(li.unit_price),
					position: idx
				}))
			};
			const url = mode === 'edit' ? `/api/quote-templates/${templateId}` : '/api/quote-templates';
			const method = mode === 'edit' ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to save template');
				return;
			}
			await quoteTemplatesStore.refetch();
			toast.success(mode === 'edit' ? 'Template updated' : 'Template created');
			onSaved?.();
			open = false;
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-xl md:w-[640px]">
		<Sheet.Header class="border-b border-border px-5 py-4">
			<Sheet.Title>{mode === 'edit' ? 'Edit template' : 'New template'}</Sheet.Title>
		</Sheet.Header>

		<div class="flex-1 overflow-y-auto px-5 py-5">
			{#if loadingDetail}
				<p class="text-sm text-muted-foreground">Loading template…</p>
			{:else}
				<div class="grid gap-5">
					<div class="grid gap-2">
						<Label for="tpl-name">Name <span class="text-destructive">*</span></Label>
						<Input id="tpl-name" bind:value={name} placeholder="e.g. Standard roof replacement" />
						{#if fieldErrors.name}
							<p class="text-xs text-destructive">{fieldErrors.name}</p>
						{/if}
					</div>

					<div class="grid gap-2">
						<Label for="tpl-desc">Description</Label>
						<Textarea
							id="tpl-desc"
							bind:value={description}
							rows={3}
							placeholder="Optional internal description"
						/>
					</div>

					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<h2 class="text-sm font-semibold">Line items</h2>
							<span class="text-xs text-muted-foreground">
								{lineItems.length} item{lineItems.length === 1 ? '' : 's'}
							</span>
						</div>
						<LineItemEditor bind:lineItems enableOptional />
					</div>
				</div>
			{/if}
		</div>

		<div
			class="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
		>
			<div class="text-sm">
				<span class="text-muted-foreground">Subtotal</span>
				<span class="ml-2 font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" disabled={saving} onclick={() => (open = false)}>Cancel</Button>
				<JetEngineButton
					label={mode === 'edit' ? 'Save changes' : 'Create template'}
					loadingLabel="Saving…"
					successLabel="Saved"
					state={saving ? 'loading' : 'idle'}
					onclick={save}
				/>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
