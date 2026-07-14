<script lang="ts">
	import type { ConversationListItem, MessageChannel } from '$lib/stores/inbox.svelte';

	let {
		c,
		dense,
		initials,
		channelKey,
		channelIcon,
		timeLabel,
		hasUnread,
		isSnoozed,
		isClosed,
		isWaiting,
		hasFailure,
		previewText,
		meta,
		showMeta,
		metaState
	}: {
		c: ConversationListItem;
		dense: boolean;
		initials: string;
		channelKey: MessageChannel | null;
		channelIcon: string;
		timeLabel: string;
		hasUnread: boolean;
		isSnoozed: boolean;
		isClosed: boolean;
		isWaiting: boolean;
		hasFailure: boolean;
		previewText: string;
		meta: string[];
		showMeta: boolean;
		metaState: 'waiting' | 'failed' | 'default';
	} = $props();

	function metaIcon(text: string): string {
		if (text === 'Delivery failed') return 'ri-error-warning-line';
		if (text.startsWith('Waiting')) return 'ri-alert-line';
		if (text.startsWith('Until') || text.startsWith('Snoozed')) return 'ri-time-line';
		if (text === 'Closed') return 'ri-lock-line';
		return 'ri-time-line';
	}
</script>

<div class="convo-row__avatar-wrap">
	<div class="convo-row__avatar" class:convo-row__avatar--unread={hasUnread && !isClosed}>
		{initials}
	</div>
	<div class="convo-row__channel convo-row__channel--{channelKey ?? 'sms'}">
		<i class={channelIcon} aria-hidden="true"></i>
	</div>
</div>

<div class="convo-row__body">
	<div class="convo-row__top">
		<p class="convo-row__name" class:convo-row__name--unread={hasUnread && !isClosed}>
			{c.contact_name}
		</p>
		<span class="convo-row__time" class:convo-row__time--unread={hasUnread && !isClosed}>
			{timeLabel}
		</span>
	</div>

	<div class="convo-row__preview-row">
		<p class="convo-row__preview" class:convo-row__preview--unread={hasUnread && !isClosed}>
			{previewText}
		</p>
		{#if hasUnread && !isClosed}
			<span class="convo-row__badge">
				{c.unread_count > 99 ? '99+' : c.unread_count}
			</span>
		{/if}
	</div>

	{#if showMeta}
		<div
			class="convo-row__meta"
			class:convo-row__meta--waiting={metaState === 'waiting'}
			class:convo-row__meta--failed={metaState === 'failed'}
		>
			{#each meta as part, i (i)}
				<span class="convo-row__meta-item">
					<i class={metaIcon(part)} aria-hidden="true"></i>
					{part}
				</span>
				{#if i < meta.length - 1}
					<span class="convo-row__meta-dot">·</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>
