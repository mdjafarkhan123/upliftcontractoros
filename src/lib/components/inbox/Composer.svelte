<script lang="ts">
	import { onMount } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import ChannelSelector from './ChannelSelector.svelte';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
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
		doNotContact = false,
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
		doNotContact?: boolean;
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
		if (doNotContact) return 'Do Not Contact — remove the flag in contact settings before sending.';
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
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
	class="composer"
>
	<div class="composer__toolbar">
		<label class="composer__note-toggle" class:composer__note-toggle--active={isInternalNote}>
			<input
				type="checkbox"
				class="composer__note-input"
				bind:checked={isInternalNote}
				disabled={sending}
			/>
			<i class="ri-sticky-note-line" aria-hidden="true"></i>
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
			<span class="composer__hint composer__hint--blocked">{channelBlocked}</span>
		{:else if reopenHint}
			<span class="composer__hint composer__hint--muted">{reopenHint}</span>
		{/if}

		{#if !isInternalNote}
			<Popover.Root bind:open={quickReplyOpen}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="composer__pill composer__pill--spark composer__pill--push"
							aria-label="Insert quick reply"
						>
							<i class="ri-flashlight-line" aria-hidden="true"></i>
							Quick reply
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content align="end" class="composer-menu">
					{#if quickReplies.length === 0}
						<div class="composer-menu__empty">
							<i class="ri-flashlight-line composer-menu__empty-icon" aria-hidden="true"></i>
							<p class="composer-menu__empty-title">No quick replies yet</p>
							<p class="composer-menu__empty-text">
								Save common responses to send them in one tap.
							</p>
							<a href="/settings/quick-replies" class="composer-menu__cta">Create your first one</a>
						</div>
					{:else if visibleQuickReplies.length === 0}
						<div class="composer-menu__note">
							No quick replies for this channel.
							<a href="/settings/quick-replies" class="composer-menu__link">Add one →</a>
						</div>
					{:else}
						<ul class="composer-menu__list">
							{#each visibleQuickReplies as q (q.id)}
								<li>
									<button
										type="button"
										class="composer-menu__item"
										onclick={() => applyQuickReply(q)}
									>
										<span class="composer-menu__item-title">{q.title}</span>
										<span class="composer-menu__item-preview">{previewInterpolation(q.body)}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if quickReplies.length > 0}
						<div class="composer-menu__foot">
							<a href="/settings/quick-replies" class="composer-menu__foot-link">
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
								class="composer__pill"
								aria-label="Insert booking link"
							>
								<i class="ri-calendar-line" aria-hidden="true"></i>
								Booking link
							</button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content align="end" class="composer-menu">
						<ul class="composer-menu__list">
							{#each bookingLinks as link (link.id)}
								<li>
									<button
										type="button"
										class="composer-menu__item composer-menu__item--row"
										onclick={() => insertBookingLink(link)}
									>
										<i class="ri-calendar-line composer-menu__item-icon" aria-hidden="true"></i>
										<span class="composer-menu__item-label">{link.title}</span>
									</button>
								</li>
							{/each}
						</ul>
						<div class="composer-menu__foot">
							<a href="/settings/booking" class="composer-menu__foot-link">Manage booking links →</a
							>
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
						class="composer__from"
						aria-label="Choose sending address"
					>
						<span class="composer__from-label">From:</span>
						<span class="composer__from-value">{selectedFromOption?.address ?? ''}</span>
						<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="start" class="composer-menu">
				<ul class="composer-menu__list">
					{#each fromAllOptions as opt (opt.local_part)}
						<li>
							<button
								type="button"
								class="composer-menu__item composer-menu__item--row"
								onclick={() => pickFrom(opt.local_part)}
							>
								<span class="composer-menu__item-main">
									<span class="composer-menu__item-title">{opt.address}</span>
									{#if opt.label}
										<span class="composer-menu__item-preview">{opt.label}</span>
									{/if}
								</span>
								{#if selectedFromOption?.local_part === opt.local_part}
									<i class="ri-check-line composer-menu__item-check" aria-hidden="true"></i>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</Popover.Content>
		</Popover.Root>
	{/if}

	{#if showSubjectInput}
		<input
			type="text"
			value={emailSubject}
			oninput={(e) => (emailSubjectInput = (e.currentTarget as HTMLInputElement).value)}
			placeholder={subjectRequired ? 'Subject (required)' : 'Subject'}
			disabled={sending || !canSend || channelBlocked !== null}
			class="composer__subject"
		/>
	{/if}

	{#if attachments.length > 0}
		<div class="composer__attachments">
			{#each attachments as att (att.localId)}
				<div
					class="composer__attachment"
					class:composer__attachment--error={att.status === 'error'}
				>
					{#if att.previewUrl}
						<img
							src={att.previewUrl}
							alt={att.original_filename}
							class="composer__attachment-img"
						/>
					{:else}
						<span class="composer__attachment-icon">
							<i class="ri-file-text-line" aria-hidden="true"></i>
						</span>
					{/if}
					<span class="composer__attachment-name">{att.original_filename}</span>
					{#if att.status === 'uploading'}
						<i class="ri-loader-4-line composer__attachment-spin" aria-hidden="true"></i>
					{:else if att.status === 'error'}
						<span class="composer__attachment-failed">Failed</span>
					{/if}
					<button
						type="button"
						onclick={() => removeAttachment(att.localId)}
						class="composer__attachment-remove"
						aria-label="Remove attachment"
					>
						<i class="ri-close-line" aria-hidden="true"></i>
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
		class="composer__file-input"
		onchange={(e) => onFilesPicked((e.currentTarget as HTMLInputElement).files)}
	/>

	<div
		class="composer__shell"
		class:composer__shell--note={isInternalNote}
		class:composer__shell--email={!isInternalNote && channel === 'email'}
	>
		{#if contactId && !isInternalNote}
			<button
				type="button"
				onclick={() => fileInput?.click()}
				disabled={sending || !canSend || attachments.length >= 10}
				class="composer__attach"
				aria-label="Attach a photo or file"
			>
				<i class="ri-attachment-2" aria-hidden="true"></i>
			</button>
		{/if}
		<textarea
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
			class="composer__textarea"
		></textarea>
		<button
			type="submit"
			disabled={submitDisabled}
			class="composer__send"
			aria-label="Send message"
		>
			<i class="ri-send-plane-fill" aria-hidden="true"></i>
		</button>
	</div>
</form>
