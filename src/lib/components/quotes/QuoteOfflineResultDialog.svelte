<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';

	type Mode = 'accepted' | 'declined';
	type OptionalLine = { id: string; description: string; total: string; package_id: string | null };
	type PackageOption = { id: string; name: string; is_recommended: boolean; total: string };

	let {
		open = $bindable(false),
		mode,
		quote,
		onDone
	}: {
		open?: boolean;
		mode: Mode;
		quote: { id: string; quote_number_display: string; contact_name: string } | null;
		onDone: (status: Mode) => void;
	} = $props();

	const declineReasons = [
		{ value: 'price', label: 'Price is too high' },
		{ value: 'competitor', label: 'Going with someone else' },
		{ value: 'timing', label: "Timing isn't right" },
		{ value: 'scope', label: 'Scope changed' },
		{ value: 'other', label: 'Other' }
	] as const;

	let busy = $state(false);
	let loadingDetail = $state(false);
	let optionalLines = $state<OptionalLine[]>([]);
	let selected = $state<Record<string, boolean>>({});
	// Good-Better-Best: the quote's tiers (empty on a simple quote) + which one the contractor
	// confirms the customer accepted.
	let packages = $state<PackageOption[]>([]);
	let selectedPackageId = $state<string | null>(null);
	const isTiered = $derived(packages.length > 0);
	// On a tiered quote only the selected tier's add-ons are selectable; on a simple quote all.
	const visibleOptional = $derived(
		isTiered ? optionalLines.filter((l) => l.package_id === selectedPackageId) : optionalLines
	);
	let declineReason = $state<(typeof declineReasons)[number]['value'] | null>(null);
	let declineNote = $state('');
	let errorMsg = $state<string | null>(null);

	// Reset per-open, and for accept mode lazily load the quote's optional add-ons so the
	// contractor can record exactly which ones the customer agreed to.
	$effect(() => {
		if (!open || !quote) return;
		errorMsg = null;
		busy = false;
		if (mode === 'accepted') {
			optionalLines = [];
			selected = {};
			packages = [];
			selectedPackageId = null;
			loadingDetail = true;
			const id = quote.id;
			void (async () => {
				try {
					const res = await fetch(`/api/quotes/${id}`);
					const body = await res.json().catch(() => ({}));
					if (res.ok) {
						const lines = (body.data?.line_items ?? []) as Array<{
							id: string;
							description: string;
							total: string;
							is_optional: boolean;
							package_id: string | null;
						}>;
						optionalLines = lines
							.filter((l) => l.is_optional)
							.map((l) => ({
								id: l.id,
								description: l.description,
								total: l.total,
								package_id: l.package_id ?? null
							}));
						const pkgs = (body.data?.packages ?? []) as PackageOption[];
						packages = pkgs;
						if (pkgs.length > 0) {
							selectedPackageId = (pkgs.find((p) => p.is_recommended) ?? pkgs[0]).id;
						}
					}
				} catch {
					// Non-fatal — fall back to accepting the base quote with no add-ons.
				} finally {
					loadingDetail = false;
				}
			})();
		} else {
			declineReason = null;
			declineNote = '';
		}
	});

	async function submit() {
		if (!quote || busy) return;
		busy = true;
		errorMsg = null;
		try {
			if (mode === 'accepted') {
				const selected_optional_ids = visibleOptional.filter((l) => selected[l.id]).map((l) => l.id);
				const res = await fetch(`/api/quotes/${quote.id}/mark-accepted`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ selected_optional_ids, selected_package_id: selectedPackageId })
				});
				const body = await res.json().catch(() => ({}));
				if (!res.ok) {
					errorMsg = body.error ?? 'Failed to mark accepted';
					return;
				}
				toast.success(`${quote.quote_number_display} marked accepted`);
				onDone('accepted');
				open = false;
			} else {
				if (!declineReason) {
					errorMsg = 'Please choose a reason.';
					return;
				}
				const res = await fetch(`/api/quotes/${quote.id}/mark-declined`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ reason: declineReason, note: declineNote.trim() || undefined })
				});
				const body = await res.json().catch(() => ({}));
				if (!res.ok) {
					errorMsg = body.error ?? 'Failed to mark declined';
					return;
				}
				toast.success(`${quote.quote_number_display} marked declined`);
				onDone('declined');
				open = false;
			}
		} catch {
			errorMsg = 'Network error';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content showClose={false}>
		<div class="dialog-content__header">
			<div>
				<Dialog.Title class="dialog-content__title">
					{mode === 'accepted' ? 'Mark accepted' : 'Mark declined'}
				</Dialog.Title>
				{#if quote}
					<Dialog.Description class="dialog-content__description">
						{#if mode === 'accepted'}
							Record that {quote.contact_name} approved {quote.quote_number_display} offline (by phone
							or in person). This wins the linked deal.
						{:else}
							Record that {quote.contact_name} declined {quote.quote_number_display} offline. This marks
							the linked deal as lost.
						{/if}
					</Dialog.Description>
				{/if}
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="dialog-content__body">
			{#if mode === 'accepted'}
				{#if loadingDetail}
					<p class="quote-offline__loading">Loading quote…</p>
				{:else}
					{#if isTiered}
						<div class="quote-offline__section">
							<p class="quote-offline__prompt">Which package did they choose?</p>
							<div class="quote-offline__list">
								{#each packages as pkg (pkg.id)}
									<label class="quote-offline__option quote-offline__option--between">
										<span class="quote-offline__option-main">
											<input
												type="radio"
												name="offline-package"
												value={pkg.id}
												bind:group={selectedPackageId}
												class="quote-offline__check"
											/>
											<span class="quote-offline__option-desc">
												{pkg.name}{#if pkg.is_recommended}<span class="quote-offline__pkg-rec">
														· Recommended</span
													>{/if}
											</span>
										</span>
										<span class="quote-offline__option-amount">{formatCurrency(pkg.total)}</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}
					{#if visibleOptional.length > 0}
					<div class="quote-offline__section">
						<p class="quote-offline__prompt">Which add-ons did they approve?</p>
						<ul class="quote-offline__list">
							{#each visibleOptional as line (line.id)}
								<li>
									<label class="quote-offline__option quote-offline__option--between">
										<span class="quote-offline__option-main">
											<input
												type="checkbox"
												bind:checked={selected[line.id]}
												class="quote-offline__check"
											/>
											<span class="quote-offline__option-desc">{line.description}</span>
										</span>
										<span class="quote-offline__option-amount">{formatCurrency(line.total)}</span>
									</label>
								</li>
							{/each}
						</ul>
						<p class="quote-offline__hint">
							Leave add-ons unchecked if the customer only approved the base quote.
						</p>
					</div>
					{/if}
				{/if}
			{:else}
				<div class="quote-offline__section">
					<p class="quote-offline__prompt">
						Reason <span class="quote-offline__req">*</span>
					</p>
					<div class="quote-offline__list">
						{#each declineReasons as r (r.value)}
							<label class="quote-offline__option">
								<input
									type="radio"
									name="decline-reason"
									value={r.value}
									bind:group={declineReason}
									class="quote-offline__check"
								/>
								<span class="quote-offline__option-desc">{r.label}</span>
							</label>
						{/each}
					</div>
					<textarea
						bind:value={declineNote}
						maxlength="2000"
						rows="2"
						placeholder="Add a note (optional)"
						class="quote-offline__note"
					></textarea>
				</div>
			{/if}

			{#if errorMsg}
				<p class="quote-offline__error">{errorMsg}</p>
			{/if}
		</div>

		<div class="dialog-content__footer">
			<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>
				Cancel
			</Button>
			<Button
				variant={mode === 'declined' ? 'destructive' : 'default'}
				loading={busy}
				disabled={loadingDetail}
				onclick={submit}
			>
				{#if mode === 'accepted'}
					<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
				{:else}
					<i class="ri-close-circle-line" aria-hidden="true"></i>
				{/if}
				{mode === 'accepted' ? 'Mark accepted' : 'Mark declined'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
