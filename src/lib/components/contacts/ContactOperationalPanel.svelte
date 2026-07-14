<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatDateTime } from '$lib/utils/format';

	let {
		last_contacted_at,
		next_follow_up_at,
		converted_at,
		preferred_contact_method
	}: {
		last_contacted_at: string | null;
		next_follow_up_at: string | null;
		converted_at: string | null;
		preferred_contact_method: 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger' | null;
	} = $props();

	const followUpDue = $derived(
		next_follow_up_at !== null && new Date(next_follow_up_at).getTime() <= Date.now()
	);

	const methodLabel = $derived(
		preferred_contact_method
			? preferred_contact_method[0].toUpperCase() + preferred_contact_method.slice(1)
			: null
	);
</script>

<section class="op-panel">
	{#if followUpDue}
		<div class="op-panel__badge">
			<Badge variant="warning" label="Follow up today" />
		</div>
	{/if}

	<dl class="op-panel__grid">
		<div class="op-panel__item">
			<i class="ri-time-line op-panel__icon" aria-hidden="true"></i>
			<div class="op-panel__field">
				<dt class="op-panel__label">Last contacted</dt>
				<dd class="op-panel__value">
					{last_contacted_at ? formatDateTime(last_contacted_at) : '—'}
				</dd>
			</div>
		</div>

		<div class="op-panel__item">
			<i
				class="ri-calendar-schedule-line op-panel__icon"
				class:op-panel__icon--due={followUpDue}
				aria-hidden="true"
			></i>
			<div class="op-panel__field">
				<dt class="op-panel__label">Next follow-up</dt>
				<dd class="op-panel__value">
					{next_follow_up_at ? formatDateTime(next_follow_up_at) : '—'}
				</dd>
			</div>
		</div>

		<div class="op-panel__item">
			<i class="ri-checkbox-circle-line op-panel__icon" aria-hidden="true"></i>
			<div class="op-panel__field">
				<dt class="op-panel__label">Converted</dt>
				<dd class="op-panel__value">
					{converted_at ? formatDateTime(converted_at) : '—'}
				</dd>
			</div>
		</div>

		<div class="op-panel__item">
			<i class="ri-message-2-line op-panel__icon" aria-hidden="true"></i>
			<div class="op-panel__field">
				<dt class="op-panel__label">Preferred method</dt>
				<dd class="op-panel__value">{methodLabel ?? '—'}</dd>
			</div>
		</div>
	</dl>
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.op-panel {
		border: 1px solid var(--color-border);
		border-radius: $radius-2xl;
		background: var(--color-bg-surface);
		padding: $space-4;

		@media (min-width: 768px) {
			padding: $space-5;
		}

		&__badge {
			margin-bottom: $space-3;
		}

		&__grid {
			display: grid;
			grid-template-columns: 1fr;
			gap: $space-4;
			margin: 0;

			@media (min-width: 640px) {
				grid-template-columns: 1fr 1fr;
			}
		}

		&__item {
			display: flex;
			align-items: flex-start;
			gap: $space-3;
		}

		&__icon {
			margin-top: 2px;
			flex-shrink: 0;
			font-size: $fs-lg;
			color: var(--color-text-muted);

			&--due {
				color: var(--warning-solid);
			}
		}

		&__field {
			min-width: 0;
		}

		&__label {
			font-size: $fs-caption;
			font-weight: $weight-medium;
			letter-spacing: $tracking-label;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		&__value {
			margin: 2px 0 0;
			font-size: $fs-body;
			color: var(--color-text-primary);
		}
	}
</style>
