<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { Loader2, CircleCheckBig, CircleX } from '@lucide/svelte';

	type Mode = 'accepted' | 'declined';
	type OptionalLine = { id: string; description: string; total: string };

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
						}>;
						optionalLines = lines
							.filter((l) => l.is_optional)
							.map((l) => ({ id: l.id, description: l.description, total: l.total }));
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
				const selected_optional_ids = optionalLines.filter((l) => selected[l.id]).map((l) => l.id);
				const res = await fetch(`/api/quotes/${quote.id}/mark-accepted`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ selected_optional_ids })
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
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{mode === 'accepted' ? 'Mark accepted' : 'Mark declined'}
			</Dialog.Title>
			{#if quote}
				<Dialog.Description>
					{#if mode === 'accepted'}
						Record that {quote.contact_name} approved {quote.quote_number_display} offline (by phone or
						in person). This wins the linked deal.
					{:else}
						Record that {quote.contact_name} declined {quote.quote_number_display} offline. This marks
						the linked deal as lost.
					{/if}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="space-y-4">
			{#if mode === 'accepted'}
				{#if loadingDetail}
					<p class="text-sm text-muted-foreground">Loading quote…</p>
				{:else if optionalLines.length > 0}
					<div class="space-y-2">
						<p class="text-sm font-medium text-foreground">Which add-ons did they approve?</p>
						<ul class="space-y-1.5">
							{#each optionalLines as line (line.id)}
								<li>
									<label
										class="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors hover:bg-muted/60"
									>
										<span class="flex min-w-0 items-center gap-2.5">
											<input
												type="checkbox"
												bind:checked={selected[line.id]}
												class="h-4 w-4 shrink-0 rounded border-border accent-primary"
											/>
											<span class="truncate text-foreground">{line.description}</span>
										</span>
										<span class="shrink-0 tabular-nums text-muted-foreground"
											>{formatCurrency(line.total)}</span
										>
									</label>
								</li>
							{/each}
						</ul>
						<p class="text-xs text-muted-foreground">
							Leave add-ons unchecked if the customer only approved the base quote.
						</p>
					</div>
				{/if}
			{:else}
				<div class="space-y-2">
					<p class="text-sm font-medium text-foreground">
						Reason <span class="text-destructive">*</span>
					</p>
					<div class="grid gap-1.5">
						{#each declineReasons as r (r.value)}
							<label
								class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors hover:bg-muted/60"
							>
								<input
									type="radio"
									name="decline-reason"
									value={r.value}
									bind:group={declineReason}
									class="h-4 w-4 shrink-0 accent-primary"
								/>
								<span class="text-foreground">{r.label}</span>
							</label>
						{/each}
					</div>
					<textarea
						bind:value={declineNote}
						maxlength="2000"
						rows="2"
						placeholder="Add a note (optional)"
						class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					></textarea>
				</div>
			{/if}

			{#if errorMsg}
				<p class="text-sm text-destructive">{errorMsg}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button
				variant={mode === 'declined' ? 'destructive' : 'default'}
				onclick={submit}
				disabled={busy || loadingDetail}
			>
				{#if busy}
					<Loader2 class="mr-1 h-4 w-4 animate-spin" />
				{:else if mode === 'accepted'}
					<CircleCheckBig class="mr-1 h-4 w-4" />
				{:else}
					<CircleX class="mr-1 h-4 w-4" />
				{/if}
				{mode === 'accepted' ? 'Mark accepted' : 'Mark declined'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
