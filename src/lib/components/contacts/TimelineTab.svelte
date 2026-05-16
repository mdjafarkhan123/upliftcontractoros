<script lang="ts">
	import { goto } from '$app/navigation';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		Clock,
		MessageSquare,
		MessageCircle,
		FileText,
		Eye,
		CheckCircle2,
		XCircle,
		Receipt,
		DollarSign,
		Calendar,
		CalendarCheck,
		CalendarX,
		Briefcase,
		BriefcaseBusiness,
		Star,
		Send,
		AlertTriangle,
		StickyNote,
		Zap,
		PhoneMissed,
		Trash2,
		ExternalLink
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	type Tone = 'neutral' | 'positive' | 'attention' | 'negative';

	type TimelineEntry = {
		type: string;
		id: string;
		created_at: string;
		icon_key: string;
		tone: Tone;
		description: string;
		metadata?: Record<string, unknown> | null;
		link?: string | null;
	};

	let { contactId }: { contactId: string } = $props();

	const member = getMemberContext();
	const canEdit = $derived(member().can_edit_contacts);

	let items = $state<TimelineEntry[]>([]);
	let nextCursor = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errorMsg = $state<string | null>(null);

	let pendingDeleteEntry = $state<TimelineEntry | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleting = $state(false);

	const ICONS: Record<string, Component> = {
		'message-in': MessageCircle,
		'message-out': MessageSquare,
		'quote-sent': FileText,
		'quote-viewed': Eye,
		'quote-accepted': CheckCircle2,
		'quote-declined': XCircle,
		'invoice-sent': Receipt,
		'invoice-paid': CheckCircle2,
		payment: DollarSign,
		appointment: Calendar,
		'appointment-completed': CalendarCheck,
		'appointment-cancelled': CalendarX,
		'job-created': Briefcase,
		'job-completed': BriefcaseBusiness,
		'job-cancelled': XCircle,
		'review-request': Send,
		review: Star,
		feedback: AlertTriangle,
		note: StickyNote,
		'automation-missed-call': PhoneMissed,
		'automation-quote-followup': Zap,
		'automation-invoice-reminder': Zap
	};

	const TONE_CLASSES: Record<Tone, string> = {
		neutral: 'bg-muted text-muted-foreground',
		positive: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
		attention: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
		negative: 'bg-destructive/10 text-destructive'
	};

	async function load(cursor: string | null) {
		const params = new SvelteURLSearchParams();
		if (cursor) params.set('cursor', cursor);
		const res = await fetch(`/api/contacts/${contactId}/timeline?${params.toString()}`);
		if (!res.ok) {
			errorMsg = 'Failed to load timeline.';
			return;
		}
		const body = (await res.json()) as { items: TimelineEntry[]; next_cursor: string | null };
		items = cursor ? [...items, ...body.items] : body.items;
		nextCursor = body.next_cursor;
	}

	$effect(() => {
		loading = true;
		errorMsg = null;
		load(null).finally(() => (loading = false));
	});

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await load(nextCursor);
		loadingMore = false;
	}

	function formatRelative(iso: string): string {
		const then = new Date(iso).getTime();
		const now = Date.now();
		const diffMs = now - then;
		// Clock skew between server/client can produce small future drift;
		// any future or sub-minute timestamp collapses to "Just now" instead
		// of rendering nonsense like "in -3 minutes" or "-60m ago".
		const sec = Math.round(diffMs / 1000);
		if (sec < 60) return 'Just now';
		const min = Math.round(sec / 60);
		if (min < 60) return `${min}m ago`;
		const hr = Math.round(min / 60);
		if (hr < 24) return `${hr}h ago`;
		const day = Math.round(hr / 24);
		if (day === 1) return 'Yesterday';
		if (day < 7) return `${day} days ago`;
		if (day < 30) return `${Math.round(day / 7)}w ago`;
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getIcon(key: string): Component {
		return ICONS[key] ?? Clock;
	}

	function onEntryClick(entry: TimelineEntry) {
		if (entry.link) goto(entry.link);
	}

	function askDelete(entry: TimelineEntry, e: MouseEvent) {
		e.stopPropagation();
		pendingDeleteEntry = entry;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		const entry = pendingDeleteEntry;
		if (!entry) return;
		const noteId = (entry.metadata?.note_id as string | undefined) ?? null;
		if (!noteId) {
			pendingDeleteEntry = null;
			return;
		}
		deleting = true;
		try {
			const res = await fetch(`/api/contacts/${contactId}/notes/${noteId}`, { method: 'DELETE' });
			if (res.ok) {
				items = items.filter((i) => i.id !== entry.id);
			}
		} finally {
			deleting = false;
			pendingDeleteEntry = null;
		}
	}
</script>

{#if loading}
	<SkeletonLoader lines={5} label="Loading timeline" />
{:else if errorMsg}
	<p class="text-sm text-destructive">{errorMsg}</p>
{:else if items.length === 0}
	<EmptyState
		title="No activity yet"
		description="Customer activity will appear here as your team communicates, schedules work, sends quotes, and records payments."
		icon={Clock}
	/>
{:else}
	<ol class="space-y-3">
		{#each items as entry (entry.id)}
			{@const Icon = getIcon(entry.icon_key)}
			{@const clickable = !!entry.link}
			{@const isNote = entry.type === 'notes'}
			<li class="rounded-xl border border-border bg-card p-4 transition-colors {clickable ? 'cursor-pointer hover:border-primary/40 hover:bg-accent/40' : ''}">
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="flex items-start gap-3"
					role={clickable ? 'button' : undefined}
					tabindex={clickable ? 0 : undefined}
					onclick={() => onEntryClick(entry)}
					onkeydown={(e) => {
						if (clickable && (e.key === 'Enter' || e.key === ' ')) {
							e.preventDefault();
							onEntryClick(entry);
						}
					}}
				>
					<span
						class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full {TONE_CLASSES[entry.tone]}"
						aria-hidden="true"
					>
						<Icon class="h-4 w-4" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm text-foreground">{entry.description}</p>
						<div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
							<time title={entry.created_at}>{formatRelative(entry.created_at)}</time>
							{#if entry.link}
								<ExternalLink class="h-3 w-3" aria-hidden="true" />
							{/if}
						</div>
					</div>
					{#if isNote && canEdit}
						<button
							type="button"
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							aria-label="Delete note"
							onclick={(e) => askDelete(entry, e)}
						>
							<Trash2 class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
	{#if nextCursor}
		<div class="mt-4 flex justify-center">
			<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
				{loadingMore ? 'Loading…' : 'Load more'}
			</Button>
		</div>
	{/if}
{/if}

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete note?"
	description="This will remove the note from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>
