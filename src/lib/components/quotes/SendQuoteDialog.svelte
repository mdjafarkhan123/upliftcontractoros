<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { cn } from '$lib/utils/cn';
	import { browser } from '$app/environment';
	import { Send, Mail, MessageSquare, RotateCcw, Eye, TriangleAlert } from '@lucide/svelte';

	let {
		open = $bindable(false),
		quoteId,
		quoteNumberDisplay,
		title,
		total,
		contactName,
		contactEmail,
		contactPhone,
		contactSmsOptOut = false,
		mode,
		onSent
	}: {
		open?: boolean;
		quoteId: string;
		quoteNumberDisplay: string;
		title: string;
		total: string;
		contactName: string;
		contactEmail: string | null;
		contactPhone: string;
		contactSmsOptOut?: boolean;
		mode: 'send' | 'resend';
		onSent?: () => void;
	} = $props();

	type Channel = 'email' | 'sms' | 'both';

	const MERGE_FIELDS = [
		{ token: 'contact_name', label: 'Contact name' },
		{ token: 'org_name', label: 'Business name' },
		{ token: 'quote_number', label: 'Quote #' },
		{ token: 'quote_amount', label: 'Quote total' },
		{ token: 'quote_link', label: 'Quote link' }
	] as const;

	const orgName = $derived(sessionStore.data?.org.name ?? 'Your business');
	const totalDisplay = $derived(formatCurrency(total));
	const verb = $derived(mode === 'send' ? 'sent you a quote' : 'updated your quote');

	const emailAvailable = $derived(Boolean(contactEmail));
	const smsAvailable = $derived(!contactSmsOptOut && Boolean(contactPhone));
	const anyAvailable = $derived(emailAvailable || smsAvailable);

	// Tokenized defaults — these mirror the worker's built-in copy. When the
	// contractor leaves a field untouched we send null so the worker default
	// stays the single source of truth.
	const defaultSms = $derived(
		`Hi {contact_name}, {org_name} ${verb} ({quote_number}, {quote_amount}). View it here: {quote_link}`
	);
	const defaultSubject = $derived(
		mode === 'send'
			? `Your quote {quote_number} from {org_name}`
			: `Updated quote {quote_number} from {org_name}`
	);
	const defaultBody = $derived(
		`Hi {contact_name},\n\n{org_name} has ${verb} ({quote_number}, {quote_amount}).\n\nView your quote:\n{quote_link}`
	);

	let channel = $state<Channel>('both');
	let smsValue = $state('');
	let subjectValue = $state('');
	let bodyValue = $state('');
	let channelError = $state<string | null>(null);
	let busy = $state(false);

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
	const linkDisplay = $derived(
		(browser ? window.location.origin.replace(/^https?:\/\//, '') : 'your-site.com') + '/q/…'
	);
	// Representative full link length for an honest SMS character estimate.
	const linkForCount = $derived(
		(browser ? window.location.origin : 'https://app.example.com') + '/q/' + 'x'.repeat(22)
	);

	function fill(template: string, link: string): string {
		return template
			.replaceAll('{contact_name}', contactName)
			.replaceAll('{org_name}', orgName)
			.replaceAll('{quote_number}', quoteNumberDisplay)
			.replaceAll('{quote_amount}', totalDisplay)
			.replaceAll('{quote_link}', link);
	}

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

	async function confirm() {
		if (!anyAvailable) return;
		channelError = null;
		busy = true;
		try {
			const channels: ('email' | 'sms')[] =
				channel === 'both' ? ['email', 'sms'] : channel === 'email' ? ['email'] : ['sms'];
			const body = {
				channels,
				sms_body: wantSms && smsValue !== defaultSms ? smsValue : null,
				email_subject: wantEmail && subjectValue !== defaultSubject ? subjectValue : null,
				email_body: wantEmail && bodyValue !== defaultBody ? bodyValue : null
			};
			const path = mode === 'send' ? 'send' : 'resend';
			const res = await fetch(`/api/quotes/${quoteId}/${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json();
			if (!res.ok) {
				if (payload.field_errors?.channels) channelError = payload.field_errors.channels;
				toast.error(payload.error ?? 'Failed to send');
				return;
			}
			toast.success(mode === 'send' ? 'Quote sent' : 'Quote resent');
			open = false;
			onSent?.();
		} catch {
			toast.error('Network error');
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-xl gap-0 p-0">
		<Dialog.Header class="border-b border-border px-5 py-4 sm:px-6">
			<Dialog.Title class="text-base font-semibold">
				{mode === 'send' ? 'Send quote' : 'Resend quote'}
				<span class="text-muted-foreground">· {quoteNumberDisplay}</span>
			</Dialog.Title>
			<p class="truncate text-sm text-muted-foreground">{title} · {formatCurrency(total)}</p>
		</Dialog.Header>

		<div class="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
			<!-- Recipient -->
			<div class="rounded-xl border border-border bg-muted/40 p-3.5">
				<p class="text-sm font-semibold text-foreground">{contactName}</p>
				<p
					class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
				>
					<span>{contactPhone}</span>
					{#if contactEmail}
						<span aria-hidden="true">·</span><span>{contactEmail}</span>
					{:else}
						<span aria-hidden="true">·</span><span class="text-amber-600 dark:text-amber-400"
							>No email on file</span
						>
					{/if}
				</p>
			</div>

			<!-- Channel picker -->
			<div class="space-y-2">
				<Label class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Send via
				</Label>
				<div class="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-muted/30 p-1">
					{#each [{ key: 'email' as const, label: 'Email', icon: Mail, disabled: !emailAvailable }, { key: 'sms' as const, label: 'Text', icon: MessageSquare, disabled: !smsAvailable }, { key: 'both' as const, label: 'Both', icon: Send, disabled: !(emailAvailable && smsAvailable) }] as opt (opt.key)}
						<button
							type="button"
							disabled={opt.disabled}
							onclick={() => selectChannel(opt.key, opt.disabled)}
							class={cn(
								'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-all',
								channel === opt.key && !opt.disabled
									? 'bg-background text-foreground shadow-sm ring-1 ring-border'
									: 'text-muted-foreground hover:text-foreground',
								opt.disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground'
							)}
						>
							<opt.icon class="h-4 w-4" />
							{opt.label}
						</button>
					{/each}
				</div>
				{#if channelError}
					<p class="text-xs text-destructive">{channelError}</p>
				{:else if !anyAvailable}
					<p class="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
						<TriangleAlert class="h-3.5 w-3.5" />
						This customer has no email and has opted out of texts — no way to deliver.
					</p>
				{/if}
			</div>

			{#if mode === 'resend'}
				<p class="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
					Resending rotates the public link. Previous links stop working immediately.
				</p>
			{/if}

			<!-- Text message -->
			{#if wantSms}
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="sms-body" class="flex items-center gap-1.5 text-sm font-medium">
							<MessageSquare class="h-3.5 w-3.5 text-muted-foreground" /> Text message
						</Label>
						<button
							type="button"
							onclick={() => (smsValue = defaultSms)}
							disabled={smsValue === defaultSms}
							class="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
						>
							<RotateCcw class="h-3 w-3" /> Reset to default
						</button>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each MERGE_FIELDS as f (f.token)}
							<button
								type="button"
								onclick={() => insertToken('sms', f.token)}
								class="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
							>
								+ {f.label}
							</button>
						{/each}
					</div>
					<textarea
						id="sms-body"
						bind:value={smsValue}
						bind:this={smsEl}
						rows="3"
						maxlength="640"
						class="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					></textarea>
					<p class="text-[11px] text-muted-foreground/80">
						≈ {smsSegments} text message{smsSegments === 1 ? '' : 's'} · ~{smsCharLen} characters. Keep
						it short — each segment can add cost. The secure link is always included.
					</p>
					{#if smsPreview.trim().length > 0}
						<div
							class="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2"
						>
							<Eye
								class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
								aria-hidden="true"
							/>
							<p class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
								{smsPreview}
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Email -->
			{#if wantEmail}
				<div class="space-y-3">
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label for="email-subject" class="flex items-center gap-1.5 text-sm font-medium">
								<Mail class="h-3.5 w-3.5 text-muted-foreground" /> Email subject
							</Label>
							<button
								type="button"
								onclick={() => (subjectValue = defaultSubject)}
								disabled={subjectValue === defaultSubject}
								class="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
							>
								<RotateCcw class="h-3 w-3" /> Reset
							</button>
						</div>
						<input
							id="email-subject"
							bind:value={subjectValue}
							maxlength="200"
							class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						/>
						{#if subjectPreview.trim().length > 0 && subjectValue !== defaultSubject}
							<p class="truncate text-[11px] text-muted-foreground/80">Preview: {subjectPreview}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label for="email-body" class="text-sm font-medium">Email message</Label>
							<button
								type="button"
								onclick={() => (bodyValue = defaultBody)}
								disabled={bodyValue === defaultBody}
								class="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
							>
								<RotateCcw class="h-3 w-3" /> Reset to default
							</button>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each MERGE_FIELDS as f (f.token)}
								<button
									type="button"
									onclick={() => insertToken('body', f.token)}
									class="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
								>
									+ {f.label}
								</button>
							{/each}
						</div>
						<textarea
							id="email-body"
							bind:value={bodyValue}
							bind:this={bodyEl}
							rows="5"
							maxlength="5000"
							class="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						></textarea>
						{#if bodyPreview.trim().length > 0}
							<div
								class="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2"
							>
								<Eye
									class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
									aria-hidden="true"
								/>
								<p class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
									{bodyPreview}
								</p>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<Dialog.Footer class="border-t border-border px-5 py-4 sm:px-6">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<JetEngineButton
				label={mode === 'send' ? 'Send now' : 'Resend now'}
				loadingLabel="Sending…"
				successLabel="Sent"
				state={busy ? 'loading' : 'idle'}
				disabled={!anyAvailable}
				onclick={confirm}
			>
				{#snippet icon()}<Send class="h-4 w-4" />{/snippet}
			</JetEngineButton>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
