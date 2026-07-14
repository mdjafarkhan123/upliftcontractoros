<script lang="ts">
	import type { ConversationListItem, MessageChannel } from '$lib/stores/inbox.svelte';
	import ConversationRowBody from './ConversationRowBody.svelte';

	let {
		conversation: c,
		dense = false,
		selected = false,
		onSelect
	}: {
		conversation: ConversationListItem;
		dense?: boolean;
		selected?: boolean;
		onSelect?: (id: string) => void;
	} = $props();

	const channel: MessageChannel | null = $derived(c.last_message_channel);

	const channelIcon = $derived(
		channel === 'missed_call'
			? 'ri-phone-off-line'
			: channel === 'call'
				? 'ri-phone-line'
				: channel === 'email'
					? 'ri-mail-line'
					: channel === 'webchat'
						? 'ri-global-line'
						: 'ri-chat-1-line'
	);

	const initials = $derived(
		(c.contact_name || '?')
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('') || '?'
	);

	const timeLabel = $derived(formatRelative(c.last_message_at));
	const hasUnread = $derived(c.unread_count > 0);
	const isSnoozed = $derived(c.status === 'snoozed');
	const isClosed = $derived(c.status === 'closed');
	const hasFailure = $derived(c.has_delivery_failure === true && !isClosed);
	const isWaiting = $derived(c.last_message_direction === 'inbound' && !isSnoozed && !isClosed);
	const waitingLabel = $derived(isWaiting ? formatWaiting(c.last_inbound_at) : '');

	const previewText = $derived.by(() => {
		if (c.last_message_preview && c.last_message_preview.trim().length > 0) {
			if (c.last_message_direction === 'outbound' && channel !== 'missed_call') {
				return `You: ${c.last_message_preview}`;
			}
			return c.last_message_preview;
		}
		if (channel === 'missed_call') return 'Missed phone call';
		return 'No messages yet';
	});

	const meta = $derived.by(() => {
		const parts: string[] = [];
		if (isWaiting) parts.push(waitingLabel === 'now' ? 'Waiting' : `Waiting ${waitingLabel}`);
		if (hasFailure) parts.push('Delivery failed');
		if (isSnoozed) parts.push(formatSnoozeUntil(c.snoozed_until));
		else if (isClosed) parts.push('Closed');
		if (c.assignee_name) parts.push(c.assignee_name);
		return parts;
	});

	const showMeta = $derived(meta.length > 0);

	function formatRelative(iso: string | null): string {
		if (!iso) return '';
		const then = new Date(iso).getTime();
		const now = Date.now();
		const diff = Math.max(0, now - then);
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'now';
		if (diff < hr) return `${Math.floor(diff / min)}m`;
		if (diff < day) return `${Math.floor(diff / hr)}h`;
		if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatWaiting(iso: string | null): string {
		if (!iso) return '';
		const diff = Math.max(0, Date.now() - new Date(iso).getTime());
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'now';
		if (diff < hr) return `${Math.floor(diff / min)}m`;
		if (diff < day) return `${Math.floor(diff / hr)}h`;
		return `${Math.floor(diff / day)}d`;
	}

	function formatSnoozeUntil(iso: string | null): string {
		if (!iso) return '';
		const date = new Date(iso);
		const now = new Date();
		const sameDay = date.toDateString() === now.toDateString();
		if (sameDay) {
			return `Until ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		}
		return `Until ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
	}

	const metaState = $derived<'waiting' | 'failed' | 'default'>(
		hasFailure ? 'failed' : isWaiting ? 'waiting' : 'default'
	);
</script>

{#if onSelect}
	<button
		type="button"
		onclick={() => onSelect?.(c.id)}
		aria-current={selected ? 'true' : undefined}
		class="convo-row convo-row--dense"
		class:convo-row--selected={selected}
	>
		{#if (hasUnread && !isClosed) || selected}
			<span class="convo-row__accent"></span>
		{/if}
		<ConversationRowBody
			{c}
			{dense}
			{initials}
			channelKey={channel}
			{channelIcon}
			{timeLabel}
			{hasUnread}
			{isSnoozed}
			{isClosed}
			{isWaiting}
			{hasFailure}
			{previewText}
			{meta}
			{showMeta}
			{metaState}
		/>
	</button>
{:else}
	<a
		href={`/inbox/${c.id}`}
		aria-current={selected ? 'true' : undefined}
		class="convo-row convo-row--card"
		class:convo-row--unread={hasUnread && !isClosed}
		class:convo-row--failed={hasFailure}
		class:convo-row--closed={isClosed}
	>
		{#if hasUnread && !isClosed}
			<span class="convo-row__accent"></span>
		{/if}
		<ConversationRowBody
			{c}
			{dense}
			{initials}
			channelKey={channel}
			{channelIcon}
			{timeLabel}
			{hasUnread}
			{isSnoozed}
			{isClosed}
			{isWaiting}
			{hasFailure}
			{previewText}
			{meta}
			{showMeta}
			{metaState}
		/>
	</a>
{/if}
