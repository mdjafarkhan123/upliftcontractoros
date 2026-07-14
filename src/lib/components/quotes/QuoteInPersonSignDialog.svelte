<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';

	type OptionalLine = {
		id: string;
		description: string;
		total: string;
		taxable: boolean;
		package_id: string | null;
	};
	type RequiredLine = { total: string; taxable: boolean; package_id: string | null };
	type PackageOption = { id: string; name: string; is_recommended: boolean; total: string };

	let {
		open = $bindable(false),
		quote,
		onDone
	}: {
		open?: boolean;
		quote: { id: string; quote_number_display: string; contact_name: string } | null;
		onDone: () => void;
	} = $props();

	// ── Steps ──────────────────────────────────────────────────────────────────
	// 'review' lets the customer confirm the tier / add-ons; skipped on a plain quote with
	// nothing to choose. 'sign' is the signature pad.
	let step = $state<'review' | 'sign'>('review');

	let loadingDetail = $state(false);
	let requiredLines = $state<RequiredLine[]>([]);
	let optionalLines = $state<OptionalLine[]>([]);
	let selected = $state<Record<string, boolean>>({});
	let packages = $state<PackageOption[]>([]);
	let selectedPackageId = $state<string | null>(null);
	// Quote-level financials, needed to present the exact binding total (mirrors the server).
	let discountType = $state('none');
	let discountValue = $state<number>(0);
	let taxRate = $state<number>(0);

	let signerName = $state('');
	let errorMsg = $state<string | null>(null);
	let busy = $state(false);

	const isTiered = $derived(packages.length > 0);
	// On a tiered quote only the selected tier's lines count; on a simple quote all of them.
	const visibleRequired = $derived(
		isTiered ? requiredLines.filter((l) => l.package_id === selectedPackageId) : requiredLines
	);
	const visibleOptional = $derived(
		isTiered ? optionalLines.filter((l) => l.package_id === selectedPackageId) : optionalLines
	);
	// A review step is only worth showing when there's actually something to choose.
	const needsReview = $derived(isTiered || optionalLines.length > 0);

	// ── Money: identical math to /api/quotes/[id]/sign-in-person so the presented total is exact.
	function toCents(s: string): number {
		return Math.round(Number(s) * 100);
	}
	const totals = $derived.by(() => {
		const chosenOptional = visibleOptional.filter((l) => selected[l.id]);
		const baseCents = visibleRequired.reduce((sum, l) => sum + toCents(l.total), 0);
		const optCents = chosenOptional.reduce((sum, l) => sum + toCents(l.total), 0);
		const subtotalCents = baseCents + optCents;
		const taxableSubtotalCents =
			visibleRequired.reduce((sum, l) => sum + (l.taxable ? toCents(l.total) : 0), 0) +
			chosenOptional.reduce((sum, l) => sum + (l.taxable ? toCents(l.total) : 0), 0);

		let discountCents = 0;
		if (discountType === 'percent' && discountValue > 0) {
			discountCents = Math.round((subtotalCents * Math.min(discountValue, 100)) / 100);
		} else if (discountType === 'fixed' && discountValue > 0) {
			discountCents = Math.min(Math.round(discountValue * 100), subtotalCents);
		}
		const discountedSubtotalCents = subtotalCents - discountCents;
		const taxableAfterDiscountCents =
			subtotalCents > 0
				? (taxableSubtotalCents * discountedSubtotalCents) / subtotalCents
				: 0;
		const taxCents = Math.round(taxableAfterDiscountCents * taxRate);
		const totalCents = discountedSubtotalCents + taxCents;
		return {
			subtotal: subtotalCents / 100,
			discount: discountCents / 100,
			tax: taxCents / 100,
			total: totalCents / 100
		};
	});

	// Load the quote's tiers, required + optional lines, and financials on open.
	$effect(() => {
		if (!open || !quote) return;
		errorMsg = null;
		busy = false;
		step = 'review';
		requiredLines = [];
		optionalLines = [];
		selected = {};
		packages = [];
		selectedPackageId = null;
		signerName = quote.contact_name ?? '';
		clearPad();
		loadingDetail = true;
		const id = quote.id;
		void (async () => {
			try {
				const res = await fetch(`/api/quotes/${id}`);
				const body = await res.json().catch(() => ({}));
				if (res.ok) {
					const d = body.data;
					discountType = d?.discount_type ?? 'none';
					discountValue = Number(d?.discount_value ?? 0) || 0;
					taxRate = Number(d?.tax_rate ?? 0) || 0;
					const lines = (d?.line_items ?? []) as Array<{
						id: string;
						description: string;
						total: string;
						taxable?: boolean;
						is_optional?: boolean;
						package_id?: string | null;
					}>;
					requiredLines = lines
						.filter((l) => !l.is_optional)
						.map((l) => ({
							total: l.total,
							taxable: l.taxable !== false,
							package_id: l.package_id ?? null
						}));
					optionalLines = lines
						.filter((l) => l.is_optional)
						.map((l) => ({
							id: l.id,
							description: l.description,
							total: l.total,
							taxable: l.taxable !== false,
							package_id: l.package_id ?? null
						}));
					const pkgs = (d?.packages ?? []) as PackageOption[];
					packages = pkgs;
					if (pkgs.length > 0) {
						selectedPackageId = (pkgs.find((p) => p.is_recommended) ?? pkgs[0]).id;
					}
					// Nothing to choose → jump straight to signing.
					if (!(pkgs.length > 0 || optionalLines.length > 0)) step = 'sign';
				} else {
					errorMsg = body.error ?? 'Could not load the quote.';
				}
			} catch {
				errorMsg = 'Could not load the quote.';
			} finally {
				loadingDetail = false;
			}
		})();
	});

	// ── Signature pad ────────────────────────────────────────────────────────────
	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = false;
	let hasDrawn = $state(false);

	// Prepare the drawing surface at device pixel ratio for a crisp line whenever the pad mounts
	// (i.e. once we're on the sign step).
	$effect(() => {
		if (step !== 'sign' || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		const c = canvas.getContext('2d');
		if (!c) return;
		c.scale(dpr, dpr);
		c.lineWidth = 2.5;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.strokeStyle = '#0f172a';
		ctx = c;
		hasDrawn = false;
	});

	function point(e: PointerEvent): { x: number; y: number } {
		const rect = canvas!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}
	function start(e: PointerEvent) {
		if (!ctx) return;
		drawing = true;
		canvas!.setPointerCapture(e.pointerId);
		const p = point(e);
		ctx.beginPath();
		ctx.moveTo(p.x, p.y);
	}
	function move(e: PointerEvent) {
		if (!drawing || !ctx) return;
		const p = point(e);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
		hasDrawn = true;
	}
	function end(e: PointerEvent) {
		if (!drawing) return;
		drawing = false;
		try {
			canvas!.releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}
	}
	function clearPad() {
		if (ctx && canvas) {
			const dpr = window.devicePixelRatio || 1;
			ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
		}
		hasDrawn = false;
	}
	function toBlob(): Promise<Blob | null> {
		return new Promise((resolve) => canvas!.toBlob((b) => resolve(b), 'image/png'));
	}

	function goToSign() {
		errorMsg = null;
		step = 'sign';
	}

	async function submit() {
		if (!quote || busy) return;
		errorMsg = null;
		const name = signerName.trim();
		if (name.length < 2) {
			errorMsg = 'Enter the customer’s full name.';
			return;
		}
		if (!hasDrawn) {
			errorMsg = 'Please sign in the box above.';
			return;
		}
		busy = true;
		try {
			// 1) Upload the drawn signature as a quote_signature media row.
			const blob = await toBlob();
			if (!blob) throw new Error('Could not read the signature.');
			const fd = new FormData();
			fd.append('file', new File([blob], 'signature.png', { type: 'image/png' }));
			fd.append('purpose_tag', 'quote_signature');
			fd.append('quote_id', quote.id);
			const upRes = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const upBody = await upRes.json().catch(() => ({}));
			if (!upRes.ok) {
				errorMsg = upBody.error ?? 'Could not save the signature.';
				return;
			}
			const signatureMediaId = upBody.data.id as string;

			// 2) Record the acceptance, binding the signature + chosen tier / add-ons.
			const selected_optional_ids = visibleOptional.filter((l) => selected[l.id]).map((l) => l.id);
			const res = await fetch(`/api/quotes/${quote.id}/sign-in-person`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					signer_name: name,
					signature_media_id: signatureMediaId,
					selected_package_id: selectedPackageId,
					selected_optional_ids
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not record the acceptance.';
				return;
			}
			toast.success(`${quote.quote_number_display} approved & signed`);
			onDone();
			open = false;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Network error';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content showClose={false} class="dialog-content dialog-content--wide">
		<div class="dialog-content__header">
			<div>
				<Dialog.Title class="dialog-content__title">Sign in person</Dialog.Title>
				{#if quote}
					<Dialog.Description class="dialog-content__description">
						Hand your device to {quote.contact_name} to approve {quote.quote_number_display} on the spot.
					</Dialog.Description>
				{/if}
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="dialog-content__body quote-sign__body">
			{#if loadingDetail}
				<p class="quote-sign__loading">
					<i class="ri-loader-4-line quote-sign__spin" aria-hidden="true"></i> Loading quote…
				</p>
			{:else if step === 'review'}
				{#if isTiered}
					<div class="quote-sign__section">
						<p class="quote-sign__prompt">Which package would you like?</p>
						<div class="quote-sign__list">
							{#each packages as pkg (pkg.id)}
								<label
									class="quote-sign__option quote-sign__option--between"
									class:quote-sign__option--active={selectedPackageId === pkg.id}
								>
									<span class="quote-sign__option-main">
										<input
											type="radio"
											name="sign-package"
											value={pkg.id}
											bind:group={selectedPackageId}
											class="quote-sign__check"
										/>
										<span class="quote-sign__option-desc">
											{pkg.name}{#if pkg.is_recommended}<span class="quote-sign__pkg-rec"
													> · Recommended</span
												>{/if}
										</span>
									</span>
									<span class="quote-sign__option-amount">{formatCurrency(pkg.total)}</span>
								</label>
							{/each}
						</div>
					</div>
				{/if}

				{#if visibleOptional.length > 0}
					<div class="quote-sign__section">
						<p class="quote-sign__prompt">Add-ons</p>
						<ul class="quote-sign__list">
							{#each visibleOptional as line (line.id)}
								<li>
									<label class="quote-sign__option quote-sign__option--between">
										<span class="quote-sign__option-main">
											<input
												type="checkbox"
												bind:checked={selected[line.id]}
												class="quote-sign__check"
											/>
											<span class="quote-sign__option-desc">{line.description}</span>
										</span>
										<span class="quote-sign__option-amount">+{formatCurrency(line.total)}</span>
									</label>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{:else}
				<!-- Sign step -->
				<div class="quote-sign__field">
					<label class="quote-sign__label" for="quote-signer-name">Full name</label>
					<input
						id="quote-signer-name"
						class="quote-sign__name-input"
						bind:value={signerName}
						maxlength="200"
						placeholder="Customer’s full name"
						autocomplete="off"
					/>
				</div>

				<div class="quote-sign__field">
					<div class="quote-sign__pad-head">
						<label class="quote-sign__label" for="quote-sign-pad">Signature</label>
						<button
							type="button"
							class="quote-sign__clear"
							onclick={clearPad}
							disabled={!hasDrawn || busy}
						>
							<i class="ri-eraser-line" aria-hidden="true"></i> Clear
						</button>
					</div>
					<canvas
						id="quote-sign-pad"
						bind:this={canvas}
						class="quote-sign__pad"
						onpointerdown={start}
						onpointermove={move}
						onpointerup={end}
						onpointercancel={end}
						onpointerleave={end}
					></canvas>
				</div>

				<p class="quote-sign__ack">
					By signing, {signerName.trim() || 'the customer'} agrees to this quote and authorizes the work
					described.
				</p>
			{/if}

			{#if errorMsg}
				<p class="quote-sign__error">{errorMsg}</p>
			{/if}
		</div>

		{#if !loadingDetail}
			<div class="dialog-content__footer quote-sign__footer">
				<div class="quote-sign__total">
					<span class="quote-sign__total-label">Total</span>
					<span class="quote-sign__total-value">{formatCurrency(totals.total)}</span>
				</div>
				<div class="quote-sign__actions">
					{#if step === 'sign' && needsReview}
						<Button variant="ghost" onclick={() => (step = 'review')} disabled={busy}>
							Back
						</Button>
					{/if}
					{#if step === 'review'}
						<Button onclick={goToSign}>
							Continue
							<i class="ri-arrow-right-line" aria-hidden="true"></i>
						</Button>
					{:else}
						<Button loading={busy} loadingLabel="Saving…" onclick={submit}>
							<i class="ri-checkbox-circle-line" aria-hidden="true"></i> Approve &amp; sign
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
