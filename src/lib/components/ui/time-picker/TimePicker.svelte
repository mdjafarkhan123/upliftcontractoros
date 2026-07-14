<script lang="ts">
	// Time-only picker (Bits UI Popover + 30-minute slot list). Sibling of DateTimePicker /
	// Calendar; pairs with a Calendar when a job needs a date + separate start/end time (Jobber's
	// one-off schedule block). Binds a plain "HH:mm" 24h string, or '' when unset — so "date filled,
	// time empty" is representable, unlike the combined DateTimePicker which forces a time.
	import { tick, untrack } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';

	let {
		value = $bindable(''),
		placeholder = 'Select time',
		disabled = false,
		min = '',
		onValueChange,
		defaultScroll = '08:00',
		preferNow = false
	}: {
		// "HH:mm" 24h, or '' when unset.
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		// Earliest selectable "HH:mm"; slots before it are disabled (keeps an end ≥ its start).
		min?: string;
		// Fired after the value changes (pick or clear). Useful when the caller keeps the
		// time in a composed field and can't use `bind:value`.
		onValueChange?: (value: string) => void;
		// Where to scroll the list when opened with no value yet (cosmetic — all slots stay
		// selectable). Defaults to a sensible working-hours start.
		defaultScroll?: string;
		// When true and no value yet, scroll to the next half-hour from *now* instead of
		// `defaultScroll` (e.g. a time being picked for today). Computed fresh on open.
		preferNow?: boolean;
	} = $props();

	const pad = (n: number) => String(n).padStart(2, '0');

	let open = $state(false);
	let listEl = $state<HTMLDivElement | null>(null);

	const TIME_SLOTS: { value: string; label: string }[] = (() => {
		const slots: { value: string; label: string }[] = [];
		for (let h = 0; h < 24; h++) {
			for (const m of [0, 30]) {
				const hh = String(h).padStart(2, '0');
				const mm = String(m).padStart(2, '0');
				const period = h < 12 ? 'AM' : 'PM';
				const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
				slots.push({ value: `${hh}:${mm}`, label: `${dh}:${mm} ${period}` });
			}
		}
		return slots;
	})();

	// 12h label for any value, including an off-grid time (e.g. a saved 09:15) not in the slot list.
	function labelFor(v: string): string {
		const slot = TIME_SLOTS.find((s) => s.value === v);
		if (slot) return slot.label;
		const [hStr, mStr] = v.split(':');
		const h = Number(hStr);
		if (!Number.isFinite(h)) return '';
		const period = h < 12 ? 'AM' : 'PM';
		const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
		return `${dh}:${mStr} ${period}`;
	}

	let displayLabel = $derived(value ? labelFor(value) : '');

	// Next half-hour boundary from now, e.g. 2:47 → "15:00", 2:12 → "14:30".
	function nextHalfHour(): string {
		const d = new Date();
		d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	// On open, scroll to the selected slot (centred), or to the default position when empty,
	// mirroring DateTimePicker. All slots stay selectable — this is scroll-only.
	$effect(() => {
		if (!open) return;
		tick().then(() => {
			if (!listEl) return;
			const current = untrack(() => value);
			const target = current || (preferNow ? nextHalfHour() : defaultScroll) || '08:00';
			const el = listEl.querySelector<HTMLElement>(`[data-time="${target}"]`);
			if (!el) return;
			listEl.scrollTop = current
				? Math.max(0, el.offsetTop - listEl.clientHeight / 2 + el.clientHeight / 2)
				: el.offsetTop;
		});
	});

	function pick(v: string) {
		value = v;
		onValueChange?.(v);
		open = false;
	}

	function clear() {
		value = '';
		onValueChange?.('');
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				{disabled}
				class="tp__trigger"
				class:tp__trigger--empty={!value}
			>
				<i class="ri-time-line" aria-hidden="true"></i>
				<span>{displayLabel || placeholder}</span>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content
		align="start"
		side="bottom"
		sideOffset={8}
		collisionPadding={12}
		class="tp__popover"
	>
		<div class="tp__list" bind:this={listEl}>
			{#each TIME_SLOTS as slot (slot.value)}
				{@const belowMin = !!min && slot.value < min}
				<button
					type="button"
					data-time={slot.value}
					onclick={() => pick(slot.value)}
					disabled={belowMin}
					class="tp__time"
					class:tp__time--selected={slot.value === value}
				>
					{slot.label}
				</button>
			{/each}
		</div>
		{#if value}
			<button type="button" class="tp__clear" onclick={clear}>Clear</button>
		{/if}
	</Popover.Content>
</Popover.Root>
