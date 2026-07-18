<script lang="ts">
	// "Assessment completed" popup (Jobber's 10.jpg) — the funnel that opens the
	// moment an assessment is marked complete. Four exits: turn the request into a
	// Quote, into a Job, Archive it, or leave it as-is. The two Convert actions are
	// wired to real endpoints in R3.2; until then the page passes handlers that
	// explain they're coming and the rows carry a "Soon" chip.
	import * as Dialog from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		convertSoon = true,
		converting = null,
		onConvertQuote,
		onConvertJob,
		onArchive,
		onLeave
	}: {
		open?: boolean;
		convertSoon?: boolean;
		// Which convert action is in flight (shows a spinner + locks the dialog). The
		// parent keeps the dialog open during convert and navigates away on success.
		converting?: 'quote' | 'job' | null;
		onConvertQuote: () => void;
		onConvertJob: () => void;
		onArchive: () => void;
		onLeave: () => void;
	} = $props();

	const busy = $derived(converting !== null);

	// Convert rows stay open (the parent shows the spinner, then navigates); the
	// terminal choices (Archive / Leave) close the dialog immediately.
	function pick(fn: () => void) {
		open = false;
		fn();
	}
	function convert(fn: () => void) {
		if (busy) return;
		fn();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="request-convert">
		<Dialog.Header>
			<Dialog.Title>Assessment completed</Dialog.Title>
		</Dialog.Header>

		<div class="request-convert__list">
			<button
				type="button"
				class="request-convert__row"
				disabled={busy}
				onclick={() => convert(onConvertQuote)}
			>
				<span class="request-convert__icon request-convert__icon--quote">
					{#if converting === 'quote'}
						<i class="ri-loader-4-line request-convert__spin" aria-hidden="true"></i>
					{:else}
						<i class="ri-price-tag-3-line" aria-hidden="true"></i>
					{/if}
				</span>
				<span class="request-convert__label">Convert to Quote</span>
				{#if convertSoon}<span class="request-convert__chip">Soon</span>{/if}
			</button>

			<button
				type="button"
				class="request-convert__row"
				disabled={busy}
				onclick={() => convert(onConvertJob)}
			>
				<span class="request-convert__icon request-convert__icon--job">
					{#if converting === 'job'}
						<i class="ri-loader-4-line request-convert__spin" aria-hidden="true"></i>
					{:else}
						<i class="ri-hammer-line" aria-hidden="true"></i>
					{/if}
				</span>
				<span class="request-convert__label">Convert to Job</span>
				{#if convertSoon}<span class="request-convert__chip">Soon</span>{/if}
			</button>

			<button
				type="button"
				class="request-convert__row"
				disabled={busy}
				onclick={() => pick(onArchive)}
			>
				<span class="request-convert__icon">
					<i class="ri-archive-line" aria-hidden="true"></i>
				</span>
				<span class="request-convert__label">Archive</span>
			</button>

			<div class="request-convert__divider"></div>

			<button
				type="button"
				class="request-convert__row"
				disabled={busy}
				onclick={() => pick(onLeave)}
			>
				<span class="request-convert__icon">
					<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
				</span>
				<span class="request-convert__label">Leave as assessment completed</span>
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.request-convert__list {
		display: flex;
		flex-direction: column;
		gap: $space-1;
		margin-top: $space-2;
	}

	.request-convert__row {
		display: flex;
		align-items: center;
		gap: $space-3;
		width: 100%;
		padding: $space-3;
		border: none;
		border-radius: $radius-md;
		background: none;
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: $weight-medium;
		text-align: left;
		cursor: pointer;

		&:hover:not(:disabled) {
			background: var(--color-bg-surface-sunk);
		}

		&:disabled {
			cursor: default;
			opacity: 0.6;
		}
	}

	.request-convert__spin {
		display: inline-block;
		animation: request-convert-spin 0.7s linear infinite;
	}

	@keyframes request-convert-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.request-convert__icon {
		display: grid;
		place-items: center;
		width: 24px;
		font-size: 1.8rem;
		color: var(--color-text-secondary);

		&--quote {
			color: var(--color-danger, #c0392b);
		}
		&--job {
			color: var(--color-brand);
		}
	}

	.request-convert__label {
		flex: 1;
		min-width: 0;
	}

	.request-convert__chip {
		font-size: $fs-caption;
		font-weight: $weight-semibold;
		color: var(--color-text-secondary);
		background: var(--color-bg-surface-sunk);
		border-radius: $radius-full;
		padding: 2px $space-2;
	}

	.request-convert__divider {
		height: 1px;
		background: var(--color-border);
		margin: $space-1 0;
	}
</style>
