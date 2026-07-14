<script lang="ts">
	import NotifyDialog from '$lib/components/shared/NotifyDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { browser } from '$app/environment';

	// Thin quote/invoice wrapper over the shared NotifyDialog. Every per-entity
	// difference (merge tokens, default copy, API paths, public-link prefix, whether a
	// re-send rotates the link) is derived from `kind` here; the generic channel picker,
	// editable message editor, preview, counts and copy-link escape hatch all live in
	// NotifyDialog. This wrapper owns the actual /send, /resend and /share-link fetches.
	let {
		open = $bindable(false),
		kind,
		documentId,
		numberDisplay,
		subtitle,
		amountForTokens,
		contactName,
		contactEmail,
		contactPhone,
		contactSmsOptOut = false,
		mode,
		revision = false,
		onSent
	}: {
		open?: boolean;
		kind: 'quote' | 'invoice';
		documentId: string;
		// e.g. "Q-1042" / "INV-1042"
		numberDisplay: string;
		// Sub line under the title, prebuilt by the caller (e.g. "Fence install · $1,200").
		subtitle: string;
		// Formatted amount substituted into the {..._amount} merge token.
		amountForTokens: string;
		contactName: string;
		contactEmail: string | null;
		contactPhone: string;
		contactSmsOptOut?: boolean;
		mode: 'send' | 'resend';
		// Quotes only: true when a re-send follows an edit of an already-sent quote, so the
		// server freezes a new version. Ignored for invoices (no versioning) and on 'send'.
		revision?: boolean;
		onSent?: () => void;
	} = $props();

	// ── Per-entity configuration ──────────────────────────────────────────────
	const cfg = $derived.by(() => {
		const isQuote = kind === 'quote';
		return {
			noun: isQuote ? 'quote' : 'invoice',
			Noun: isQuote ? 'Quote' : 'Invoice',
			apiBase: isQuote ? `/api/quotes/${documentId}` : `/api/invoices/${documentId}`,
			// Quotes use a dedicated /resend endpoint; invoices re-send through /send.
			sendPath: isQuote ? (mode === 'send' ? 'send' : 'resend') : 'send',
			linkPrefix: isQuote ? '/q/' : '/i/',
			numToken: isQuote ? 'quote_number' : 'invoice_number',
			amtToken: isQuote ? 'quote_amount' : 'invoice_amount',
			linkToken: isQuote ? 'quote_link' : 'invoice_link',
			viewVerb: isQuote ? 'View it here' : 'View & pay'
		};
	});

	const mergeFields = $derived([
		{ token: 'contact_name', label: 'Contact name' },
		{ token: 'org_name', label: 'Business name' },
		{ token: cfg.numToken, label: `${cfg.Noun} #` },
		{ token: cfg.amtToken, label: `${cfg.Noun} total` },
		{ token: cfg.linkToken, label: `${cfg.Noun} link` }
	]);

	const orgName = $derived(sessionStore.data?.org.name ?? 'Your business');
	const verb = $derived(mode === 'send' ? `sent you a ${cfg.noun}` : `updated your ${cfg.noun}`);

	// Tokenized defaults — these mirror the worker's built-in copy. When the contractor
	// leaves a field untouched we send null so the worker default stays the single source
	// of truth.
	const defaultSms = $derived(
		`Hi {contact_name}, {org_name} ${verb} ({${cfg.numToken}}, {${cfg.amtToken}}). ${cfg.viewVerb}: {${cfg.linkToken}}`
	);
	const defaultSubject = $derived(
		mode === 'send'
			? `Your ${cfg.noun} {${cfg.numToken}} from {org_name}`
			: `Updated ${cfg.noun} {${cfg.numToken}} from {org_name}`
	);
	const defaultBody = $derived(
		`Hi {contact_name},\n\n{org_name} has ${verb} ({${cfg.numToken}}, {${cfg.amtToken}}).\n\n${cfg.viewVerb} your ${cfg.noun}:\n{${cfg.linkToken}}`
	);

	// ── Preview link strings ───────────────────────────────────────────────────
	const linkDisplay = $derived(
		(browser ? window.location.origin.replace(/^https?:\/\//, '') : 'your-site.com') +
			cfg.linkPrefix +
			'…'
	);
	// Representative full link length for an honest SMS character estimate.
	const linkForCount = $derived(
		(browser ? window.location.origin : 'https://app.example.com') + cfg.linkPrefix + 'x'.repeat(22)
	);

	function fill(template: string, link: string): string {
		return template
			.replaceAll('{contact_name}', contactName)
			.replaceAll('{org_name}', orgName)
			.replaceAll(`{${cfg.numToken}}`, numberDisplay)
			.replaceAll(`{${cfg.amtToken}}`, amountForTokens)
			.replaceAll(`{${cfg.linkToken}}`, link);
	}

	const notice = $derived.by(() => {
		if (mode !== 'resend') return null;
		if (kind === 'quote') {
			return (
				(revision ? 'Your edited quote goes out as a new version. ' : '') +
				'Resending rotates the public link — previous links stop working immediately.'
			);
		}
		return 'Re-sending notifies the customer again on the channel(s) you choose. The payment link stays the same.';
	});

	const title = $derived(mode === 'send' ? `Send ${cfg.noun}` : `Resend ${cfg.noun}`);

	async function onConfirm(
		channels: ('email' | 'sms')[],
		edited: { sms: string | null; subject: string | null; body: string | null } | null
	): Promise<{ ok: boolean; channelError?: string }> {
		try {
			const body = {
				channels,
				sms_body: edited?.sms ?? null,
				email_subject: edited?.subject ?? null,
				email_body: edited?.body ?? null,
				// Quotes: a revision re-send freezes a new version on the server. Invoices have no
				// versioning, so this is always omitted for them.
				revision: kind === 'quote' && mode === 'resend' ? revision : undefined
			};
			const res = await fetch(`${cfg.apiBase}/${cfg.sendPath}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json();
			if (!res.ok) {
				toast.error(payload.error ?? 'Failed to send');
				return { ok: false, channelError: payload.field_errors?.channels };
			}
			toast.success(`${cfg.Noun} ${mode === 'send' ? 'sent' : 'resent'}`);
			onSent?.();
			return { ok: true };
		} catch {
			toast.error('Network error');
			return { ok: false };
		}
	}

	// Escape hatch for the "no email + opted out of texts" dead end: grab the public
	// link and copy it so the contractor can paste it anywhere. For a draft this activates
	// the document (moves it to Sent) without firing automations.
	async function onCopyLink(): Promise<boolean> {
		try {
			const res = await fetch(`${cfg.apiBase}/share-link`, { method: 'POST' });
			const payload = await res.json();
			if (!res.ok) {
				toast.error(payload.error ?? 'Could not get the link');
				return false;
			}
			try {
				await navigator.clipboard.writeText(payload.data.url);
				toast.success('Link copied — paste it anywhere to share');
			} catch {
				toast.error('Link ready, but copying failed');
			}
			onSent?.();
			return true;
		} catch {
			toast.error('Network error');
			return false;
		}
	}
</script>

<NotifyDialog
	bind:open
	{title}
	titleNum={`· ${numberDisplay}`}
	{subtitle}
	recipientName={contactName}
	recipientEmail={contactEmail}
	recipientPhone={contactPhone}
	recipientSmsOptOut={contactSmsOptOut}
	editable
	{mergeFields}
	{fill}
	{defaultSms}
	{defaultSubject}
	{defaultBody}
	{linkDisplay}
	{linkForCount}
	{notice}
	confirmLabel={mode === 'send' ? 'Send now' : 'Resend now'}
	confirmSuccessLabel="Sent"
	{onCopyLink}
	{onConfirm}
/>
