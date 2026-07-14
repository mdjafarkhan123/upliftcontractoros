<script lang="ts">
	// Shows the contractor exactly what the client will receive when the job is scheduled,
	// merged with this job's real values, and lets them edit the wording for THIS job only.
	// Reads the loaded template + override state off the shared JobFormState; edits never
	// touch the org-level default in Settings → Automation.
	import { sessionStore } from '$lib/stores/session.svelte';
	import type { JobFormState } from '$lib/jobs/jobForm.svelte';

	let { form, contactName }: { form: JobFormState; contactName: string } = $props();

	const MERGE_FIELDS = [
		{ token: 'contact_name', label: 'Client name' },
		{ token: 'org_name', label: 'Business name' },
		{ token: 'job_title', label: 'Job title' },
		{ token: 'scheduled_datetime', label: 'Date & time' }
	] as const;

	const orgName = $derived(sessionStore.data?.org.name ?? 'Your business');

	const wantsSms = $derived(form.notifyChannel === 'sms' || form.notifyChannel === 'both');
	const wantsEmail = $derived(form.notifyChannel === 'email' || form.notifyChannel === 'both');

	// Best-effort local formatting for the preview. The actual send formats in the org's
	// timezone on the server — close enough to show the contractor the shape of the message.
	const scheduledDatetime = $derived.by(() => {
		if (!form.scheduledStart) return '[date & time]';
		const d = new Date(form.scheduledStart);
		if (isNaN(d.getTime())) return '[date & time]';
		return d.toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	});

	function fill(template: string): string {
		return template
			.replaceAll('{contact_name}', contactName || 'your client')
			.replaceAll('{org_name}', orgName)
			.replaceAll('{job_title}', form.title.trim() || 'your job')
			.replaceAll('{scheduled_datetime}', scheduledDatetime);
	}

	const smsPreview = $derived(form.notifyTemplate ? fill(form.notifySmsOverride) : '');
	const subjectPreview = $derived(form.notifyTemplate ? fill(form.notifySubjectOverride) : '');
	const bodyPreview = $derived(form.notifyTemplate ? fill(form.notifyBodyOverride) : '');

	let smsEl = $state<HTMLTextAreaElement | null>(null);
	let bodyEl = $state<HTMLTextAreaElement | null>(null);

	function insertToken(target: 'sms' | 'body', token: string) {
		const node = target === 'sms' ? smsEl : bodyEl;
		const piece = `{${token}}`;
		const current = target === 'sms' ? form.notifySmsOverride : form.notifyBodyOverride;
		if (!node) {
			if (target === 'sms') form.notifySmsOverride = current + piece;
			else form.notifyBodyOverride = current + piece;
			return;
		}
		const start = node.selectionStart ?? current.length;
		const end = node.selectionEnd ?? current.length;
		const next = current.slice(0, start) + piece + current.slice(end);
		if (target === 'sms') form.notifySmsOverride = next;
		else form.notifyBodyOverride = next;
		queueMicrotask(() => {
			node.focus();
			const pos = start + piece.length;
			node.setSelectionRange(pos, pos);
		});
	}

	function startEditing() {
		form.notifyEditing = true;
	}

	// Cancel the per-job edit: drop back to the org default and reset the boxes to it.
	function useDefault() {
		const t = form.notifyTemplate;
		if (t) {
			form.notifySmsOverride = t.sms;
			form.notifySubjectOverride = t.subject;
			form.notifyBodyOverride = t.body;
		}
		form.notifyEditing = false;
	}
</script>

