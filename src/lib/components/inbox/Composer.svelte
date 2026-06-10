<script lang="ts">
	import {
		Send,
		StickyNote,
		Zap,
		Paperclip,
		X,
		FileText,
		Loader2,
		ChevronDown,
		Check,
		Calendar
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import ChannelSelector from './ChannelSelector.svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
	import { cn } from '$lib/utils/cn';
	import type { OutboundChannel, MessageMedia } from '$lib/stores/inbox.svelte';

	export type QuickReplyItem = {
		id: string;
		title: string;
		body: string;
		channel: 'sms' | 'email' | 'webchat' | 'any';
	};

	let {
		availableChannels,
		suggestedChannel,
		emailSubjectDefault = '',
		canSend = true,
		smsOptOut = false,
		isClosed = false,
		smsQuota = null,
		quickReplies = [],
		contactName = '',
		orgName = '',
		orgSlug = '',
		contactId = '',
		onSend,
		onTyping
	}: {
		availableChannels: OutboundChannel[];
		suggestedChannel: OutboundChannel | null;
		emailSubjectDefault?: string;
		canSend?: boolean;
		smsOptOut?: boolean;
		isClosed?: boolean;
		smsQuota?: { used: number; limit: number } | null;
		quickReplies?: QuickReplyItem[];
		contactName?: string;
		orgName?: string;
		/** Org slug — used to build public booking-link URLs for insertion. */
		orgSlug?: string;
		/** Contact the conversation belongs to — required to upload attachments. */
		contactId?: string;
		onSend: (
			body: string,
			opts: {
				isInternalNote: boolean;
				channel?: OutboundChannel;
				emailSubject?: string;
				fromLocalPart?: string;
				interpolate?: boolean;
				mediaIds?: string[];
				optimisticMedia?: MessageMedia[];
			}
		) => Promise<void> | void;
		onTyping?: (isTyping: boolean) => void;
	} = $props();

	type Attachment = {
		localId: string;
		status: 'uploading' | 'done' | 'error';
		id?: string;
		media_type?: 'photo' | 'pdf' | 'attachment';
		original_filename: string;
		file_size_bytes: number;
		mime_type: string;
		previewUrl?: string;
		errorMsg?: string;
	};
	let attachments = $state<Attachment[]>([]);
	let fileInput = $state<HTMLInputElement | null>(null);

	const doneAttachments = $derived(attachments.filter((a) => a.status === 'done' && a.id));
	const uploading = $derived(attachments.some((a) => a.status === 'uploading'));

	async function onFilesPicked(fileList: FileList | null) {
		if (!fileList || !contactId) return;
		for (const file of Array.from(fileList)) {
			const localId =
				typeof crypto !== 'undefined' && crypto.randomUUID
					? crypto.randomUUID()
					: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
			attachments = [
				...attachments,
				{
					localId,
					status: 'uploading',
					original_filename: file.name,
					file_size_bytes: file.size,
					mime_type: file.type,
					previewUrl
				}
			];
			const form = new FormData();
			form.append('file', file);
			form.append('purpose_tag', 'contact_attachment');
			form.append('contact_id', contactId);
			try {
				const res = await fetch('/api/media/upload', { method: 'POST', body: form });
				const body = (await res.json().catch(() => ({}))) as {
					data?: {
						id: string;
						media_type: 'photo' | 'pdf' | 'attachment';
						original_filename: string;
					};
					error?: string;
				};
				if (!res.ok || !body.data) {
					attachments = attachments.map((a) =>
						a.localId === localId
							? { ...a, status: 'error', errorMsg: body.error ?? 'Upload failed' }
							: a
					);
					continue;
				}
				const rec = body.data;
				attachments = attachments.map((a) =>
					a.localId === localId
						? { ...a, status: 'done', id: rec.id, media_type: rec.media_type }
						: a
				);
			} catch {
				attachments = attachments.map((a) =>
					a.localId === localId ? { ...a, status: 'error', errorMsg: 'Upload failed' } : a
				);
			}
		}
		if (fileInput) fileInput.value = '';
	}

	function removeAttachment(localId: string) {
		const target = attachments.find((a) => a.localId === localId);
		attachments = attachments.filter((a) => a.localId !== localId);
		if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
		// Delete the now-unused contact attachment so we don't leave a stray file.
		if (target?.status === 'done' && target.id) {
			void fetch(`/api/media/${target.id}`, { method: 'DELETE' }).catch(() => {});
		}
	}

	function clearAttachments() {
		for (const a of attachments) {
			if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
		}
		attachments = [];
	}

	// From-address picker (email only). Loaded lazily from a sender-accessible
	// endpoint; the picker only appears when the org has extra branded addresses.
	type FromOption = { local_part: string; label: string | null; address: string };
	let fromDefault = $state<FromOption | null>(null);
	let fromExtras = $state<FromOption[]>([]);
	let selectedFromLocal = $state<string | null>(null);
	let fromOpen = $state(false);

	onMount(async () => {
		if (!availableChannels.includes('email')) return;
		try {
			const res = await fetch('/api/email/from-options');
			if (!res.ok) return;
			const json = (await res.json()) as {
				data: { default: FromOption | null; extras: FromOption[] };
			};
			fromDefault = json.data.default;
			fromExtras = json.data.extras;
		} catch {
			// silent — picker just won't show; sends fall back to the default address
		}
	});

	// Booking links — active links for this org, fetched lazily so the calendar
	// button only appears when there is at least one link to insert.
	type BookingLinkOption = {
		id: string;
		slug: string;
		title: string;
		appointment_type: string;
	};
	let bookingLinks = $state<BookingLinkOption[]>([]);
	let bookingOpen = $state(false);

	onMount(async () => {
		try {
			const res = await fetch('/api/booking-links/active');
			if (!res.ok) return;
			const json = (await res.json()) as { data: BookingLinkOption[] };
			bookingLinks = json.data;
		} catch {
			// silent — the booking button just won't show
		}
	});

	function insertBookingLink(link: BookingLinkOption) {
		if (!orgSlug) return;
		const url = bookingPublicUrl(orgSlug, link.slug);
		const cta = `Book a time here:\n${url}`;
		const current = body.replace(/\s+$/, '');
		body = current.length > 0 ? `${current}\n\n${cta}` : cta;
		bookingOpen = false;
	}

	const fromAllOptions = $derived(fromDefault ? [fromDefault, ...fromExtras] : []);
	const selectedFromOption = $derived(
		fromAllOptions.find((o) => o.local_part === selectedFromLocal) ?? fromDefault
	);

	function pickFrom(local: string) {
		selectedFromLocal = local;
		fromOpen = false;
	}

	let body = $state('');
	let emailSubjectInput = $state<string | null>(null);
	let isInternalNote = $state(false);
	let sending = $state(false);
	let channelOverride = $state<OutboundChannel | null>(null);
	let usedQuickReply = $state(false);
	let quickReplyOpen = $state(false);
	let typingTimer: ReturnType<typeof setTimeout> | null = null;
	let isTyping = $state(false);

	function handleTyping() {
		if (!onTyping) return;
		if (!isTyping && body.trim().length > 0 && !isInternalNote) {
			isTyping = true;
			onTyping(true);
		}
		if (typingTimer) clearTimeout(typingTimer);
		typingTimer = setTimeout(() => {
			isTyping = false;
			typingTimer = null;
			onTyping(false);
		}, 2500);
	}

	function stopTyping() {
		if (typingTimer) clearTimeout(typingTimer);
		typingTimer = null;
		if (isTyping && onTyping) {
			isTyping = false;
			onTyping(false);
		}
	}

	function previewInterpolation(text: string): string {
		return text
			.replaceAll('{contact_name}', contactName || '{contact_name}')
			.replaceAll('{org_name}', orgName || '{org_name}');
	}

	const visibleQuickReplies = $derived(
		quickReplies.filter((q) => q.channel === 'any' || q.channel === channel)
	);

	function applyQuickReply(q: QuickReplyItem) {
		body = previewInterpolation(q.body);
		usedQuickReply = q.body.includes('{contact_name}') || q.body.includes('{org_name}');
		quickReplyOpen = false;
	}

	const channel = $derived<OutboundChannel>(
		channelOverride && availableChannels.includes(channelOverride)
			? channelOverride
			: suggestedChannel && availableChannels.includes(suggestedChannel)
				? suggestedChannel
				: (availableChannels[0] ?? 'sms')
	);

	const emailSubject = $derived(emailSubjectInput ?? emailSubjectDefault);

	const smsQuotaExceeded = $derived(
		!!smsQuota && smsQuota.limit > 0 && smsQuota.used >= smsQuota.limit
	);

	const channelBlocked = $derived.by(() => {
		if (isInternalNote) return null;
		if (channel === 'sms' && smsOptOut) return 'Contact has opted out of SMS.';
		if (channel === 'sms' && smsQuotaExceeded) return 'SMS limit reached for this month';
		if (availableChannels.length === 0) return 'No channels available for this contact.';
		return null;
	});

	// Closed threads are no longer hard-blocked — sending auto-reopens the
	// conversation server-side. Surface a gentle hint instead.
	const reopenHint = $derived(
		isClosed && !isInternalNote && channelBlocked === null
			? 'Sending will reopen this conversation.'
			: null
	);

	const trimmed = $derived(body.trim());
	const trimmedSubject = $derived(emailSubject.trim());
	const subjectRequired = $derived(!isInternalNote && channel === 'email' && !emailSubjectDefault);
	const hasContent = $derived(trimmed.length > 0 || doneAttachments.length > 0);
	const submitDisabled = $derived(
		sending ||
			uploading ||
			!hasContent ||
			(channelBlocked !== null && !isInternalNote) ||
			!canSend ||
			(subjectRequired && trimmedSubject.length === 0)
	);

	async function submit() {
		if (submitDisabled) return;
		stopTyping();
		sending = true;
		try {
			const mediaIds = doneAttachments.map((a) => a.id!).filter(Boolean);
			// Render the attachments in the outgoing bubble immediately — the media is
			// already uploaded to R2, so MessageMedia can presign by id. The confirmed
			// server message (with the real joined media) replaces this on response.
			const optimisticMedia: MessageMedia[] = doneAttachments.map((a) => ({
				id: a.id!,
				r2_key: '',
				thumbnail_key: null,
				web_key: null,
				original_filename: a.original_filename,
				file_size_bytes: a.file_size_bytes,
				media_type: a.media_type ?? 'attachment',
				mime_type: a.mime_type,
				purpose_tag: 'message_attachment',
				created_at: new Date().toISOString()
			}));
			await onSend(trimmed, {
				isInternalNote,
				channel: isInternalNote ? undefined : channel,
				emailSubject:
					!isInternalNote && channel === 'email'
						? trimmedSubject || emailSubjectDefault
						: undefined,
				// Only send an override when a non-default address is explicitly chosen;
				// otherwise the server uses the org default.
				fromLocalPart:
					!isInternalNote &&
					channel === 'email' &&
					selectedFromLocal &&
					selectedFromLocal !== fromDefault?.local_part
						? selectedFromLocal
						: undefined,
				interpolate: usedQuickReply,
				mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
				optimisticMedia: optimisticMedia.length > 0 ? optimisticMedia : undefined
			});
			body = '';
			emailSubjectInput = null;
			isInternalNote = false;
			usedQuickReply = false;
			clearAttachments();
		} finally {
			sending = false;
		}
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void submit();
		}
	}

	const showSubjectInput = $derived(!isInternalNote && channel === 'email');
	// Only worth a picker when there is an actual choice (≥1 extra address).
	const showFromPicker = $derived(showSubjectInput && fromExtras.length > 0);
	const composerBorderClass = $derived(
		isInternalNote
			? 'border-amber-500/30 bg-amber-500/5'
			: channel === 'email'
				? 'border-blue-500/30'
				: 'border-border'
	);
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
	class="space-y-2.5"
