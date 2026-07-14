<script lang="ts">
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import QuoteStatusBadge from '$lib/components/quotes/QuoteStatusBadge.svelte';
	import InvoiceStatusBadge from '$lib/components/invoices/InvoiceStatusBadge.svelte';
	import JobStatusBadge from '$lib/components/jobs/JobStatusBadge.svelte';
	import { contactOverviewStore } from '$lib/stores/contactOverview.svelte';
	import {
		formatCurrency,
		formatDate,
		formatDateTime,
		formatQuoteNumber,
		formatInvoiceNumber
	} from '$lib/utils/format';

	let { contactId }: { contactId: string } = $props();

	// Stale-while-revalidate: instant from cache, otherwise fetches. Re-runs on
	// contact change so switching contacts loads the right hub.
	$effect(() => {
		void contactOverviewStore.load(contactId);
	});

	const overview = $derived(contactOverviewStore.get(contactId));
	const loadingCold = $derived(contactOverviewStore.isLoading(contactId));
	const errorMsg = $derived(contactOverviewStore.getError(contactId));

	// A contact with nothing open anywhere — one calm hub-level empty state reads
	// better than four stacked "nothing here" cards.
	const allEmpty = $derived(
		!!overview &&
			overview.open_quotes.count === 0 &&
			overview.active_jobs.count === 0 &&
			overview.unpaid_invoices.count === 0 &&
			overview.upcoming_appointments.count === 0
	);
</script>