{#if form.notifyTemplateLoading && !form.notifyTemplate}
	<div class="notify-preview notify-preview--loading">
		<i class="ri-loader-4-line notify-preview__spinner" aria-hidden="true"></i>
		<span>Loading message preview…</span>
	</div>
{:else if form.notifyTemplate}
	{#if !form.notifyTemplate.enabled}
		<div class="notify-preview notify-preview--off">
			<i class="ri-information-line" aria-hidden="true"></i>
			<span>
				Job confirmations are turned off in Settings → Automation, so no message will be sent.
			</span>
		</div>
	{:else if !form.notifyEditing}
		<!-- Read-only preview of the default message -->
		<div class="notify-preview">
			<div class="notify-preview__head">
				<span class="notify-preview__title">
					<i class="ri-eye-line" aria-hidden="true"></i>
					What the client will get
				</span>
				<button type="button" class="notify-preview__edit" onclick={startEditing}>
					<i class="ri-pencil-line" aria-hidden="true"></i>
					Edit message
				</button>
			</div>
			{#if wantsSms}
				<div class="notify-preview__msg">
					<span class="notify-preview__chan"><i class="ri-message-2-line" aria-hidden="true"></i> Text</span>
					<p class="notify-preview__text">{smsPreview}</p>
				</div>
			{/if}
			{#if wantsEmail}
				<div class="notify-preview__msg">
					<span class="notify-preview__chan"><i class="ri-mail-line" aria-hidden="true"></i> Email</span>
					<p class="notify-preview__subject">{subjectPreview}</p>
					<p class="notify-preview__text">{bodyPreview}</p>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Per-job edit -->
		<div class="notify-preview notify-preview--editing">
			<div class="notify-preview__head">
				<span class="notify-preview__title">
					<i class="ri-pencil-line" aria-hidden="true"></i>
					Edit message for this job
				</span>
				<button type="button" class="notify-preview__edit" onclick={useDefault}>
					<i class="ri-arrow-go-back-line" aria-hidden="true"></i>
					Use default
				</button>
			</div>
			<p class="notify-preview__note">Changes apply to this job only — your saved default isn't affected.</p>

			{#if wantsSms}
				<div class="notify-preview__field">
					<div class="notify-preview__field-head">
						<label for="notify-sms" class="notify-preview__label">
							<i class="ri-message-2-line" aria-hidden="true"></i> Text message
						</label>
						<button
							type="button"
							class="notify-preview__reset"
							onclick={() => form.notifyTemplate && (form.notifySmsOverride = form.notifyTemplate.sms)}
							disabled={form.notifySmsOverride === form.notifyTemplate?.sms}
						>
							<i class="ri-refresh-line" aria-hidden="true"></i> Reset
						</button>
					</div>
					<div class="notify-preview__tokens">
						{#each MERGE_FIELDS as f (f.token)}
							<button type="button" class="notify-preview__token" onclick={() => insertToken('sms', f.token)}>
								+ {f.label}
							</button>
						{/each}
					</div>
					<textarea
						id="notify-sms"
						bind:value={form.notifySmsOverride}
						bind:this={smsEl}
						rows="3"
						maxlength="500"
						class="notify-preview__textarea"
					></textarea>
					{#if smsPreview.trim().length > 0}
						<p class="notify-preview__live"><i class="ri-eye-line" aria-hidden="true"></i> {smsPreview}</p>
					{/if}
				</div>
			{/if}

			{#if wantsEmail}
				<div class="notify-preview__field">
					<div class="notify-preview__field-head">
						<label for="notify-subject" class="notify-preview__label">
							<i class="ri-mail-line" aria-hidden="true"></i> Email subject
						</label>
						<button
							type="button"
							class="notify-preview__reset"
							onclick={() =>
								form.notifyTemplate && (form.notifySubjectOverride = form.notifyTemplate.subject)}
							disabled={form.notifySubjectOverride === form.notifyTemplate?.subject}
						>
							<i class="ri-refresh-line" aria-hidden="true"></i> Reset
						</button>
					</div>
					<input
						id="notify-subject"
						class="field__input"
						bind:value={form.notifySubjectOverride}
						maxlength="200"
					/>
				</div>
				<div class="notify-preview__field">
					<div class="notify-preview__field-head">
						<label for="notify-body" class="notify-preview__label">Email message</label>
						<button
							type="button"
							class="notify-preview__reset"
							onclick={() => form.notifyTemplate && (form.notifyBodyOverride = form.notifyTemplate.body)}
							disabled={form.notifyBodyOverride === form.notifyTemplate?.body}
						>
							<i class="ri-refresh-line" aria-hidden="true"></i> Reset
						</button>
					</div>
					<div class="notify-preview__tokens">
						{#each MERGE_FIELDS as f (f.token)}
							<button type="button" class="notify-preview__token" onclick={() => insertToken('body', f.token)}>
								+ {f.label}
							</button>
						{/each}
					</div>
					<textarea
						id="notify-body"
						bind:value={form.notifyBodyOverride}
						bind:this={bodyEl}
						rows="5"
						maxlength="2000"
						class="notify-preview__textarea notify-preview__textarea--tall"
					></textarea>
					{#if bodyPreview.trim().length > 0}
						<p class="notify-preview__live"><i class="ri-eye-line" aria-hidden="true"></i> {bodyPreview}</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.notify-preview {
		margin-top: $space-3;
		padding: $space-3;
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);
		font-size: $fs-body;

		&--loading,
		&--off {
			display: flex;
			align-items: center;
			gap: $space-2;
			color: var(--color-text-muted);
		}

		&__spinner {
			animation: spin 0.8s linear infinite;
			color: var(--color-brand);
		}

		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			margin-bottom: $space-2;
		}

		&__title {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-weight: 600;
			color: var(--color-text-secondary);

			i {
				color: var(--color-brand);
			}
		}

		&__edit {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			border: none;
			background: transparent;
			padding: 0;
			font-size: $fs-body;
			font-weight: 600;
			color: var(--color-brand);
			cursor: pointer;

			&:hover {
				text-decoration: underline;
			}
		}

		&__note {
			margin: 0 0 $space-3;
			color: var(--color-text-muted);
		}

		&__msg {
			padding: $space-2 0;

			& + & {
				border-top: 1px solid var(--color-border);
			}
		}

		&__chan {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			margin-bottom: $space-1;
			font-size: $fs-caption;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			color: var(--color-text-muted);
		}

		&__subject {
			margin: 0 0 2px;
			font-weight: 600;
			color: var(--color-text-primary);
		}

		&__text {
			margin: 0;
			white-space: pre-wrap;
			color: var(--color-text-secondary);
		}

		&__field {
			margin-top: $space-3;
		}

		&__field-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			margin-bottom: $space-1;
		}

		&__label {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-weight: 600;
			color: var(--color-text-secondary);
		}

		&__reset {
			display: inline-flex;
			align-items: center;
			gap: 2px;
			border: none;
			background: transparent;
			padding: 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
			cursor: pointer;

			&:disabled {
				opacity: 0.4;
				cursor: default;
			}
		}

		&__tokens {
			display: flex;
			flex-wrap: wrap;
			gap: $space-1;
			margin-bottom: $space-2;
		}

		&__token {
			border: 1px solid var(--color-border);
			border-radius: $radius-full;
			background: var(--color-bg-surface);
			padding: 2px $space-2;
			font-size: $fs-caption;
			color: var(--color-text-secondary);
			cursor: pointer;

			&:hover {
				border-color: var(--color-brand);
				color: var(--color-brand);
			}
		}

		&__textarea {
			width: 100%;
			padding: $space-2;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			font: inherit;
			color: var(--color-text-primary);
			resize: vertical;

			&--tall {
				min-height: 110px;
			}
		}

		&__live {
			display: flex;
			gap: $space-1;
			margin: $space-2 0 0;
			padding: $space-2;
			border-radius: $radius-sm;
			background: var(--color-bg-surface);
			white-space: pre-wrap;
			color: var(--color-text-secondary);

			i {
				color: var(--color-text-muted);
				flex-shrink: 0;
			}
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
