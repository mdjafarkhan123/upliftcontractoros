<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { formatCurrency, formatDate, formatRelativeShort } from '$lib/utils/format';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		Clock,
		MoreVertical,
		CircleCheck,
		CircleX,
		CalendarClock,
		CalendarOff,
		Eye,
		Send,
		MessageSquare,
		Snowflake
	} from '@lucide/svelte';
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

	const initials = $derived(
		(assignee_name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]!.toUpperCase())
			.join('')
	);

	// --- Stage staleness ---
	const daysInStage = $derived(
		Math.max(0, Math.floor((Date.now() - new Date(stage_entered_at).getTime()) / 86_400_000))
	);
	const isStale = $derived(stale_after_days !== null && daysInStage >= stale_after_days);
	const isVeryStale = $derived(stale_after_days !== null && daysInStage >= stale_after_days * 2);
	const chipLabel = $derived(daysInStage === 0 ? 'Today' : `${daysInStage}d`);
	const stageChipClass = $derived(
		isVeryStale
			? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30'
			: isStale
				? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'
				: 'bg-muted text-muted-foreground ring-1 ring-border/60'
	);

	// --- Follow-up ---
	const followUpTime = $derived(next_follow_up_at ? new Date(next_follow_up_at).getTime() : null);
	const followUpOverdue = $derived(followUpTime !== null && followUpTime <= Date.now());
	const dotClass = $derived(
		followUpTime === null
			? isStale
				? 'bg-muted-foreground/40 animate-pulse'
				: 'bg-muted-foreground/40'
			: followUpOverdue
				? 'bg-rose-500'
				: 'bg-emerald-500'
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

	// Left accent: single highest-priority urgency signal
	const accentBg = $derived(
		followUpOverdue
			? 'bg-rose-500'
			: isVeryStale || isGhosting
				? 'bg-amber-500'
				: isStale
					? 'bg-amber-400'
					: followUpTime !== null
						? 'bg-primary'
						: 'bg-transparent'
	);

	// --- Quote ---
	const QUOTE_VISUALS = {
		sent: {
			label: 'Sent',
			icon: Send,
			colorClass: 'text-zinc-500 dark:text-zinc-400',
			borderClass: 'border-l-zinc-300 dark:border-l-zinc-600'
		},
		viewed: {
			label: 'Viewed',
			icon: Eye,
			colorClass: 'text-blue-600 dark:text-blue-400',
			borderClass: 'border-l-blue-400 dark:border-l-blue-500'
		},
		accepted: {
			label: 'Accepted',
			icon: CircleCheck,
			colorClass: 'text-emerald-600 dark:text-emerald-400',
			borderClass: 'border-l-emerald-500'
		},
		declined: {
			label: 'Declined',
			icon: CircleX,
			colorClass: 'text-rose-600 dark:text-rose-400',
			borderClass: 'border-l-rose-400 dark:border-l-rose-500'
		},
		expired: {
			label: 'Expired',
			icon: Clock,
			colorClass: 'text-zinc-500 dark:text-zinc-400',
			borderClass: 'border-l-zinc-300 dark:border-l-zinc-600'
		},
		changes_requested: {
			label: 'Changes requested',
			icon: MessageSquare,
			colorClass: 'text-amber-600 dark:text-amber-400',
			borderClass: 'border-l-amber-400 dark:border-l-amber-500'
		}
	} as const;

	const quoteVisual = $derived(quote ? QUOTE_VISUALS[quote.status] : null);
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
	const quoteAgeClass = $derived(
		quoteAgeDays === null
			? ''
			: followUpOverdue
				? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 animate-pulse dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30'
				: quoteAgeDays >= 8
					? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30'
					: quoteAgeDays >= 4
						? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'
						: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'
	);
	const quoteAgeLabel = $derived(quoteAgeDays === 0 ? 'Today' : `${quoteAgeDays}d`);
</script>

<div
	class="group relative touch-none select-none overflow-hidden rounded-lg border border-border/60 bg-card shadow-card transition-[box-shadow,border-color,background-color] duration-150 ease-out will-change-transform hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:cursor-grabbing"
>
	<!-- Urgency accent bar — clipped by overflow-hidden to stay within rounded corners -->
	<div class={cn('absolute inset-y-0 left-0 w-[3px] transition-colors duration-150', accentBg)}></div>

	<!-- Card body — pl-5 clears the 3px accent bar with breathing room -->
	<div class="p-4 pl-5">

		<!-- Row 1: Contact name + hover-reveal menu -->
		<div class="mb-0.5 flex items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class={cn('h-2 w-2 shrink-0 rounded-full', dotClass)}
					title={dotTitle}
					aria-hidden="true"
				></span>
				<span class="truncate text-sm font-semibold text-foreground">{contact_name}</span>
			</div>
			{#if canMarkStatus}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						aria-label="Opportunity actions"
						class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
						onclick={(e: MouseEvent) => e.stopPropagation()}
						onpointerdown={(e: PointerEvent) => e.stopPropagation()}
						onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
					>
						<MoreVertical class="h-3.5 w-3.5" aria-hidden="true" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => onQuickFollowUp?.('tomorrow')}>
							<CalendarClock class="h-4 w-4 text-emerald-600" aria-hidden="true" />
							Follow up tomorrow
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => onQuickFollowUp?.('in3days')}>
							<CalendarClock class="h-4 w-4 text-emerald-600" aria-hidden="true" />
							Follow up in 3 days
						</DropdownMenu.Item>
						{#if next_follow_up_at}
							<DropdownMenu.Item onclick={() => onQuickFollowUp?.('clear')}>
								<CalendarOff class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
								Clear follow-up
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => onMarkWon?.()}>
							<CircleCheck class="h-4 w-4 text-emerald-600" aria-hidden="true" />
							Mark won
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => onMarkLost?.()}>
							<CircleX class="h-4 w-4 text-rose-600" aria-hidden="true" />
							Mark lost
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>

		<!-- Row 2: Deal title -->
		<p class="mb-3 truncate text-[11px] leading-snug text-muted-foreground">{title}</p>

		<!-- Row 3: Value (dominant) + stage chip + avatar -->
		<div class="flex items-center justify-between gap-2">
			<span class="text-base font-bold tabular-nums text-foreground">
				{value ? formatCurrency(value) : '—'}
			</span>
			<div class="flex items-center gap-1.5">
				{#if stale_after_days !== null}
					<span
						class={cn(
							'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
							stageChipClass
						)}
						title={`${daysInStage} day${daysInStage === 1 ? '' : 's'} in stage`}
					>
						<Clock class="h-3 w-3" aria-hidden="true" />
						{chipLabel}
					</span>
				{:else if expected_close_date}
					<span class="text-[10px] text-muted-foreground/70" title="Expected close date">
						Close {formatDate(expected_close_date)}
					</span>
				{/if}
				{#if assignee_name}
					<Avatar.Root class="h-8 w-8">
						<Avatar.Fallback class="bg-primary/10 text-[10px] font-semibold text-primary">
							{initials}
						</Avatar.Fallback>
					</Avatar.Root>
				{/if}
			</div>
		</div>

		<!-- Row 4: Follow-up signal row -->
		{#if next_follow_up_at}
			<div
				class={cn(
					'mt-2.5 flex items-center gap-1.5 text-[11px] font-medium',
					followUpOverdue
						? 'text-rose-600 dark:text-rose-400'
						: 'text-emerald-600 dark:text-emerald-400'
				)}
			>
				<CalendarClock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span class="truncate">
					{followUpOverdue
						? `Overdue · ${formatRelativeShort(next_follow_up_at)}`
						: formatDate(next_follow_up_at)}
				</span>
			</div>
		{/if}

		<!-- Row 5: Quote block — status-colored left border accent -->
		{#if quote && quoteVisual}
			{@const QuoteIcon = quoteVisual.icon}
			<div
				class={cn(
					'mt-2.5 flex items-center justify-between gap-2 rounded-md border-l-[3px] bg-muted/50 py-1.5 pl-2.5 pr-2',
					quoteVisual.borderClass
				)}
			>
				<div class="flex min-w-0 items-center gap-1.5">
					<QuoteIcon
						class={cn('h-3.5 w-3.5 shrink-0', quoteVisual.colorClass)}
						aria-hidden="true"
					/>
					<span class={cn('truncate text-[11px] font-semibold', quoteVisual.colorClass)}>
						{quoteVisual.label}{quoteVersionLabel}
					</span>
					{#if quote.view_count > 0}
						<span class="shrink-0 text-[10px] text-muted-foreground">
							· {quote.view_count}
							{quote.view_count === 1 ? 'view' : 'views'}{quote.last_viewed_at
								? ` · ${formatRelativeShort(quote.last_viewed_at)}`
								: ''}
						</span>
					{/if}
				</div>
				{#if showQuoteAge}
					<span
						class={cn(
							'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
							quoteAgeClass
						)}
						title={quote.sent_at ? `Quote sent ${formatDate(quote.sent_at)}` : undefined}
					>
						<Clock class="h-3 w-3" aria-hidden="true" />
						{quoteAgeLabel}
					</span>
				{/if}
			</div>
		{/if}

		<!-- Row 6: Ghost nudge — informational only, no destructive action -->
		{#if isGhosting}
			<div
				class="mt-2.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
			>
				<Snowflake class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span class="truncate">Going cold · {daysQuiet}d quiet</span>
			</div>
		{/if}

	</div>
</div>
