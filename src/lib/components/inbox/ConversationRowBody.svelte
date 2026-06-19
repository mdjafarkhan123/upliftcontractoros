<script lang="ts">
	import { Clock, AlertCircle, AlertTriangle, Lock } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import type { ConversationListItem } from '$lib/stores/inbox.svelte';
	import type { Component } from 'svelte';

	let {
		c,
		dense,
		initials,
		ChannelIcon,
		channelTint,
		timeLabel,
		hasUnread,
		isSnoozed,
		isClosed,
		isWaiting,
		hasFailure,
		previewText,
		meta,
		showMeta,
		metaColor
	}: {
		c: ConversationListItem;
		dense: boolean;
		initials: string;
		ChannelIcon: Component;
		channelTint: string;
		timeLabel: string;
		hasUnread: boolean;
		isSnoozed: boolean;
		isClosed: boolean;
		isWaiting: boolean;
		hasFailure: boolean;
		previewText: string;
		meta: string[];
		showMeta: boolean;
		metaColor: string;
	} = $props();

	function metaIcon(text: string): Component {
		if (text === 'Delivery failed') return AlertCircle;
		if (text.startsWith('Waiting')) return AlertTriangle;
		if (text.startsWith('Until') || text.startsWith('Snoozed')) return Clock;
		if (text === 'Closed') return Lock;
		return Clock;
	}
</script>

<div class="relative shrink-0">
	<div
		class={cn(
			'flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset transition-colors duration-150',
			dense ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-[13px]',
			hasUnread && !isClosed
				? 'bg-primary text-primary-foreground ring-primary/20'
				: 'bg-primary/10 text-primary ring-primary/20'
		)}
	>
		{initials}
	</div>
	<div
		class={cn(
			'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-card bg-background shadow-sm',
			dense ? 'h-4 w-4' : 'h-4 w-4',
			channelTint
		)}
	>
		<ChannelIcon class="h-3 w-3" />
	</div>
</div>

<div class="min-w-0 flex-1">
	<div class="flex items-baseline justify-between gap-2">
		<p
			class={cn(
				'truncate text-sm tracking-tight text-foreground',
				hasUnread && !isClosed ? 'font-semibold' : 'font-medium'
			)}
		>
			{c.contact_name}
		</p>
		<span
			class={cn(
				'shrink-0 text-xs font-medium tabular-nums',
				hasUnread && !isClosed ? 'text-primary' : 'text-muted-foreground'
			)}
		>
			{timeLabel}
		</span>
	</div>

	<div class="mt-px flex items-center gap-2">
		<p
			class={cn(
				'min-w-0 flex-1 truncate text-sm leading-5 text-muted-foreground',
				hasUnread && !isClosed && 'font-medium text-foreground/90'
			)}
		>
			{previewText}
		</p>
		{#if hasUnread && !isClosed}
			<span
				class="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground shadow-sm"
			>
				{c.unread_count > 99 ? '99+' : c.unread_count}
			</span>
		{/if}
	</div>

	{#if showMeta}
		<div
			class={cn(
				'mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] font-medium leading-4',
				metaColor
			)}
		>
			{#each meta as part, i (i)}
				{@const Icon = metaIcon(part)}
				<span class="inline-flex shrink-0 items-center gap-1">
					<Icon class="h-3 w-3 shrink-0" />
					{part}
				</span>
				{#if i < meta.length - 1}
					<span class="shrink-0 text-muted-foreground/40">·</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>
