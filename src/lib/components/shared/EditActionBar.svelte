<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	// The ONE Save/Cancel pair used everywhere a block is being edited — in the page
	// header (so the commit controls stay reachable no matter how far you've scrolled)
	// AND inside the card footer. Detail pages (Quote / Invoice / Jobs) render this in
	// both spots wired to the same save/cancel + `saving` flag, so the two can never
	// drift. Styling lives in the global partial components/_edit-action-bar.scss.
	let {
		onSave,
		onCancel,
		saving = false,
		canSave = true,
		error = null,
		label,
		saveLabel = 'Save',
		savingLabel = 'Saving…',
		size = 'default',
		variant = 'plain'
	}: {
		onSave: () => void;
		onCancel: () => void;
		/** Save in flight — spins the Save button and disables both. */
		saving?: boolean;
		/** Dirty-guard: false disables Save (used by the Jobs section editors). */
		canSave?: boolean;
		/** Inline error text shown in the bar (so a failure is visible even when the card is scrolled away). */
		error?: string | null;
		/** Context chip, e.g. "Editing Details" — hidden under the tablet breakpoint. */
		label?: string;
		saveLabel?: string;
		savingLabel?: string;
		/** `default` = header/full size; `sm` = compact in-card footers. */
		size?: 'sm' | 'default';
		/** `card` adds a top divider + spacing for an in-card footer; `plain` for the header. */
		variant?: 'plain' | 'card';
	} = $props();

	const btnSize = $derived(size === 'sm' ? ('sm' as const) : ('default' as const));
</script>

<div
	class={['edit-action-bar', variant === 'card' && 'edit-action-bar--card']
		.filter(Boolean)
		.join(' ')}
>
	{#if error}
		<p class="edit-action-bar__error field__error" role="alert">{error}</p>
	{:else if label}
		<span class="edit-action-bar__label">{label}</span>
	{/if}
	<div class="edit-action-bar__btns">
		<Button variant="ghost" size={btnSize} disabled={saving} onclick={onCancel}>Cancel</Button>
		<Button
			size={btnSize}
			loading={saving}
			loadingLabel={savingLabel}
			disabled={!canSave}
			onclick={onSave}
		>
			{saveLabel}
		</Button>
	</div>
</div>
