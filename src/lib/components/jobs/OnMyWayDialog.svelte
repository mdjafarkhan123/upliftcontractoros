<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		open = $bindable(false),
		jobId,
		onSent
	}: {
		open?: boolean;
		jobId: string;
		onSent?: () => void;
	} = $props();

	type ChannelState = { available: boolean; reason: string | null };
	type PreviewData = {
		enabled: boolean;
		job_closed: boolean;
		contact_name: string;
		channels: { sms: ChannelState; email: ChannelState };
		preview: { sms_body: string; email_subject: string; email_body: string };
	};
	type Selection = 'sms' | 'email' | 'both';

	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let data = $state<PreviewData | null>(null);
	let selection = $state<Selection>('both');
	let busy = $state(false);

	const smsOk = $derived(data?.channels.sms.available ?? false);
	const emailOk = $derived(data?.channels.email.available ?? false);
	const anyOk = $derived(smsOk || emailOk);
	// Disabled when the feature is off, the job is closed, or there's no reachable
	// channel — the dialog still opens so the contractor sees *why* it's blocked.
	const blocked = $derived(!data || !data.enabled || data.job_closed || !anyOk);

	const wantSms = $derived(selection === 'sms' || selection === 'both');
	const wantEmail = $derived(selection === 'email' || selection === 'both');

	function defaultSelection(): Selection {
		if (smsOk && emailOk) return 'both';
		if (smsOk) return 'sms';
		return 'email';
	}

	// Load preview + reachability whenever the dialog opens for a job.
	let loadedFor = $state<string | null>(null);
	$effect(() => {
		if (open && loadedFor !== jobId) {
			loadedFor = jobId;
			void load();
		} else if (!open) {
			loadedFor = null;
		}
	});

	async function load() {
		loading = true;
		loadError = null;
		data = null;
		try {
			const res = await fetch(`/api/jobs/${jobId}/on-my-way`);
			const body = await res.json();
			if (!res.ok) {
				loadError = body.error ?? 'Could not load the message.';
				return;
			}
			data = body.data as PreviewData;
			selection = defaultSelection();
		} catch {
			loadError = 'Network error — please try again.';
		} finally {
			loading = false;
		}
	}

	function selectChannel(next: Selection, disabled: boolean) {
		if (disabled) return;
		selection = next;
	}

	async function send() {
		if (blocked || busy) return;
		busy = true;
		try {
			const channels: ('sms' | 'email')[] = selection === 'both' ? ['sms', 'email'] : [selection];
			const res = await fetch(`/api/jobs/${jobId}/on-my-way`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ channels })
			});
			if (res.status === 204) {
				toast.success('“On my way” message sent');
				open = false;
				onSent?.();
				return;
			}
			const body = await res.json();
			toast.error(body.error ?? 'Could not send the message.');
		} catch {
			toast.error('Network error — please try again.');
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="omw" showClose={false}>
		<div class="omw__header">
			<div class="omw__header-main">
				<Dialog.Title class="omw__title">
					<i class="ri-truck-line" aria-hidden="true"></i> On my way
				</Dialog.Title>
				<p class="omw__sub">Let the customer know you're heading over.</p>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="omw__body">
			{#if loading}
				<p class="omw__muted">Loading…</p>
			{:else if loadError}
				<p class="omw__warn">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					{loadError}
				</p>
			{:else if data}
				<p class="omw__recipient">To <strong>{data.contact_name}</strong></p>

				{#if !data.enabled}
					<p class="omw__warn">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
						“On my way” messages are turned off in Settings → Automation.
					</p>
				{:else if data.job_closed}
					<p class="omw__warn">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
						This job is closed — you can only send for active jobs.
					</p>
				{/if}

				<!-- Channel picker -->
				<div class="omw__group">
					<span class="omw__seg-label">Send via</span>
					<div class="omw__channels">
						{#each [{ key: 'sms' as const, label: 'Text', icon: 'ri-message-2-line', disabled: !smsOk }, { key: 'email' as const, label: 'Email', icon: 'ri-mail-line', disabled: !emailOk }, { key: 'both' as const, label: 'Both', icon: 'ri-send-plane-line', disabled: !(smsOk && emailOk) }] as opt (opt.key)}
							<button
								type="button"
								disabled={opt.disabled}
								onclick={() => selectChannel(opt.key, opt.disabled)}
								class="omw__channel"
								class:omw__channel--active={selection === opt.key && !opt.disabled}
							>
								<i class={opt.icon} aria-hidden="true"></i>
								{opt.label}
							</button>
						{/each}
					</div>
					{#if !anyOk}
						<p class="omw__warn">
							<i class="ri-error-warning-line" aria-hidden="true"></i>
							No way to reach this customer.
							{#if data.channels.sms.reason}<span> Text: {data.channels.sms.reason}</span>{/if}
							{#if data.channels.email.reason}<span> Email: {data.channels.email.reason}</span>{/if}
						</p>
					{:else}
						{#if !smsOk && data.channels.sms.reason}
							<p class="omw__hint">Text unavailable: {data.channels.sms.reason}</p>
						{/if}
						{#if !emailOk && data.channels.email.reason}
							<p class="omw__hint">Email unavailable: {data.channels.email.reason}</p>
						{/if}
					{/if}
				</div>

				<!-- Preview -->
				{#if anyOk}
					<div class="omw__preview-head">Preview</div>
					{#if wantSms && smsOk}
						<div class="omw__preview">
							<span class="omw__preview-tag"
								><i class="ri-message-2-line" aria-hidden="true"></i> Text</span
							>
							<p class="omw__preview-text">{data.preview.sms_body}</p>
						</div>
					{/if}
					{#if wantEmail && emailOk}
						<div class="omw__preview">
							<span class="omw__preview-tag"
								><i class="ri-mail-line" aria-hidden="true"></i> Email</span
							>
							<p class="omw__preview-subject">{data.preview.email_subject}</p>
							<p class="omw__preview-text">{data.preview.email_body}</p>
						</div>
					{/if}
					<p class="omw__hint">Edit this wording in Settings → Automation → “On my way”.</p>
				{/if}
			{/if}
		</div>

		<div class="omw__footer">
			<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>
				Cancel
			</Button>
			<Button
				loadingLabel="Sending…"
				successLabel="Sent"
				loading={busy}
				disabled={blocked}
				onclick={send}
			>
				Send now
				{#snippet icon()}<i class="ri-send-plane-line" aria-hidden="true"></i>{/snippet}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	// Sizes use the app's 10px rem base (html { font-size: 62.5% }):
	// move the decimal — 14px → 1.4rem.
	.omw__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.2rem;
		margin-bottom: 1.6rem;
	}
	.omw__title {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		font-size: var(--text-h3);
		font-weight: 600;
		color: var(--color-text-primary);
	}
	.omw__sub {
		margin-top: 0.4rem;
		font-size: var(--text-body);
		color: var(--color-text-muted);
	}
	.omw__body {
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
	}
	.omw__recipient {
		font-size: var(--text-body);
		color: var(--color-text-secondary);
	}
	.omw__muted {
		font-size: var(--text-body);
		color: var(--color-text-muted);
	}
	.omw__group {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.omw__seg-label {
		font-size: var(--text-body);
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	.omw__channels {
		display: flex;
		gap: 0.8rem;
	}
	.omw__channel {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		flex: 1;
		padding: 0.9rem 0.8rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-bg-surface);
		color: var(--color-text-secondary);
		font-size: var(--text-body);
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;

		&:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}
		&--active {
			background: var(--color-brand);
			border-color: var(--color-brand);
			color: var(--color-text-on-brand);
		}
	}
	.omw__preview-head {
		font-size: var(--text-body);
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	.omw__preview {
		padding: 1.2rem;
		border: 1px solid var(--color-border);
		border-radius: 1.2rem;
		background: var(--color-bg-surface-sunk);
	}
	.omw__preview-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-caption);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
		margin-bottom: 0.6rem;
	}
	.omw__preview-subject {
		font-weight: 600;
		font-size: var(--text-body);
		color: var(--color-text-primary);
		margin-bottom: 0.4rem;
	}
	.omw__preview-text {
		font-size: var(--text-body);
		line-height: 1.5;
		color: var(--color-text-primary);
		white-space: pre-wrap;
	}
	.omw__hint {
		font-size: var(--text-body);
		color: var(--color-text-muted);
	}
	.omw__warn {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		font-size: var(--text-body);
		color: #b45309;
	}
	.omw__footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.8rem;
		margin-top: 2rem;
	}
</style>
