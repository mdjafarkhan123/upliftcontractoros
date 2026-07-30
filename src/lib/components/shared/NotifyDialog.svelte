<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	// Generic "notify the customer" dialog: recipient line + Email/Text/Both channel
	// picker + (editable) tokenized message editor with live preview, OR a read-only
	// preview when `editable` is false (e.g. an appointment reschedule where the worker
	// renders a fixed template). Owns NOTHING entity-specific — the caller supplies the
	// copy, tokens, `fill()`, defaults and an `onConfirm` that performs the actual send.
	//
	// Reuses the shared `.send-doc` BEM classes from _send-document.scss.

	type Channel = 'email' | 'sms' | 'both';
	type MergeField = { token: string; label: string };
	type Edited = { sms: string | null; subject: string | null; body: string | null };
	type ConfirmResult = { ok: boolean; channelError?: string };

	let {
		open = $bindable(false),
		title,
		titleNum = null,
		subtitle,
		recipientName,
		recipientEmail = null,
		recipientPhone = null,
		recipientSmsOptOut = false,
		recipientSummary = null,
		editable = true,
		mergeFields = [],
		fill,
		defaultSms,
		defaultSubject,
		defaultBody,
		linkDisplay = '',
		linkForCount = '',
		notice = null,
		confirmLabel,
		confirmLoadingLabel = 'Sending…',
		confirmSuccessLabel = 'Sent',
		cancelLabel = 'Cancel',
		secondaryLabel = null,
		onSecondary = null,
		onCopyLink = null,
		onConfirm
	}: {
		open?: boolean;
		title: string;
		titleNum?: string | null;
		subtitle: string;
		recipientName: string;
		recipientEmail?: string | null;
		recipientPhone?: string | null;
		recipientSmsOptOut?: boolean;
		// Batch/multi-recipient mode: when set, the single-recipient line is replaced by this
		// summary (e.g. "12 clients — each gets their own invoice") and BOTH channels are treated
		// as available (per-recipient reachability is resolved server-side, reported per row).
		recipientSummary?: string | null;
		editable?: boolean;
		mergeFields?: MergeField[];
		fill: (template: string, link: string) => string;
		defaultSms: string;
		defaultSubject: string;
		defaultBody: string;
		linkDisplay?: string;
		linkForCount?: string;
		notice?: string | null;
		confirmLabel: string;
		confirmLoadingLabel?: string;
		confirmSuccessLabel?: string;
		cancelLabel?: string;
		secondaryLabel?: string | null;
		onSecondary?: (() => void) | null;
		onCopyLink?: (() => Promise<boolean>) | null;
		onConfirm: (
			channels: ('email' | 'sms')[],
			edited: Edited | null
		) => Promise<ConfirmResult | boolean>;
	} = $props();

	const batchMode = $derived(recipientSummary !== null);
	const emailAvailable = $derived(batchMode || Boolean(recipientEmail));
	const smsAvailable = $derived(batchMode || (!recipientSmsOptOut && Boolean(recipientPhone)));
	const anyAvailable = $derived(emailAvailable || smsAvailable);

	let channel = $state<Channel>('both');
	let smsValue = $state('');
	let subjectValue = $state('');
	let bodyValue = $state('');
	let channelError = $state<string | null>(null);
	let busy = $state(false);
	let copyingLink = $state(false);

	let smsEl = $state<HTMLTextAreaElement | null>(null);
	let bodyEl = $state<HTMLTextAreaElement | null>(null);

	function defaultChannel(): Channel {
		if (emailAvailable && smsAvailable) return 'both';
		if (emailAvailable) return 'email';
		return 'sms';
	}

	// Reset every field to defaults whenever the dialog (re)opens.
	let primed = $state(false);
	$effect(() => {
		if (open && !primed) {
			channel = defaultChannel();
			smsValue = defaultSms;
			subjectValue = defaultSubject;
			bodyValue = defaultBody;
			channelError = null;
			primed = true;
		} else if (!open && primed) {
			primed = false;
		}
	});

	const wantSms = $derived(channel === 'sms' || channel === 'both');
	const wantEmail = $derived(channel === 'email' || channel === 'both');

	// ── Preview / counting ───────────────────────────────────────────────────
	const smsPreview = $derived(fill(smsValue, linkDisplay));
	const smsCharLen = $derived(fill(smsValue, linkForCount).length);
	const smsSegments = $derived(Math.max(1, Math.ceil(smsCharLen / 160)));
	const subjectPreview = $derived(fill(subjectValue, linkDisplay));
	const bodyPreview = $derived(fill(bodyValue, linkDisplay));

	function insertToken(target: 'sms' | 'body', token: string) {
		const node = target === 'sms' ? smsEl : bodyEl;
		const piece = `{${token}}`;
		const current = target === 'sms' ? smsValue : bodyValue;
		if (!node) {
			if (target === 'sms') smsValue = current + piece;
			else bodyValue = current + piece;
			return;
		}
		const start = node.selectionStart ?? current.length;
		const end = node.selectionEnd ?? current.length;
		const next = current.slice(0, start) + piece + current.slice(end);
		if (target === 'sms') smsValue = next;
		else bodyValue = next;
		queueMicrotask(() => {
			node.focus();
			const pos = start + piece.length;
			node.setSelectionRange(pos, pos);
		});
	}

	function selectChannel(next: Channel, disabled: boolean) {
		if (disabled) return;
		channel = next;
		channelError = null;
	}

	async function handleCopyLink() {
		if (!onCopyLink) return;
		copyingLink = true;
		try {
			const closed = await onCopyLink();
			if (closed) open = false;
		} finally {
			copyingLink = false;
		}
	}

	async function confirm() {
		if (!anyAvailable) return;
		channelError = null;
		busy = true;
		try {
			const channels: ('email' | 'sms')[] =
				channel === 'both' ? ['email', 'sms'] : channel === 'email' ? ['email'] : ['sms'];
			const edited: Edited | null = editable
				? {
						sms: wantSms && smsValue !== defaultSms ? smsValue : null,
						subject: wantEmail && subjectValue !== defaultSubject ? subjectValue : null,
						body: wantEmail && bodyValue !== defaultBody ? bodyValue : null
					}
				: null;
			const result = await onConfirm(channels, edited);
			const normalized: ConfirmResult = typeof result === 'boolean' ? { ok: result } : result;
			if (normalized.ok) {
				open = false;
			} else if (normalized.channelError) {
				channelError = normalized.channelError;
			}
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="send-doc" showClose={false}>
		<div class="send-doc__header">
			<div class="send-doc__header-main">
				<Dialog.Title class="send-doc__title">
					{title}
					{#if titleNum}<span class="send-doc__title-num">{titleNum}</span>{/if}
				</Dialog.Title>
				<p class="send-doc__sub">{subtitle}</p>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="send-doc__body">
			<!-- Recipient -->
			<div class="send-doc__recipient">
				{#if batchMode}
					<p class="send-doc__recipient-name">{recipientName}</p>
					<p class="send-doc__recipient-meta"><span>{recipientSummary}</span></p>
				{:else}
					<p class="send-doc__recipient-name">{recipientName}</p>
					<p class="send-doc__recipient-meta">
						{#if recipientPhone}<span>{recipientPhone}</span>{/if}
						{#if recipientEmail}
							{#if recipientPhone}<span aria-hidden="true">·</span>{/if}
							<span>{recipientEmail}</span>
						{:else}
							{#if recipientPhone}<span aria-hidden="true">·</span>{/if}
							<span class="send-doc__recipient-warn">No email on file</span>
						{/if}
					</p>
				{/if}
			</div>

			<!-- Channel picker -->
			<div class="send-doc__group">
				<span class="send-doc__seg-label">Send via</span>
				<div class="send-doc__channels">
					{#each [{ key: 'email' as const, label: 'Email', icon: 'ri-mail-line', disabled: !emailAvailable }, { key: 'sms' as const, label: 'Text', icon: 'ri-message-2-line', disabled: !smsAvailable }, { key: 'both' as const, label: 'Both', icon: 'ri-send-plane-line', disabled: !(emailAvailable && smsAvailable) }] as opt (opt.key)}
						<button
							type="button"
							disabled={opt.disabled}
							onclick={() => selectChannel(opt.key, opt.disabled)}
							class="send-doc__channel"
							class:send-doc__channel--active={channel === opt.key && !opt.disabled}
						>
							<i class={opt.icon} aria-hidden="true"></i>
							{opt.label}
						</button>
					{/each}
				</div>
				{#if channelError}
					<p class="send-doc__error">{channelError}</p>
				{:else if !anyAvailable}
					<p class="send-doc__warn">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
						This customer has no email and has opted out of texts{onCopyLink
							? ' — copy the link and share it yourself instead.'
							: '.'}
					</p>
					{#if onCopyLink}
						<Button
							variant="outline"
							class="send-doc__copy-link"
							onclick={handleCopyLink}
							disabled={copyingLink}
						>
							<i
								class={copyingLink ? 'ri-loader-4-line send-doc__copy-spin' : 'ri-links-line'}
								aria-hidden="true"
							></i>
							{copyingLink ? 'Getting link…' : 'Copy link to share manually'}
						</Button>
					{/if}
				{/if}
			</div>

			{#if notice}
				<p class="send-doc__notice">{notice}</p>
			{/if}

			{#if editable}
				<!-- Text message (editable) -->
				{#if wantSms}
					<div class="send-doc__field">
						<div class="send-doc__field-head">
							<label for="notify-sms" class="send-doc__label">
								<i class="ri-message-2-line" aria-hidden="true"></i> Text message
							</label>
							<button
								type="button"
								onclick={() => (smsValue = defaultSms)}
								disabled={smsValue === defaultSms}
								class="send-doc__reset"
							>
								<i class="ri-refresh-line" aria-hidden="true"></i> Reset to default
							</button>
						</div>
						<div class="send-doc__tokens">
							{#each mergeFields as f (f.token)}
								<button
									type="button"
									onclick={() => insertToken('sms', f.token)}
									class="send-doc__token"
								>
									+ {f.label}
								</button>
							{/each}
						</div>
						<textarea
							id="notify-sms"
							bind:value={smsValue}
							bind:this={smsEl}
							rows="3"
							maxlength="640"
							class="send-doc__textarea"
						></textarea>
						<p class="send-doc__count">
							≈ {smsSegments} text message{smsSegments === 1 ? '' : 's'} · ~{smsCharLen} characters. Keep
							it short — each segment can add cost. The secure link is always included.
						</p>
						{#if smsPreview.trim().length > 0}
							<div class="send-doc__preview">
								<i class="ri-eye-line" aria-hidden="true"></i>
								<p class="send-doc__preview-text">{smsPreview}</p>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Email (editable) -->
				{#if wantEmail}
					<div class="send-doc__field">
						<div class="send-doc__field-head">
							<label for="notify-subject" class="send-doc__label">
								<i class="ri-mail-line" aria-hidden="true"></i> Email subject
							</label>
							<button
								type="button"
								onclick={() => (subjectValue = defaultSubject)}
								disabled={subjectValue === defaultSubject}
								class="send-doc__reset"
							>
								<i class="ri-refresh-line" aria-hidden="true"></i> Reset
							</button>
						</div>
						<input
							id="notify-subject"
							bind:value={subjectValue}
							maxlength="200"
							class="field__input"
						/>
						{#if subjectPreview.trim().length > 0 && subjectValue !== defaultSubject}
							<p class="send-doc__preview-text send-doc__preview-text--single">
								Preview: {subjectPreview}
							</p>
						{/if}
					</div>

					<div class="send-doc__field">
						<div class="send-doc__field-head">
							<label for="notify-body" class="send-doc__label">Email message</label>
							<button
								type="button"
								onclick={() => (bodyValue = defaultBody)}
								disabled={bodyValue === defaultBody}
								class="send-doc__reset"
							>
								<i class="ri-refresh-line" aria-hidden="true"></i> Reset to default
							</button>
						</div>
						<div class="send-doc__tokens">
							{#each mergeFields as f (f.token)}
								<button
									type="button"
									onclick={() => insertToken('body', f.token)}
									class="send-doc__token"
								>
									+ {f.label}
								</button>
							{/each}
						</div>
						<textarea
							id="notify-body"
							bind:value={bodyValue}
							bind:this={bodyEl}
							rows="5"
							maxlength="5000"
							class="send-doc__textarea send-doc__textarea--tall"
						></textarea>
						{#if bodyPreview.trim().length > 0}
							<div class="send-doc__preview">
								<i class="ri-eye-line" aria-hidden="true"></i>
								<p class="send-doc__preview-text">{bodyPreview}</p>
							</div>
						{/if}
					</div>
				{/if}
			{:else}
				<!-- Read-only preview (fixed template, e.g. reschedule) -->
				{#if wantSms}
					<div class="send-doc__field">
						<span class="send-doc__label">
							<i class="ri-message-2-line" aria-hidden="true"></i> Text message
						</span>
						<div class="send-doc__preview">
							<i class="ri-eye-line" aria-hidden="true"></i>
							<p class="send-doc__preview-text">{smsPreview}</p>
						</div>
					</div>
				{/if}
				{#if wantEmail}
					<div class="send-doc__field">
						<span class="send-doc__label">
							<i class="ri-mail-line" aria-hidden="true"></i> Email
						</span>
						{#if subjectPreview.trim().length > 0}
							<p class="send-doc__preview-text send-doc__preview-text--single">
								Subject: {subjectPreview}
							</p>
						{/if}
						<div class="send-doc__preview">
							<i class="ri-eye-line" aria-hidden="true"></i>
							<p class="send-doc__preview-text">{bodyPreview}</p>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<div class="send-doc__footer">
			{#if secondaryLabel}
				<Button variant="ghost" onclick={() => onSecondary?.()} disabled={busy}>
					{secondaryLabel}
				</Button>
			{:else}
				<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>
					{cancelLabel}
				</Button>
			{/if}
			<Button
				loadingLabel={confirmLoadingLabel}
				successLabel={confirmSuccessLabel}
				loading={busy}
				disabled={!anyAvailable}
				onclick={confirm}
			>
				{confirmLabel}
				{#snippet icon()}<i class="ri-send-plane-line" aria-hidden="true"></i>{/snippet}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
