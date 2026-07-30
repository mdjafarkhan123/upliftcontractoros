<script lang="ts">
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatCurrency, formatDate, formatRelativeShort } from '$lib/utils/format';
	import type { OpportunityQuoteSummary } from '$lib/types/pipeline';

	type FollowUpPreset = 'tomorrow' | 'in3days' | 'clear';

	type Props = {
		title: string;
		contact_name: string;
		value: string | null;
		assignee_name: string | null;
		stage_entered_at: string;
		stale_after_days: number | null;
		next_follow_up_at: string | null;
		expected_close_date: string | null;
		last_contacted_at: string | null;
		quote: OpportunityQuoteSummary | null;
		ghostLeadDays?: number | null;
		canMarkStatus?: boolean;
		onMarkWon?: () => void;
		onMarkLost?: () => void;
		onQuickFollowUp?: (preset: FollowUpPreset) => void;
	};

	let {
		title,
		contact_name,
		value,
		assignee_name,
		stage_entered_at,
		stale_after_days,
		next_follow_up_at,
		expected_close_date,
		last_contacted_at,
		quote,
		ghostLeadDays = null,
		canMarkStatus = false,
		onMarkWon,
		onMarkLost,
		onQuickFollowUp
	}: Props = $props();

	// --- Stage staleness ---
	const daysInStage = $derived(
		Math.max(0, Math.floor((Date.now() - new Date(stage_entered_at).getTime()) / 86_400_000))
	);
	const isStale = $derived(stale_after_days !== null && daysInStage >= stale_after_days);
	const isVeryStale = $derived(stale_after_days !== null && daysInStage >= stale_after_days * 2);
	const chipLabel = $derived(daysInStage === 0 ? 'Today' : `${daysInStage}d`);
	const staleModifier = $derived(isVeryStale ? 'very-stale' : isStale ? 'stale' : 'normal');

	// --- Follow-up ---
	const followUpTime = $derived(next_follow_up_at ? new Date(next_follow_up_at).getTime() : null);
	const followUpOverdue = $derived(followUpTime !== null && followUpTime <= Date.now());
	const dotModifier = $derived(
		followUpTime === null
			? isStale
				? 'none-stale'
				: 'none'
			: followUpOverdue
				? 'overdue'
				: 'scheduled'
	);
	const dotTitle = $derived(
		followUpTime === null
			? 'No follow-up scheduled'
			: followUpOverdue
				? 'Follow-up overdue'
				: `Follow-up ${formatDate(next_follow_up_at!)}`
	);

	// --- Ghost lead ---
	const idleSinceMs = $derived(
		Math.max(
			new Date(stage_entered_at).getTime(),
			last_contacted_at ? new Date(last_contacted_at).getTime() : 0
		)
	);
	const daysQuiet = $derived(Math.floor((Date.now() - idleSinceMs) / 86_400_000));
	const isGhosting = $derived(
		ghostLeadDays != null &&
			ghostLeadDays > 0 &&
			next_follow_up_at === null &&
			daysQuiet >= ghostLeadDays
	);

	// Left accent color — single highest-priority urgency signal
	const accentColor = $derived(
		followUpOverdue
			? 'var(--danger-solid)'
			: isVeryStale || isGhosting
				? 'var(--warning-solid)'
				: isStale
					? '#FBBF24'
					: followUpTime !== null
						? 'var(--color-brand)'
						: 'transparent'
	);

	// --- Quote visuals ---
	type QuoteStatus = 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'changes_requested';

	const QUOTE_ICONS: Record<QuoteStatus, string> = {
		sent: 'ri-send-plane-line',
		viewed: 'ri-eye-line',
		accepted: 'ri-checkbox-circle-line',
		declined: 'ri-close-circle-line',
		expired: 'ri-time-line',
		changes_requested: 'ri-message-2-line'
	};

	const QUOTE_LABELS: Record<QuoteStatus, string> = {
		sent: 'Sent',
		viewed: 'Viewed',
		accepted: 'Accepted',
		declined: 'Declined',
		expired: 'Expired',
		changes_requested: 'Changes requested'
	};

	const quoteStatus = $derived(quote?.status as QuoteStatus | undefined);
	const quoteIcon = $derived(quoteStatus ? QUOTE_ICONS[quoteStatus] : '');
	const quoteLabel = $derived(quoteStatus ? QUOTE_LABELS[quoteStatus] : '');
	const quoteVersionLabel = $derived(
		quote && quote.current_version > 1 ? ` v${quote.current_version}` : ''
	);
	const quoteAgeDays = $derived(
		quote?.sent_at
			? Math.max(0, Math.floor((Date.now() - new Date(quote.sent_at).getTime()) / 86_400_000))
			: null
	);
	const showQuoteAge = $derived(
		quoteAgeDays !== null &&
			quote !== null &&
			quote.status !== 'accepted' &&
			quote.status !== 'declined'
	);
	const quoteAgeModifier = $derived(
		quoteAgeDays === null
			? ''
			: followUpOverdue
				? 'overdue'
				: quoteAgeDays >= 8
					? 'old'
					: quoteAgeDays >= 4
						? 'aging'
						: 'fresh'
	);
	const quoteAgeLabel = $derived(quoteAgeDays === 0 ? 'Today' : `${quoteAgeDays}d`);
