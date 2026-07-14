<script lang="ts">
	// Shared document header card for quotes + invoices: status badge + optional
	// status chips, customer identity, and a row of key dates. Quote-only extras
	// (service address subline, in-person signature) and invoice-only extras (due /
	// overdue chips) are injected via snippets so neither leaks into the other.
	import type { Snippet } from 'svelte';
	import type { DocumentHeaderDate } from '$lib/types/documents';

	let {
		name,
		meta,
		noEmail = false,
		dates = [],
		badge,
		chips,
		subline,
		footer
	}: {
		name: string;
		meta?: string;
		noEmail?: boolean;
		dates?: DocumentHeaderDate[];
		badge: Snippet;
		chips?: Snippet;
		subline?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<div class="card">
	<div class="doc-header">
		<div class="doc-header__status-row">
			{@render badge()}
			{#if chips}{@render chips()}{/if}
		</div>

		<p class="doc-header__name">{name}</p>
		{#if meta}<p class="doc-header__meta">{meta}</p>{/if}
		{#if noEmail}
			<span class="doc-header__no-email">
				<i class="ri-alert-line" aria-hidden="true"></i>No email on file — SMS only
			</span>
		{/if}

		{#if subline}{@render subline()}{/if}

		{#if dates.length > 0}
			<div class="doc-header__dates">
				{#each dates as d (d.label)}
					<div class="doc-header__date-item">
						<span class="doc-header__date-label">{d.label}</span>
						<span
							class="doc-header__date-value{d.tone && d.tone !== 'default'
								? ` doc-header__date-value--${d.tone}`
								: ''}"
						>
							{#if d.icon}<i class={d.icon} aria-hidden="true"></i>{/if}{d.value}
						</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if footer}{@render footer()}{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.doc-header {
		display: flex;
		flex-direction: column;
		gap: $space-1;

		&__status-row {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: $space-2;
			margin-bottom: $space-1;
		}

		&__name {
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
			margin-top: $space-2;
		}

		&__meta {
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__no-email {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			margin-top: $space-1;
			padding: 2px $space-2;
			border-radius: $radius-md;
			background: rgba(245, 158, 11, 0.1);
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: #b45309;

			i {
				font-size: 1.3rem;
				flex-shrink: 0;
			}
		}

		&__dates {
			display: flex;
			flex-wrap: wrap;
			gap: $space-4;
			margin-top: $space-3;
		}

		&__date-item {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		&__date-label {
			font-size: $fs-caption;
			color: var(--color-text-muted);
		}

		&__date-value {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);

			&--danger {
				color: var(--danger-solid);
			}
			&--success {
				color: var(--success-text);
			}
			&--signed {
				display: flex;
				align-items: center;
				gap: 4px;
				color: var(--success-text);
				i {
					font-size: 1.4rem;
					flex-shrink: 0;
				}
			}
		}
	}

	:global(:root[data-theme='dark']) .doc-header__no-email {
		color: #fcd34d;
	}
</style>