>
	<div class="flex flex-wrap items-center gap-2">
		<label
			class={cn(
				'inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
				isInternalNote
					? 'border-amber-500/40 bg-amber-500/10 text-amber-700 shadow-sm dark:text-amber-400'
					: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
		>
			<input type="checkbox" class="sr-only" bind:checked={isInternalNote} disabled={sending} />
			<StickyNote class="h-3.5 w-3.5" />
			Internal note
		</label>

		{#if !isInternalNote && availableChannels.length > 0}
			<ChannelSelector
				value={channel}
				available={availableChannels}
				disabled={sending}
				onChange={(c) => (channelOverride = c)}
			/>
		{/if}

		{#if channelBlocked && !isInternalNote}
			<span class="truncate text-xs text-destructive">{channelBlocked}</span>
		{:else if reopenHint}
			<span class="truncate text-xs text-muted-foreground">{reopenHint}</span>
		{/if}

		{#if !isInternalNote}
			<Popover.Root bind:open={quickReplyOpen}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="group ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							aria-label="Insert quick reply"
						>
							<Zap class="h-3.5 w-3.5 animate-spark-flash group-hover:animate-none" />
							Quick reply
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content align="end" class="w-72 p-2">
					{#if quickReplies.length === 0}
						<div class="px-2.5 py-3 text-center">
							<Zap class="mx-auto h-5 w-5 text-muted-foreground/60" />
							<p class="mt-2 text-sm font-medium text-foreground">No quick replies yet</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Save common responses to send them in one tap.
							</p>
							<a
								href="/settings/quick-replies"
								class="mt-2.5 inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
							>
								Create your first one
							</a>
						</div>
					{:else if visibleQuickReplies.length === 0}
						<div class="px-2 py-2 text-xs text-muted-foreground">
							No quick replies for this channel.
							<a href="/settings/quick-replies" class="text-primary hover:underline"> Add one → </a>
						</div>
					{:else}
						<ul class="max-h-72 space-y-1 overflow-y-auto">
							{#each visibleQuickReplies as q (q.id)}
								<li>
									<button
										type="button"
										class="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
										onclick={() => applyQuickReply(q)}
									>
										<div class="truncate text-sm font-medium text-foreground">{q.title}</div>
										<div class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
											{previewInterpolation(q.body)}
										</div>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if quickReplies.length > 0}
						<div class="mt-1 border-t border-border/60 pt-1.5">
							<a
								href="/settings/quick-replies"
								class="block rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-muted"
							>
								Manage quick replies →
							</a>
						</div>
					{/if}
				</Popover.Content>
			</Popover.Root>

			{#if bookingLinks.length > 0 && orgSlug}
				<Popover.Root bind:open={bookingOpen}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								aria-label="Insert booking link"
							>
								<Calendar class="h-3.5 w-3.5" />
								Booking link
							</button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content align="end" class="w-72 p-2">
						<ul class="max-h-72 space-y-1 overflow-y-auto">
							{#each bookingLinks as link (link.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
										onclick={() => insertBookingLink(link)}
									>
										<Calendar class="h-4 w-4 shrink-0 text-muted-foreground" />
										<span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
											{link.title}
										</span>
									</button>
								</li>
							{/each}
						</ul>
						<div class="mt-1 border-t border-border/60 pt-1.5">
							<a
								href="/settings/booking"
								class="block rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-muted"
							>
								Manage booking links →
							</a>
						</div>
					</Popover.Content>
				</Popover.Root>
			{/if}
		{/if}
	</div>

	{#if showFromPicker}
		<Popover.Root bind:open={fromOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						disabled={sending || !canSend || channelBlocked !== null}
						class="inline-flex min-h-[36px] max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
						aria-label="Choose sending address"
					>
						<span class="shrink-0 text-muted-foreground/70">From:</span>
						<span class="truncate text-foreground">{selectedFromOption?.address ?? ''}</span>
						<ChevronDown class="h-3.5 w-3.5 shrink-0" />
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="start" class="w-72 p-1.5">
				<ul class="max-h-72 space-y-0.5 overflow-y-auto">
					{#each fromAllOptions as opt (opt.local_part)}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
								onclick={() => pickFrom(opt.local_part)}
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium text-foreground">{opt.address}</span>
									{#if opt.label}
										<span class="block truncate text-xs text-muted-foreground">{opt.label}</span>
									{/if}
								</span>
								{#if selectedFromOption?.local_part === opt.local_part}
									<Check class="h-4 w-4 shrink-0 text-primary" />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</Popover.Content>
		</Popover.Root>
	{/if}

	{#if showSubjectInput}
		<Input
			type="text"
			value={emailSubject}
			oninput={(e) => (emailSubjectInput = (e.currentTarget as HTMLInputElement).value)}
			placeholder={subjectRequired ? 'Subject (required)' : 'Subject'}
			disabled={sending || !canSend || channelBlocked !== null}
			class="h-10 rounded-lg border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
		/>
	{/if}

	{#if attachments.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each attachments as att (att.localId)}
				<div
					class={cn(
						'group relative flex items-center gap-2 rounded-lg border border-border/60 bg-background p-1.5 pr-7',
						att.status === 'error' && 'border-destructive/50'
					)}
				>
					{#if att.previewUrl}
						<img
							src={att.previewUrl}
							alt={att.original_filename}
							class="h-9 w-9 shrink-0 rounded object-cover"
						/>
					{:else}
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
						>
							<FileText class="h-4 w-4" />
						</span>
					{/if}
					<span class="max-w-[120px] truncate text-xs text-foreground">{att.original_filename}</span
					>
					{#if att.status === 'uploading'}
						<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
					{:else if att.status === 'error'}
						<span class="shrink-0 text-[10px] font-medium text-destructive">Failed</span>
					{/if}
					<button
						type="button"
						onclick={() => removeAttachment(att.localId)}
						class="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						aria-label="Remove attachment"
					>
						<X class="h-3 w-3" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="image/*,application/pdf"
		multiple
		class="hidden"
		onchange={(e) => onFilesPicked((e.currentTarget as HTMLInputElement).files)}
	/>

	<div
		class={cn(
			'flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-card transition-all duration-150 focus-within:border-primary/50 focus-within:shadow-dropdown',
			composerBorderClass
		)}
	>
		{#if contactId && !isInternalNote}
			<button
				type="button"
				onclick={() => fileInput?.click()}
				disabled={sending || !canSend || attachments.length >= 10}
				class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
				aria-label="Attach a photo or file"
			>
				<Paperclip class="h-5 w-5" />
			</button>
		{/if}
		<Textarea
			bind:value={body}
			onkeydown={handleKey}
			oninput={handleTyping}
			placeholder={isInternalNote
				? 'Private note — only visible to your team'
				: channelBlocked
					? channelBlocked
					: channel === 'email'
						? 'Write your email…'
						: 'Type a message…'}
			rows={1}
			disabled={(channelBlocked !== null && !isInternalNote) || sending || !canSend}
			class="min-h-[48px] resize-none border-0 bg-transparent p-2.5 text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
		/>
		<button
			type="submit"
			disabled={submitDisabled}
			class={cn(
				'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-sm transition-all',
				'bg-gradient-to-b from-primary to-[hsl(var(--primary-deep))] hover:shadow-[0_8px_22px_-10px_hsl(var(--primary)/0.9)] active:scale-95',
				'disabled:cursor-not-allowed disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none disabled:active:scale-100',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
			)}
			aria-label="Send message"
		>
			<Send class="h-4 w-4" />
		</button>
	</div>
</form>
