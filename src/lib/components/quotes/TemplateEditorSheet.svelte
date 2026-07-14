<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import LineItemEditor from './LineItemEditor.svelte';
	import { Button } from '$lib/components/ui/button';
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
				taxable: li.taxable ?? true,
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
					taxable: li.taxable ?? true,
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
	<Sheet.Content side="right" class="sheet-form tpl-editor">
		<div class="sheet-form__header">
			<Sheet.Title class="sheet-form__title">
				<i class="ri-file-list-3-line" aria-hidden="true"></i>
				{mode === 'edit' ? 'Edit template' : 'New template'}
			</Sheet.Title>
		</div>

		<div class="sheet-form__body">
			{#if loadingDetail}
				<p class="sheet-form__intro">Loading template…</p>
			{:else}
				<div class="field">
					<label for="tpl-name" class="field__label field__label--required">Name</label>
					<input
						id="tpl-name"
						class="field__input"
						bind:value={name}
						placeholder="e.g. Standard roof replacement"
					/>
					{#if fieldErrors.name}<p class="field__error">{fieldErrors.name}</p>{/if}
				</div>

				<div class="field">
					<label for="tpl-desc" class="field__label">Description</label>
					<textarea
						id="tpl-desc"
						class="field__textarea"
						bind:value={description}
						rows={3}
						placeholder="Optional internal description"
					></textarea>
				</div>

				<div class="tpl-editor__lines">
					<div class="tpl-editor__lines-head">
						<h2 class="tpl-editor__lines-title">Line items</h2>
						<span class="tpl-editor__lines-count">
							{lineItems.length} item{lineItems.length === 1 ? '' : 's'}
						</span>
					</div>
					<LineItemEditor bind:lineItems enableOptional enableTax />
				</div>
			{/if}
		</div>

		<div class="sheet-form__footer tpl-editor__footer">
			<div class="tpl-editor__subtotal">
				<span class="tpl-editor__subtotal-label">Subtotal</span>
				<span class="tpl-editor__subtotal-value">{formatCurrency(subtotal)}</span>
			</div>
			<div class="tpl-editor__actions">
				<Button variant="outline" disabled={saving} onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button
					loadingLabel="Saving…"
					successLabel="Saved"
					loading={saving}
					onclick={save}
				>
					{mode === 'edit' ? 'Save changes' : 'Create template'}
				</Button>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