</script>

<div class="pipeline-card">
	<div class="pipeline-card__accent" style:background-color={accentColor} aria-hidden="true"></div>

	<div class="pipeline-card__body">
		<!-- Row 1: Contact name + hover-reveal menu -->
		<div class="pipeline-card__row-contact">
			<div class="pipeline-card__name-wrap">
				<span
					class="pipeline-card__dot pipeline-card__dot--{dotModifier}"
					title={dotTitle}
					aria-hidden="true"
				></span>
				<span class="pipeline-card__contact-name">{contact_name}</span>
			</div>

			{#if canMarkStatus}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						aria-label="Opportunity actions"
						class="pipeline-card__menu-btn"
						onclick={(e: MouseEvent) => e.stopPropagation()}
						onpointerdown={(e: PointerEvent) => e.stopPropagation()}
						onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
					>
						<i class="ri-more-2-line" aria-hidden="true"></i>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => onQuickFollowUp?.('tomorrow')}>
							<i
								class="ri-calendar-schedule-line"
								style:color="var(--success-solid)"
								aria-hidden="true"
							></i>
							Follow up tomorrow
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => onQuickFollowUp?.('in3days')}>
							<i
								class="ri-calendar-schedule-line"
								style:color="var(--success-solid)"
								aria-hidden="true"
							></i>
							Follow up in 3 days
						</DropdownMenu.Item>
						{#if next_follow_up_at}
							<DropdownMenu.Item onclick={() => onQuickFollowUp?.('clear')}>
								<i
									class="ri-calendar-close-line"
									style:color="var(--color-text-muted)"
									aria-hidden="true"
								></i>
								Clear follow-up
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => onMarkWon?.()}>
							<i
								class="ri-checkbox-circle-line"
								style:color="var(--success-solid)"
								aria-hidden="true"
							></i>
							Mark won
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => onMarkLost?.()}>
							<i class="ri-close-circle-line" style:color="var(--danger-solid)" aria-hidden="true"
							></i>
							Mark lost
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>

		<!-- Row 2: Deal title -->
		<p class="pipeline-card__title">{title}</p>

		<!-- Row 3: Value + stage chip + avatar -->
		<div class="pipeline-card__row-value">
			<span class="pipeline-card__value">
				{value ? formatCurrency(value) : '—'}
			</span>
			<div class="pipeline-card__row-value-right">
				{#if stale_after_days !== null}
					<span
						class="pipeline-card__stage-chip pipeline-card__stage-chip--{staleModifier}"
						title="{daysInStage} day{daysInStage === 1 ? '' : 's'} in stage"
					>
						<i class="ri-time-line" aria-hidden="true"></i>
						{chipLabel}
					</span>
				{:else if expected_close_date}
					<span class="pipeline-card__close-date" title="Expected close date">
						Close {formatDate(expected_close_date)}
					</span>
				{/if}
				{#if assignee_name}
					<Avatar size="sm" name={assignee_name} />
				{/if}
			</div>
		</div>

		<!-- Row 4: Follow-up signal -->
		{#if next_follow_up_at}
			<div
				class="pipeline-card__followup pipeline-card__followup--{followUpOverdue
					? 'overdue'
					: 'upcoming'}"
			>
				<i class="ri-calendar-schedule-line" aria-hidden="true"></i>
				<span>
					{followUpOverdue
						? `Overdue · ${formatRelativeShort(next_follow_up_at)}`
						: formatDate(next_follow_up_at)}
				</span>
			</div>
		{/if}

		<!-- Row 5: Quote block -->
		{#if quote && quoteStatus}
			<div class="pipeline-card__quote pipeline-card__quote--{quoteStatus}">
				<div class="pipeline-card__quote-left">
					<i
						class="{quoteIcon} pipeline-card__quote-icon pipeline-card__quote-icon--{quoteStatus}"
						aria-hidden="true"
					></i>
					<span class="pipeline-card__quote-label pipeline-card__quote-label--{quoteStatus}">
						{quoteLabel}{quoteVersionLabel}
					</span>
					{#if quote.view_count > 0}
						<span class="pipeline-card__quote-views">
							· {quote.view_count}
							{quote.view_count === 1 ? 'view' : 'views'}{quote.last_viewed_at
								? ` · ${formatRelativeShort(quote.last_viewed_at)}`
								: ''}
						</span>
					{/if}
				</div>
				{#if showQuoteAge}
					<span
						class="pipeline-card__quote-age pipeline-card__quote-age--{quoteAgeModifier}"
						title={quote.sent_at ? `Quote sent ${formatDate(quote.sent_at)}` : undefined}
					>
						<i class="ri-time-line" aria-hidden="true"></i>
						{quoteAgeLabel}
					</span>
				{/if}
			</div>
		{/if}

		<!-- Row 6: Ghost nudge -->
		{#if isGhosting}
			<div class="pipeline-card__ghost">
				<i class="ri-temp-cold-line" aria-hidden="true"></i>
				<span>Going cold · {daysQuiet}d quiet</span>
			</div>
		{/if}
	</div>
</div>
