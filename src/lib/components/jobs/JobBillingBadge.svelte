<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import {
		deriveJobBillingBadge,
		JOB_BILLING_BADGE_LABEL,
		JOB_BILLING_BADGE_VARIANT,
		pctOf
	} from '$lib/jobs/billing';
	import { formatCurrency } from '$lib/utils/format';
	import type { JobBillingSignals, JobStatus } from '$lib/types/jobs';

	// At most one billing badge (BILLING.md) + an optional payment-progress bar. Renders nothing
	// when there is no billing action to show, so it can be dropped into a row/card with zero
	// layout cost. Work status stays separate — this is money-only visibility.
	let {
		status,
		billing,
		total,
		showProgress = true,
		class: className
	}: {
		status: JobStatus;
		billing: JobBillingSignals | undefined;
		total: string;
		showProgress?: boolean;
		class?: string;
	} = $props();

	const badge = $derived(deriveJobBillingBadge(status, billing));
	const paid = $derived(Number(billing?.total_paid ?? 0));
	const totalNum = $derived(Number(total ?? 0));
	// Progress bar only while some money is collected but the job is not fully paid.
	const showBar = $derived(showProgress && status !== 'cancelled' && paid > 0 && paid < totalNum);
	const pct = $derived(Math.min(100, pctOf(paid, totalNum)));
</script>

{#if badge || showBar}
	<div class="job-billing-badge {className ?? ''}">
		{#if badge}
			<Badge variant={JOB_BILLING_BADGE_VARIANT[badge]} label={JOB_BILLING_BADGE_LABEL[badge]} />
		{/if}
		{#if showBar}
			<div
				class="job-billing-badge__progress"
				title="{formatCurrency(paid)} of {formatCurrency(total)} collected"
			>
				<span class="job-billing-badge__track">
					<span class="job-billing-badge__fill" style="width:{pct}%"></span>
				</span>
				<span class="job-billing-badge__label">
					{formatCurrency(paid)} of {formatCurrency(total)}
				</span>
			</div>
		{/if}
	</div>
{/if}