{#snippet sectionHead(
	icon: string,
	title: string,
	count: number,
	viewAllHref: string | null,
	newHref: string,
	newLabel: string
)}
	<div class="overview__head">
		<div class="overview__head-left">
			<i class={icon} aria-hidden="true"></i>
			<span class="overview__title">{title}</span>
			{#if count > 0}
				<span class="overview__count">{count}</span>
			{/if}
		</div>
		<div class="overview__head-actions">
			{#if viewAllHref && count > 0}
				<a href={viewAllHref} class="overview__link">View all</a>
			{/if}
			<a href={newHref} class="overview__new" aria-label={newLabel}>
				<i class="ri-add-line" aria-hidden="true"></i>
				New
			</a>
		</div>
	</div>
{/snippet}

{#snippet emptyRow(text: string)}
	<p class="overview__empty">{text}</p>
{/snippet}

<div class="overview">
	{#if loadingCold}
		<SkeletonLoader lines={4} height="64px" label="Loading overview" />
	{:else if errorMsg && !overview}
		<p class="overview__error">{errorMsg}</p>
	{:else if overview}
		{@const o = overview}
		{#if allEmpty}
			<div class="overview__hub-empty">
				<i class="ri-inbox-line" aria-hidden="true"></i>
				<p class="overview__hub-empty-title">Nothing open yet</p>
				<p class="overview__hub-empty-desc">
					Quotes, jobs, invoices, and appointments for this client will show up here as you create
					them.
				</p>
			</div>
		{:else}
			<!-- Open Quotes -->
			<section class="overview__section">
				{@render sectionHead(
					'ri-file-text-line',
					'Open Quotes',
					o.open_quotes.count,
					`/quotes?contact=${contactId}`,
					`/quotes/new?contact_id=${contactId}`,
					'New quote'
				)}
				{#if o.open_quotes.items.length === 0}
					{@render emptyRow('No open quotes.')}
				{:else}
					<ul class="overview__rows">
						{#each o.open_quotes.items as q (q.id)}
							<li>
								<a href={`/quotes/${q.id}`} class="overview__row">
									<span class="overview__row-main">
										<span class="overview__row-title">
											{q.title || formatQuoteNumber(q.quote_number)}
										</span>
										<span class="overview__row-sub">
											{formatQuoteNumber(q.quote_number)} · {formatDate(q.created_at)}
										</span>
									</span>
									<span class="overview__row-right">
										<span class="overview__amount">{formatCurrency(q.total)}</span>
										<QuoteStatusBadge status={q.status} />
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Active / Upcoming Jobs -->
			<section class="overview__section">
				{@render sectionHead(
					'ri-briefcase-line',
					'Active Jobs',
					o.active_jobs.count,
					`/jobs?contact_id=${contactId}`,
					`/jobs/new?contact_id=${contactId}`,
					'New job'
				)}
				{#if o.active_jobs.items.length === 0}
					{@render emptyRow('No active or upcoming jobs.')}
				{:else}
					<ul class="overview__rows">
						{#each o.active_jobs.items as j (j.id)}
							<li>
								<a href={`/jobs/${j.id}`} class="overview__row">
									<span class="overview__row-main">
										<span class="overview__row-title">{j.title}</span>
										<span class="overview__row-sub">
											{j.scheduled_start ? formatDateTime(j.scheduled_start) : 'Not scheduled'}
										</span>
									</span>
									<span class="overview__row-right">
										{#if j.total > 0}
											<span class="overview__amount">{formatCurrency(j.total)}</span>
										{/if}
										<JobStatusBadge status={j.status} scheduledStart={j.scheduled_start} />
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Unpaid Invoices -->
			<section class="overview__section">
				{@render sectionHead(
					'ri-receipt-line',
					'Unpaid Invoices',
					o.unpaid_invoices.count,
					`/invoices?contact=${contactId}`,
					`/invoices/new?contact_id=${contactId}`,
					'New invoice'
				)}
				{#if o.unpaid_invoices.items.length === 0}
					{@render emptyRow('No unpaid invoices.')}
				{:else}
					<ul class="overview__rows">
						{#each o.unpaid_invoices.items as inv (inv.id)}
							<li>
								<a href={`/invoices/${inv.id}`} class="overview__row">
									<span class="overview__row-main">
										<span class="overview__row-title">
											{inv.title || formatInvoiceNumber(inv.invoice_number)}
										</span>
										<span class="overview__row-sub">
											{formatInvoiceNumber(inv.invoice_number)}{inv.due_date
												? ` · Due ${formatDate(inv.due_date)}`
												: ''}
										</span>
									</span>
									<span class="overview__row-right">
										<span class="overview__balance">
											Balance due {formatCurrency(inv.amount_due)}
										</span>
										<InvoiceStatusBadge status={inv.status} />
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Upcoming Appointments (no per-contact list view → New only) -->
			<section class="overview__section">
				{@render sectionHead(
					'ri-calendar-line',
					'Upcoming Appointments',
					o.upcoming_appointments.count,
					null,
					`/appointments/new?contact_id=${contactId}`,
					'New appointment'
				)}
				{#if o.upcoming_appointments.items.length === 0}
					{@render emptyRow('No upcoming appointments.')}
				{:else}
					<ul class="overview__rows">
						{#each o.upcoming_appointments.items as appt (appt.id)}
							<li>
								<a href={`/appointments/${appt.id}`} class="overview__row">
									<span class="overview__row-main">
										<span class="overview__row-title">{appt.title}</span>
										{#if appt.location}
											<span class="overview__row-sub">{appt.location}</span>
										{/if}
									</span>
									<span class="overview__row-right">
										<span class="overview__amount">{formatDateTime(appt.scheduled_start)}</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.overview {
		display: flex;
		flex-direction: column;
		gap: $space-4;

		&__section {
			background: var(--color-bg-surface);
			border-radius: $radius-lg;
			box-shadow: var(--shadow-sm);
			overflow: hidden;
		}

		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			padding: $space-3 $space-4;
			border-bottom: 1px solid var(--color-border);
		}

		&__head-left {
			display: flex;
			align-items: center;
			gap: $space-2;
			min-width: 0;

			i {
				font-size: 1.25rem;
				color: var(--color-text-secondary);
				flex-shrink: 0;
			}
		}

		&__title {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__count {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 1.375rem;
			height: 1.375rem;
			padding: 0 $space-1;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			font-size: $fs-body;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-secondary);
		}

		&__head-actions {
			display: flex;
			align-items: center;
			gap: $space-3;
			flex-shrink: 0;
		}

		&__link {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-brand);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		&__new {
			display: inline-flex;
			align-items: center;
			gap: 2px;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-secondary);
			text-decoration: none;

			i {
				font-size: 1rem;
			}

			&:hover {
				color: var(--color-brand);
			}
		}

		&__rows {
			list-style: none;
			padding: 0;
			margin: 0;

			li + li .overview__row {
				border-top: 1px solid var(--color-border);
			}
		}

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			padding: $space-3 $space-4;
			text-decoration: none;
			transition: background-color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}
		}

		&__row-main {
			display: flex;
			flex-direction: column;
			gap: 2px;
			min-width: 0;
		}

		&__row-title {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__row-sub {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__row-right {
			display: flex;
			align-items: center;
			gap: $space-2;
			flex-shrink: 0;
		}

		&__amount {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);
		}

		&__balance {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: #c2410c;
		}

		&__empty {
			padding: $space-3 $space-4;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__error {
			padding: $space-4;
			font-size: $fs-body;
			color: var(--color-danger, #c2410c);
		}

		&__hub-empty {
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: $space-2;
			padding: $space-8 $space-4;
			background: var(--color-bg-surface);
			border-radius: $radius-lg;
			box-shadow: var(--shadow-sm);

			i {
				font-size: 2.5rem;
				color: var(--color-text-muted);
			}
		}

		&__hub-empty-title {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__hub-empty-desc {
			max-width: 22rem;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}
	}
</style>
