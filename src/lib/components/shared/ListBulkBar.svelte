<script module lang="ts">
	// One declarative action in the floating bulk bar. Each entity's page hands in
	// its own list (Delete, Export, Assign…) — the bar only renders + dispatches.
	export type BulkAction = {
		key: string;
		label: string;
		icon: string;
		/** Visual accent. 'danger'/'warning' recolor the label; 'default' is neutral. */
		tone?: 'default' | 'danger' | 'warning';
		disabled?: boolean;
		/** When true the action shows a spinner (in place of its icon) and its label swaps to
		 * `loadingLabel` — for actions that run immediately without a confirm dialog. */
		loading?: boolean;
		loadingLabel?: string;
		onSelect: () => void;
	};
</script>

<script lang="ts">
	// The ONE floating bulk-action bar for every list page (Contacts, Jobs, Quotes…).
	// It shows the selected count, a cancel button, and a declarative row of actions.
	// Kept dumb: all state (what's selected, what each action does, whether a request
	// is in flight) lives in the page; the bar just renders and calls back.
	let {
		count,
		actions,
		busy = false,
		onCancel
	}: {
		count: number;
		actions: BulkAction[];
		/** Disables every action while a bulk request is running. */
		busy?: boolean;
		onCancel: () => void;
	} = $props();

	function toneColor(tone: BulkAction['tone']): string | undefined {
		if (tone === 'danger') return 'var(--danger-solid)';
		if (tone === 'warning') return 'var(--warning-text)';
		return undefined;
	}
</script>

<div class="bulk-bar">
	<div class="bulk-bar__inner">
		<button type="button" aria-label="Cancel selection" class="bulk-bar__cancel" onclick={onCancel}>
			<i class="ri-close-line" aria-hidden="true"></i>
		</button>
		<span class="bulk-bar__count">{count} selected</span>
		<div class="bulk-bar__actions">
			{#each actions as action (action.key)}
				<button
					type="button"
					class="btn btn--ghost btn--sm"
					style:color={toneColor(action.tone)}
					disabled={busy || action.disabled}
					onclick={action.onSelect}
				>
					{#if action.loading}
						<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
						{action.loadingLabel ?? action.label}
					{:else}
						<i class={action.icon} aria-hidden="true"></i>
						{action.label}
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>
