<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import type { ContactHit } from './contactPicker';

	let {
		selected = $bindable<ContactHit | null>(null),
		placeholder = 'Select a client — search by name or phone',
		invalid = false,
		onSelect,
		onClear
	}: {
		// The picked client (two-way bindable), or null when none.
		selected?: ContactHit | null;
		placeholder?: string;
		// Adds error styling to the field (e.g. a failed required-field check).
		invalid?: boolean;
		// Fired after a pick / clear so the host can run side-effects (address load,
		// notify-channel default, clearing its own error). The bindable already updated.
		onSelect?: (c: ContactHit) => void;
		onClear?: () => void;
	} = $props();

	let query = $state('');
	let results = $state<ContactHit[]>([]);
	let searching = $state(false);
	let open = $state(false);
	// The field wrapper — the floating results panel anchors to this. The panel is
	// portaled to <body> so it never grows the host or gets clipped by a popup's
	// overflow; `customAnchor` keeps it visually pinned under the input.
	let anchorEl = $state<HTMLElement | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let searchAbort: AbortController | null = null;

	// Empty query → the API returns the most recent contacts, so the picker shows a usable
	// list the instant the field is focused, then filters by name/phone as the user types.
	async function runSearch(q: string) {
		if (searchAbort) searchAbort.abort();
		const ctrl = new AbortController();
		searchAbort = ctrl;
		searching = true;
		try {
			const url = q ? `/api/contacts?q=${encodeURIComponent(q)}` : '/api/contacts';
			const res = await fetch(url, { signal: ctrl.signal });
			if (!res.ok) return;
			const body = (await res.json()) as { items: ContactHit[] };
			results = body.items.slice(0, 8);
		} catch {
			// noop — aborted or transient
		} finally {
			if (searchAbort === ctrl) searching = false;
		}
	}

	function onInput(value: string) {
		query = value;
		open = true;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void runSearch(value.trim()), 200);
	}

	function onFocus() {
		open = true;
		if (results.length === 0) void runSearch(query.trim());
	}

	function pick(c: ContactHit) {
		selected = c;
		query = c.full_name;
		results = [];
		open = false;
		onSelect?.(c);
	}

	function clear() {
		selected = null;
		query = '';
		results = [];
		open = false;
		onClear?.();
	}
</script>

{#if selected}
	<div class="contact-picker__selected">
		<div class="contact-picker__selected-info">
			<p class="contact-picker__selected-name">{selected.full_name}</p>
			{#if selected.phone}
				<p class="contact-picker__selected-phone">{selected.phone}</p>
			{/if}
		</div>
		<Button variant="ghost" size="sm" onclick={clear}>Change</Button>
	</div>
{:else}
	<PopoverPrimitive.Root bind:open>
		<div class="contact-picker">
			<div class="contact-picker__field" bind:this={anchorEl}>
				<i class="ri-search-line contact-picker__icon" aria-hidden="true"></i>
				<input
					class={['field__input', invalid && 'field__input--error']}
					{placeholder}
					value={query}
					oninput={(e) => onInput((e.target as HTMLInputElement).value)}
					onfocus={onFocus}
					onblur={() => setTimeout(() => (open = false), 120)}
				/>
			</div>

			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					customAnchor={anchorEl}
					side="bottom"
					align="start"
					sideOffset={4}
					trapFocus={false}
					interactOutsideBehavior="ignore"
					onOpenAutoFocus={(e) => e.preventDefault()}
					onCloseAutoFocus={(e) => e.preventDefault()}
					class="contact-picker-panel"
				>
					{#if searching}
						<p class="contact-picker-panel__status">
							<i class="ri-loader-4-line contact-picker-panel__spinner" aria-hidden="true"></i>
							Searching…
						</p>
					{:else if results.length > 0}
						<ul class="contact-picker-panel__results">
							{#each results as c (c.id)}
								<li>
									<button
										type="button"
										class="contact-picker-panel__result"
										onmousedown={(e) => e.preventDefault()}
										onclick={() => pick(c)}
									>
										<span class="contact-picker-panel__result-name">{c.full_name}</span>
										{#if c.phone}
											<span class="contact-picker-panel__result-phone">{c.phone}</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{:else if query.trim()}
						<p class="contact-picker-panel__status">No clients match "{query.trim()}"</p>
					{:else}
						<p class="contact-picker-panel__status">No clients yet</p>
					{/if}
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</div>
	</PopoverPrimitive.Root>
{/if}
