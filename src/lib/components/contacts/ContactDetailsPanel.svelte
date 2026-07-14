<script lang="ts">
	import { onMount } from 'svelte';
	import InlineEditRow from '$lib/components/shared/InlineEditRow.svelte';
	import type { InlineEditController } from '$lib/components/shared/inlineEditController.svelte';
	import PhoneField from '$lib/components/shared/PhoneField.svelte';
	import ContactTagsEditor from '$lib/components/contacts/ContactTagsEditor.svelte';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { getOrgContext } from '$lib/context/org';
	import { contactDetailStore } from '$lib/stores/contactDetail.svelte';
	import type { ContactDetailResponse } from '$lib/stores/contactDetail.svelte';
	import { contactsStore } from '$lib/stores/contacts.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatDateTime } from '$lib/utils/format';
	import { formatTagLabel } from '$lib/contacts/tags';
	import { LEAD_SOURCE_LABELS, type LeadSource } from '$lib/contacts/leadSource';
	import { PHONE_LABEL_DISPLAY } from '$lib/contacts/phoneLabel';

	let {
		contactId,
		contact,
		assigneeName = null,
		referrerId = null,
		referrerName = null,
		canEdit = false,
		editCtl
	}: {
		contactId: string;
		contact: ContactDetailResponse['contact'];
		assigneeName?: string | null;
		referrerId?: string | null;
		referrerName?: string | null;
		canEdit?: boolean;
		editCtl: InlineEditController;
	} = $props();

	const org = getOrgContext();
	const orgCountry = $derived(org().country ?? 'US');

	// --- Assignees (only needed to edit) ---
	let assignees = $state<Array<{ id: string; full_name: string }>>([]);
	onMount(async () => {
		if (!canEdit) return;
		const res = await fetch('/api/contacts/assignees');
		if (res.ok) {
			const body = (await res.json()) as { assignees: Array<{ id: string; full_name: string }> };
			assignees = body.assignees;
		}
	});

	// --- Drafts (seeded on entering each row) ---
	let companyDraft = $state('');
	let emailDraft = $state('');
	let phoneDraft = $state('');
	let altPhoneDraft = $state('');
	let altLabelDraft = $state<'' | 'mobile' | 'home' | 'work' | 'fax' | 'other'>('');
	let sourceDraft = $state('');
	let tempDraft = $state<'' | 'hot' | 'warm' | 'cold'>('');
	let assigneeDraft = $state('');
	let methodDraft = $state<'' | 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger'>('');
	let followUpDraft = $state('');
	let tagsDraft = $state<string[]>([]);
	let dncSaving = $state(false);
	let emailOptInSaving = $state(false);

	// Inline editing is coordinated by the shared page-level controller so the ONE
	// Save/Cancel bar (in the header topbar) serves every field on the page. Each
	// row only reports "edit me" / renders its editor; the controller owns save state.
	function rowCtl(key: string, seed: () => void, saveFn: () => Promise<string | null>) {
		return {
			editing: editCtl.isEditing(key),
			onRequestEdit: () => {
				if (canEdit) editCtl.begin(key, seed, saveFn);
			},
			onCommit: () => editCtl.commit(),
			onCancel: () => editCtl.cancel()
		};
	}

	// --- Referred-by combobox draft state (mirrors ContactForm's referrer search) ---
	let referrerDraftId = $state('');
	let referrerDraftName = $state('');
	let referrerSearch = $state('');
	let referrerResults = $state<Array<{ id: string; full_name: string; phone: string }>>([]);
	let showReferrerDropdown = $state(false);
	let referrerSearchTimer: ReturnType<typeof setTimeout> | null = null;

	function onReferrerInput(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		referrerSearch = val;
		if (!val.trim()) {
			referrerResults = [];
			showReferrerDropdown = false;
			return;
		}
		if (referrerSearchTimer) clearTimeout(referrerSearchTimer);
		referrerSearchTimer = setTimeout(async () => {
			const res = await fetch(`/api/contacts?q=${encodeURIComponent(val.trim())}&status=all`);
			if (res.ok) {
				const body = await res.json();
				referrerResults = (body.items as Array<{ id: string; full_name: string; phone: string }>)
					.filter((r) => r.id !== contactId)
					.slice(0, 8);
				showReferrerDropdown = referrerResults.length > 0;
			}
		}, 250);
	}

	function selectReferrer(r: { id: string; full_name: string }) {
		referrerDraftId = r.id;
		referrerDraftName = r.full_name;
		referrerSearch = r.full_name;
		showReferrerDropdown = false;
	}

	function clearReferrerDraft() {
		referrerDraftId = '';
		referrerDraftName = '';
		referrerSearch = '';
		referrerResults = [];
		showReferrerDropdown = false;
	}

	const METHOD_LABELS: Record<string, string> = {
		sms: 'SMS',
		call: 'Call',
		email: 'Email',
		whatsapp: 'WhatsApp',
		messenger: 'Messenger'
	};
	const TEMP_LABELS: Record<string, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

	function toLocalInput(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	function fromLocalInput(local: string): string | null {
		return local ? new Date(local).toISOString() : null;
	}

	// One-field PATCH with optimistic-concurrency stamp. Returns an error string to
	// keep the row open, or null on success (cache patched, list invalidated).
	async function patchField(payload: Record<string, unknown>): Promise<string | null> {
		try {
			const res = await fetch(`/api/contacts/${contactId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...payload, updated_at: contact.updated_at })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				contactDetailStore.patch(contactId, (prev) => ({
					...prev,
					contact: { ...prev.contact, ...body.contact }
				}));
				contactsStore.invalidate();
				toast.success('Saved');
				return null;
			}
			if (res.status === 409 && body.code === 'STALE_UPDATE')
				return 'This contact was changed elsewhere. Reload the page and try again.';
			if (res.status === 409 && body.code === 'PHONE_DUPLICATE')
				return 'A contact with this phone already exists.';
			if (res.status === 422 && (body.code === 'PHONE_INVALID' || body.code === 'ALT_PHONE_INVALID'))
				return body.error ?? 'Invalid phone number.';
			if (res.status === 422 && body.code === 'INVALID_ASSIGNEE')
				return body.error ?? 'Invalid assignee.';
			return body.error ?? 'Failed to save.';
		} catch {
			return 'Failed to save. Check your connection and try again.';
		}
	}

	async function saveCompany() {
		return patchField({ company_name: companyDraft.trim() || null });
	}
	async function saveEmail() {
		return patchField({ email: emailDraft.trim() || null });
	}
	async function savePhone() {
		if (!phoneDraft.trim()) return 'Phone number is required.';
		return patchField({ phone: phoneDraft.trim() });
	}
	async function saveAltPhone() {
		const alt = altPhoneDraft.trim();
		return patchField({
			alt_phone: alt || null,
			alt_phone_label: alt ? altLabelDraft || null : null
		});
	}
	async function saveSource() {
		return patchField({ lead_source: sourceDraft });
	}
	async function saveTemp() {
		return patchField({ lead_temperature: tempDraft || null });
	}
	async function saveAssignee() {
		const val = assigneeDraft || null;
		const err = await patchField({ assigned_to: val });
		if (err) return err;
		const found = assignees.find((a) => a.id === val);
		contactDetailStore.patch(contactId, (prev) => ({
			...prev,
			assignee: found ? { id: found.id, name: found.full_name } : null
		}));
		return null;
	}
	async function saveMethod() {
		return patchField({ preferred_contact_method: methodDraft || null });
	}
	async function saveFollowUp() {
		return patchField({ next_follow_up_at: fromLocalInput(followUpDraft) });
	}
	async function saveTags() {
		return patchField({ tags: tagsDraft });
	}

	async function saveReferrer() {
		const val = referrerDraftId || null;
		const err = await patchField({ referred_by_contact_id: val });
		if (err) return err;
		// Keep the store's referrer object in sync so the header/link update too.
		contactDetailStore.patch(contactId, (prev) => ({
			...prev,
			referrer: val ? { id: val, name: referrerDraftName } : null
		}));
		return null;
	}

	async function toggleEmailOptIn() {
		if (!canEdit || emailOptInSaving) return;
		emailOptInSaving = true;
		const err = await patchField({ email_opt_in: !contact.email_opt_in });
		if (err) toast.error(err);
		emailOptInSaving = false;
	}

	async function toggleDnc() {
		if (!canEdit || dncSaving) return;
		dncSaving = true;
		const err = await patchField({ do_not_contact: !contact.do_not_contact });
		if (err) toast.error(err);
		dncSaving = false;
	}

	const sourceLabel = $derived(
		LEAD_SOURCE_LABELS[contact.lead_source as LeadSource] ?? contact.lead_source
	);
</script>

<div class="details-panel">
	<div class="details-panel__head">
		<p class="eyebrow">Details</p>
	</div>

	<div class="details-panel__rows">
		<!-- Company -->
		<InlineEditRow
			label="Company"
			{canEdit}
			{...rowCtl('company', () => (companyDraft = contact.company_name ?? ''), saveCompany)}
		>
			{#snippet display()}
				{#if contact.company_name}
					{contact.company_name}
				{:else}
					<span class="details-panel__muted">Add company</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="field__input" type="text" bind:value={companyDraft} autofocus />
			{/snippet}
		</InlineEditRow>

		<!-- Phone -->
		<InlineEditRow
			label="Phone"
			{canEdit}
			{...rowCtl('phone', () => (phoneDraft = contact.phone ?? ''), savePhone)}
		>
			{#snippet display()}
				{contact.phone ? formatPhoneDisplay(contact.phone) : '—'}
			{/snippet}
			{#snippet editor()}
				<PhoneField bind:value={phoneDraft} defaultCountry={orgCountry} />
			{/snippet}
		</InlineEditRow>

		<!-- Alternate phone -->
		<InlineEditRow
			label="Alternate phone"
			{canEdit}
			{...rowCtl(
				'altPhone',
				() => {
					altPhoneDraft = contact.alt_phone ?? '';
					altLabelDraft = contact.alt_phone_label ?? '';
				},
				saveAltPhone
			)}
		>
			{#snippet display()}
				{#if contact.alt_phone}
					{formatPhoneDisplay(contact.alt_phone)}
					{#if contact.alt_phone_label}
						<span class="details-panel__muted"
							>({PHONE_LABEL_DISPLAY[contact.alt_phone_label]})</span
						>
					{/if}
				{:else}
					<span class="details-panel__muted">Add alternate phone</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<div class="details-panel__alt">
					<PhoneField bind:value={altPhoneDraft} defaultCountry={orgCountry} />
					<select class="field__select" bind:value={altLabelDraft}>
						<option value="">Type</option>
						<option value="mobile">Mobile</option>
						<option value="home">Home</option>
						<option value="work">Work</option>
						<option value="fax">Fax</option>
						<option value="other">Other</option>
					</select>
				</div>
			{/snippet}
		</InlineEditRow>

		<!-- Email -->
		<InlineEditRow
			label="Email"
			{canEdit}
			{...rowCtl('email', () => (emailDraft = contact.email ?? ''), saveEmail)}
		>
			{#snippet display()}
				{#if contact.email}
					{contact.email}
				{:else}
					<span class="details-panel__muted">Add email</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="field__input" type="email" bind:value={emailDraft} autofocus />
			{/snippet}
		</InlineEditRow>

		<!-- Lead source -->
		<InlineEditRow
			label="Lead source"
			{canEdit}
			{...rowCtl('source', () => (sourceDraft = contact.lead_source), saveSource)}
		>
			{#snippet display()}{sourceLabel}{/snippet}
			{#snippet editor()}
				<select class="field__select" bind:value={sourceDraft}>
					<option value="manual">Manual</option>
					<option value="referral">Referral</option>
					<option value="repeat_customer">Repeat customer</option>
					<option value="website_form">Website form</option>
					<option value="live_chat">Live chat</option>
					<option value="missed_call">Missed call</option>
					<option value="google_ads">Google Ads</option>
					<option value="facebook">Facebook / Instagram</option>
					<option value="yelp">Yelp</option>
					<option value="angi">Angi / HomeAdvisor</option>
					<option value="nextdoor">Nextdoor</option>
					<option value="door_hanger">Door hanger</option>
					<option value="job_sign">Job sign / yard sign</option>
					<option value="other">Other</option>
				</select>
			{/snippet}
		</InlineEditRow>

		<!-- Referred by -->
		<InlineEditRow
			label="Referred by"
			{canEdit}
			{...rowCtl(
				'referrer',
				() => {
					referrerDraftId = referrerId ?? '';
					referrerDraftName = referrerName ?? '';
					referrerSearch = referrerName ?? '';
					referrerResults = [];
					showReferrerDropdown = false;
				},
				saveReferrer
			)}
		>
			{#snippet display()}
				{#if referrerName}
					<a class="details-panel__ref" href={`/contacts/${referrerId}`}>{referrerName}</a>
				{:else}
					<span class="details-panel__muted">Not referred</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<div class="details-panel__referrer">
					{#if referrerDraftId}
						<div class="details-panel__referrer-selected">
							<span class="details-panel__referrer-name">{referrerDraftName}</span>
							<button
								type="button"
								class="details-panel__referrer-clear"
								onclick={clearReferrerDraft}
								aria-label="Clear referrer"
							>
								<i class="ri-close-line" aria-hidden="true"></i>
							</button>
						</div>
					{:else}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							type="search"
							inputmode="search"
							class="field__input"
							placeholder="Search contacts…"
							value={referrerSearch}
							oninput={onReferrerInput}
							onfocus={() => {
								if (referrerResults.length > 0) showReferrerDropdown = true;
							}}
							onblur={() =>
								setTimeout(() => {
									showReferrerDropdown = false;
								}, 150)}
							autocomplete="off"
							autofocus
						/>
						{#if showReferrerDropdown}
							<ul class="details-panel__dropdown">
								{#each referrerResults as r (r.id)}
									<li>
										<button
											type="button"
											class="details-panel__dropdown-item"
											onmousedown={() => selectReferrer(r)}
										>
											<span class="details-panel__dropdown-name">{r.full_name}</span>
											<span class="details-panel__dropdown-phone">{r.phone}</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			{/snippet}
		</InlineEditRow>

		<!-- Lead temperature -->
		<InlineEditRow
			label="Lead temperature"
			{canEdit}
			{...rowCtl('temp', () => (tempDraft = contact.lead_temperature ?? ''), saveTemp)}
		>
			{#snippet display()}
				{#if contact.lead_temperature}
					{TEMP_LABELS[contact.lead_temperature]}
				{:else}
					<span class="details-panel__muted">Not set</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<select class="field__select" bind:value={tempDraft}>
					<option value="">Not set</option>
					<option value="hot">Hot</option>
					<option value="warm">Warm</option>
					<option value="cold">Cold</option>
				</select>
			{/snippet}
		</InlineEditRow>

		<!-- Assigned to -->
		<InlineEditRow
			label="Assigned to"
			{canEdit}
			{...rowCtl('assignee', () => (assigneeDraft = contact.assigned_to ?? ''), saveAssignee)}
		>
			{#snippet display()}
				{#if assigneeName}
					{assigneeName}
				{:else}
					<span class="details-panel__muted">Unassigned</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<select class="field__select" bind:value={assigneeDraft}>
					<option value="">Unassigned</option>
					{#each assignees as a (a.id)}
						<option value={a.id}>{a.full_name}</option>
					{/each}
				</select>
			{/snippet}
		</InlineEditRow>

		<!-- Preferred method -->
		<InlineEditRow
			label="Preferred method"
			{canEdit}
			{...rowCtl('method', () => (methodDraft = contact.preferred_contact_method ?? ''), saveMethod)}
		>
			{#snippet display()}
				{#if contact.preferred_contact_method}
					{METHOD_LABELS[contact.preferred_contact_method]}
				{:else}
					<span class="details-panel__muted">No preference</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<select class="field__select" bind:value={methodDraft}>
					<option value="">No preference</option>
					<option value="sms">SMS</option>
					<option value="call">Call</option>
					<option value="email">Email</option>
					<option value="whatsapp">WhatsApp</option>
					<option value="messenger">Messenger</option>
				</select>
			{/snippet}
		</InlineEditRow>

		<!-- Next follow-up -->
		<InlineEditRow
			label="Next follow-up"
			{canEdit}
			{...rowCtl('followUp', () => (followUpDraft = toLocalInput(contact.next_follow_up_at)), saveFollowUp)}
		>
			{#snippet display()}
				{#if contact.next_follow_up_at}
					{formatDateTime(contact.next_follow_up_at)}
				{:else}
					<span class="details-panel__muted">Not scheduled</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<DateTimePicker bind:value={followUpDraft} placeholder="Pick date & time" />
				{#if followUpDraft}
					<button
						type="button"
						class="field__hint field__hint--link"
						onclick={() => (followUpDraft = '')}
					>
						Clear
					</button>
				{/if}
			{/snippet}
		</InlineEditRow>

		<!-- Tags -->
		<InlineEditRow
			label="Tags"
			{canEdit}
			{...rowCtl('tags', () => (tagsDraft = [...contact.tags]), saveTags)}
		>
			{#snippet display()}
				{#if contact.tags.length > 0}
					<span class="details-panel__tags">
						{#each contact.tags as tag (tag)}
							<span class="details-panel__tag">{formatTagLabel(tag)}</span>
						{/each}
					</span>
				{:else}
					<span class="details-panel__muted">No tags</span>
				{/if}
			{/snippet}
			{#snippet editor()}
				<ContactTagsEditor bind:value={tagsDraft} />
			{/snippet}
		</InlineEditRow>

		<!-- Email opt-in (immediate toggle) -->
		<div class="details-panel__dnc">
			<div>
				<p class="details-panel__dnc-label">Email opt-in</p>
				<p class="details-panel__dnc-desc">Controls marketing &amp; broadcast emails only.</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={contact.email_opt_in}
				aria-label="Email opt-in"
				class="toggle {contact.email_opt_in ? 'toggle--on' : ''}"
				disabled={!canEdit || emailOptInSaving}
				onclick={toggleEmailOptIn}
			>
				<span class="toggle__thumb"></span>
			</button>
		</div>

		<!-- Do not contact (immediate toggle) -->
		<div class="details-panel__dnc">
			<div>
				<p class="details-panel__dnc-label">Do not contact</p>
				<p class="details-panel__dnc-desc">Blocks automated SMS, email, and reminders.</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={contact.do_not_contact}
				aria-label="Do not contact"
				class="toggle {contact.do_not_contact ? 'toggle--on' : ''}"
				disabled={!canEdit || dncSaving}
				onclick={toggleDnc}
			>
				<span class="toggle__thumb"></span>
			</button>
		</div>
	</div>

</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.details-panel {
		background: var(--color-bg-surface);
		border-radius: $radius-lg;
		box-shadow: var(--shadow-sm);
		overflow: hidden;

		&__head {
			padding: $space-3 $space-4;
			border-bottom: 1px solid var(--color-border);
		}

		&__rows {
			display: flex;
			flex-direction: column;
		}

		&__muted {
			color: var(--color-text-muted);
		}

		&__alt {
			display: flex;
			gap: $space-2;

			.field__select {
				flex-shrink: 0;
				width: auto;
			}
		}

		&__ref {
			color: var(--color-brand);
			font-weight: $weight-medium;
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		&__referrer {
			position: relative;
		}

		&__referrer-selected {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			padding: $space-2 $space-3;
			border-radius: $radius-md;
			background: var(--color-bg-surface-sunk);
		}

		&__referrer-name {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__referrer-clear {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			width: 1.5rem;
			height: 1.5rem;
			border-radius: $radius-full;
			color: var(--color-text-muted);

			&:hover {
				background: var(--color-bg-surface);
				color: var(--color-text-primary);
			}
		}

		&__dropdown {
			position: absolute;
			z-index: 20;
			top: calc(100% + 4px);
			left: 0;
			right: 0;
			list-style: none;
			padding: $space-1;
			margin: 0;
			background: var(--color-bg-surface);
			border-radius: $radius-md;
			box-shadow: var(--shadow-md);
			max-height: 16rem;
			overflow-y: auto;
		}

		&__dropdown-item {
			display: flex;
			flex-direction: column;
			gap: 2px;
			width: 100%;
			padding: $space-2 $space-3;
			text-align: left;
			border-radius: $radius-sm;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}
		}

		&__dropdown-name {
			font-size: $fs-body;
			color: var(--color-text-primary);
		}

		&__dropdown-phone {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__tags {
			display: flex;
			flex-wrap: wrap;
			gap: $space-1;
		}

		&__tag {
			display: inline-flex;
			align-items: center;
			padding: 2px $space-2;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-secondary);
		}

		&__dnc {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			padding: $space-3 $space-4;
			border-top: 1px solid var(--color-border);
		}

		&__dnc-label {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__dnc-desc {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}
	}
</style>
