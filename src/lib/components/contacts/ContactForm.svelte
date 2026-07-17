<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import AddressForm from '$lib/components/contacts/AddressForm.svelte';
	import AddressesTab from '$lib/components/contacts/AddressesTab.svelte';
	import ContactTagsEditor from '$lib/components/contacts/ContactTagsEditor.svelte';
	import ContactAvatarUploader from '$lib/components/contacts/ContactAvatarUploader.svelte';
	import PhoneField from '$lib/components/shared/PhoneField.svelte';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { formatDateTime } from '$lib/utils/format';
	import type { ContactDetailResponse } from '$lib/stores/contactDetail.svelte';

	type LeadSource =
		| 'website_form'
		| 'live_chat'
		| 'missed_call'
		| 'manual'
		| 'referral'
		| 'google_ads'
		| 'yelp'
		| 'angi'
		| 'facebook'
		| 'nextdoor'
		| 'door_hanger'
		| 'job_sign'
		| 'repeat_customer'
		| 'other';
	type AltPhoneLabel = '' | 'mobile' | 'home' | 'work' | 'fax' | 'other';

	let { mode, detail = null }: { mode: 'create' | 'edit'; detail?: ContactDetailResponse | null } =
		$props();

	const member = getMemberContext();
	const org = getOrgContext();
	const orgCountry = $derived(org().country ?? 'US');

	const c = detail?.contact;
	const cancelHref = mode === 'edit' && c ? `/contacts/${c.id}` : '/contacts';

	// --- Shared fields (both modes) ---
	let full_name = $state(c?.full_name ?? '');
	let company_name = $state(c?.company_name ?? '');
	let phone = $state(c?.phone ?? '');
	let alt_phone = $state(c?.alt_phone ?? '');
	let alt_phone_label = $state<AltPhoneLabel>((c?.alt_phone_label as AltPhoneLabel) ?? '');
	let email = $state(c?.email ?? '');
	let lead_temperature = $state<'' | 'hot' | 'warm' | 'cold'>(
		(c?.lead_temperature as '' | 'hot' | 'warm' | 'cold') ?? ''
	);
	let lead_source = $state<LeadSource>((c?.lead_source as LeadSource) ?? 'manual');
	let assigned_to = $state<string>(c?.assigned_to ?? '');
	// Unified status. Create offers lead/customer only; edit adds archived.
	let status = $state<'lead' | 'customer' | 'archived'>(c?.status ?? 'lead');
	let notes = $state(c?.notes ?? '');
	let tags = $state<string[]>(c?.tags ?? []);

	// --- Edit-only fields ---
	let avatar_url = $state<string | null>(c?.avatar_url ?? null);
	let next_follow_up_at_local = $state(toLocalInput(c?.next_follow_up_at ?? null));
	let preferred_contact_method = $state<'' | 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger'>(
		(c?.preferred_contact_method as '' | 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger') ?? ''
	);
	let email_opt_in = $state(c?.email_opt_in ?? false);
	let do_not_contact = $state(c?.do_not_contact ?? false);

	// Editable multi-address list (edit mode) + recent notes (read-only, edit mode)
	let addresses = $state<ContactDetailResponse['addresses']>(detail?.addresses ?? []);
	const recentNotes = detail?.notes ?? [];

	// Create-mode single inline address
	let address = $state<{
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
	}>({
		label: 'service',
		address_line_1: '',
		address_line_2: '',
		city: '',
		state: '',
		zip: '',
		is_primary: true
	});

	// --- Referrer typeahead ---
	let referred_by_contact_id = $state<string>(c?.referred_by_contact_id ?? '');
	let referrerName = $state(detail?.referrer?.name ?? '');
	let referrerSearch = $state(detail?.referrer?.name ?? '');
	let referrerResults = $state<Array<{ id: string; full_name: string; phone: string }>>([]);
	let referrerSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let showReferrerDropdown = $state(false);

	// --- Assignees ---
	let assignees = $state<Array<{ id: string; full_name: string }>>([]);

	// --- Save state ---
	let saving = $state(false);
	// Create-mode progressive disclosure: essentials first, rest behind "More details".
	let showMore = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});
	// Create-only duplicate/restore flow
	let duplicateInfo = $state<{ id: string; soft: boolean } | null>(null);
	let restoring = $state(false);
	// Edit-only archive-block counts
	let archiveBlockCounts = $state<null | {
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	}>(null);

	function toLocalInput(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function fromLocalInput(local: string): string | null {
		if (!local) return null;
		return new Date(local).toISOString();
	}

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
					.filter((r) => r.id !== c?.id)
					.slice(0, 8);
				showReferrerDropdown = referrerResults.length > 0;
			}
		}, 250);
	}

	function selectReferrer(r: { id: string; full_name: string }) {
		referred_by_contact_id = r.id;
		referrerName = r.full_name;
		referrerSearch = r.full_name;
		showReferrerDropdown = false;
		lead_source = 'referral';
	}

	function clearReferrer() {
		referred_by_contact_id = '';
		referrerName = '';
		referrerSearch = '';
		referrerResults = [];
		showReferrerDropdown = false;
	}

	onMount(async () => {
		const res = await fetch('/api/contacts/assignees');
		if (res.ok) {
			const body = (await res.json()) as { assignees: Array<{ id: string; full_name: string }> };
			assignees = body.assignees;
		}
	});

	async function save(e: Event) {
		e.preventDefault();
		if (saving) return;

		if (mode === 'create') {
			await createContact();
		} else {
			await updateContact();
		}
	}

	async function createContact() {
		// Address is optional, but a partial one is not useful. If any part is
		// filled, require street + city + state + ZIP before saving.
		const anyAddr =
			address.address_line_1.trim() ||
			address.address_line_2.trim() ||
			address.city.trim() ||
			address.state.trim() ||
			address.zip.trim();
		const fullAddr =
			address.address_line_1.trim() &&
			address.city.trim() &&
			address.state.trim() &&
			address.zip.trim();
		if (anyAddr && !fullAddr) {
			errorMsg = 'Address needs street, city, state, and ZIP — or leave it all blank.';
			return;
		}

		saving = true;
		errorMsg = null;
		duplicateInfo = null;

		const payload: Record<string, unknown> = {
			full_name: full_name.trim(),
			lead_source,
			status: status === 'archived' ? 'lead' : status
		};
		if (company_name.trim()) payload.company_name = company_name.trim();
		if (lead_temperature) payload.lead_temperature = lead_temperature;
		if (phone.trim()) payload.phone = phone.trim();
		if (alt_phone.trim()) {
			payload.alt_phone = alt_phone.trim();
			if (alt_phone_label) payload.alt_phone_label = alt_phone_label;
		}
		if (email.trim()) payload.email = email.trim();
		if (assigned_to) payload.assigned_to = assigned_to;
		if (referred_by_contact_id) payload.referred_by_contact_id = referred_by_contact_id;
		if (notes.trim()) payload.notes = notes.trim();
		if (tags.length) payload.tags = tags;
		if (fullAddr) {
			payload.address = {
				label: address.label,
				address_line_1: address.address_line_1.trim(),
				address_line_2: address.address_line_2.trim() || undefined,
				city: address.city.trim(),
				state: address.state.trim(),
				zip: address.zip.trim(),
				is_primary: true
			};
		}

		try {
			const res = await fetch('/api/contacts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));

			if (res.status === 201) {
				goto(`/contacts/${body.contact.id}`);
				return;
			}

			if (res.status === 409 && body.code === 'PHONE_DUPLICATE') {
				duplicateInfo = {
					id: body.existing_contact_id,
					soft: Boolean(body.is_soft_deleted)
				};
				errorMsg = body.is_soft_deleted
					? 'This phone belongs to a deleted contact. Restore it to continue.'
					: 'This phone is already used by another contact.';
				return;
			}

			errorMsg = body.error ?? 'Failed to create contact.';
		} finally {
			saving = false;
		}
	}

	async function updateContact() {
		if (!detail) return;
		saving = true;
		errorMsg = null;
		fieldErrors = {};
		archiveBlockCounts = null;

		const payload: Record<string, unknown> = {
			updated_at: detail.contact.updated_at,
			full_name: full_name.trim(),
			company_name: company_name.trim() || null,
			phone: phone.trim(),
			alt_phone: alt_phone.trim() || null,
			alt_phone_label: alt_phone.trim() ? alt_phone_label || null : null,
			email: email.trim() ? email.trim() : null,
			lead_temperature: lead_temperature || null,
			assigned_to: assigned_to || null,
			referred_by_contact_id: referred_by_contact_id || null,
			lead_source,
			status,
			notes: notes.trim() || null,
			next_follow_up_at: fromLocalInput(next_follow_up_at_local),
			preferred_contact_method: preferred_contact_method || null,
			email_opt_in,
			do_not_contact,
			tags
		};

		try {
			const res = await fetch(`/api/contacts/${detail.contact.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));

			if (res.ok) {
				goto(`/contacts/${detail.contact.id}`);
				return;
			}

			if (res.status === 409 && body.code === 'STALE_UPDATE') {
				errorMsg =
					'This contact was changed by someone else. Reload the page to see the latest version.';
				return;
			}
			if (res.status === 409 && body.code === 'PHONE_DUPLICATE') {
				fieldErrors.phone = 'A contact with this phone already exists.';
				errorMsg = fieldErrors.phone;
				return;
			}
			if (res.status === 422 && body.code === 'PHONE_INVALID') {
				fieldErrors.phone = body.error ?? 'Invalid phone value.';
				errorMsg = fieldErrors.phone;
				return;
			}
			if (res.status === 422 && body.code === 'ALT_PHONE_INVALID') {
				fieldErrors.alt_phone = body.error ?? 'Invalid alternate phone.';
				errorMsg = fieldErrors.alt_phone;
				return;
			}
			if (res.status === 422 && body.code === 'INVALID_ASSIGNEE') {
				fieldErrors.assigned_to = body.error;
				errorMsg = body.error;
				return;
			}
			if (res.status === 409 && body.code === 'CONTACT_HAS_LINKS') {
				archiveBlockCounts = body.counts;
				fieldErrors.status = 'Has linked records';
				errorMsg = body.error ?? 'Contact has linked records.';
				return;
			}

			errorMsg = body.error ?? 'Failed to save contact.';
		} finally {
			saving = false;
		}
	}

	async function restoreContact() {
		if (!duplicateInfo || !duplicateInfo.soft || restoring) return;
		restoring = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/contacts/${duplicateInfo.id}/restore`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				goto(`/contacts/${duplicateInfo.id}`);
				return;
			}
			if (res.status === 422 && body.code === 'PHONE_RELEASED') {
				errorMsg = body.error;
				duplicateInfo = null;
				return;
			}
			errorMsg = body.error ?? 'Failed to restore contact.';
		} finally {
			restoring = false;
		}
	}
</script>

<div class="contact-form">
	<header class="contact-form__header">
		<h1 class="contact-form__title">{mode === 'edit' ? 'Edit contact' : 'New contact'}</h1>
		<p class="contact-form__subtitle">
			{mode === 'edit' ? (c?.full_name ?? '') : 'Add a new lead or customer'}
		</p>
	</header>
	<div class="contact-form__content">
		<form class="contact-form__body" onsubmit={save}>
			{#if mode === 'create'}
				<div class="contact-form__create">
					<section class="contact-form__section">
						<h2 class="contact-form__section-title">Contact info</h2>
						<div class="contact-form__grid contact-form__grid--2col">
							<div class="field contact-form__span-2">
								<label class="field__label field__label--required" for="full_name">Name</label>
								<input
									id="full_name"
									class="field__input"
									bind:value={full_name}
									required
									maxlength={200}
									autocomplete="name"
								/>
							</div>

							<div class="field">
								<label class="field__label" for="phone">Phone</label>
								<PhoneField
									id="phone"
									bind:value={phone}
									defaultCountry={orgCountry}
									invalid={!!fieldErrors.phone}
								/>
								{#if fieldErrors.phone}
									<p class="field__error">{fieldErrors.phone}</p>
								{/if}
							</div>

							<div class="field">
								<label class="field__label" for="email">Email</label>
								<input
									id="email"
									type="email"
									class="field__input"
									bind:value={email}
									autocomplete="email"
								/>
							</div>

							<div class="field contact-form__span-2">
								<label class="field__label" for="lead_source">Lead source</label>
								<select id="lead_source" class="field__select" bind:value={lead_source}>
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
							</div>
						</div>
					</section>

					{#if showMore}
						<section class="contact-form__section">
							<h2 class="contact-form__section-title">More details</h2>
							<div class="contact-form__grid contact-form__grid--2col">
								<div class="field contact-form__span-2">
									<label class="field__label" for="company_name">Company</label>
									<input
										id="company_name"
										class="field__input"
										bind:value={company_name}
										maxlength={200}
										autocomplete="organization"
										placeholder="Business, HOA, or property manager"
									/>
								</div>

								<div class="field contact-form__span-2">
									<label class="field__label" for="alt_phone">Alt phone</label>
									<div class="contact-form__alt-phone">
										<PhoneField
											id="alt_phone"
											bind:value={alt_phone}
											defaultCountry={orgCountry}
											invalid={!!fieldErrors.alt_phone}
										/>
										<select
											class="field__select contact-form__alt-type"
											bind:value={alt_phone_label}
										>
											<option value="">Type</option>
											<option value="mobile">Mobile</option>
											<option value="home">Home</option>
											<option value="work">Work</option>
											<option value="fax">Fax</option>
											<option value="other">Other</option>
										</select>
									</div>
									{#if fieldErrors.alt_phone}
										<p class="field__error">{fieldErrors.alt_phone}</p>
									{/if}
								</div>

								<div class="field">
									<label class="field__label" for="contact_status">Contact type</label>
									<select id="contact_status" class="field__select" bind:value={status}>
										<option value="lead">Lead</option>
										<option value="customer">Customer</option>
									</select>
									{#if status === 'customer'}
										<p class="field__hint">
											Saved as a customer — marks them as converted right away.
										</p>
									{/if}
								</div>

								<div class="field">
									<label class="field__label" for="lead_temperature">Lead temperature</label>
									<select id="lead_temperature" class="field__select" bind:value={lead_temperature}>
										<option value="">Not set</option>
										<option value="hot">Hot</option>
										<option value="warm">Warm</option>
										<option value="cold">Cold</option>
									</select>
								</div>

								<div class="field">
									<label class="field__label" for="assigned_to">Assigned to</label>
									<select id="assigned_to" class="field__select" bind:value={assigned_to}>
										<option value="">Unassigned</option>
										{#each assignees as a (a.id)}
											<option value={a.id}>{a.full_name}</option>
										{/each}
									</select>
								</div>

								<div class="field contact-form__referred">
									<label class="field__label" for="referred_by">Referred by (optional)</label>
									{#if referred_by_contact_id}
										<div class="contact-form__referrer-selected">
											<span class="contact-form__referrer-name">{referrerName}</span>
											<button
												type="button"
												class="contact-form__referrer-clear"
												onclick={clearReferrer}
												aria-label="Clear referrer"
											>
												<i class="ri-close-line" aria-hidden="true"></i>
											</button>
										</div>
									{:else}
										<input
											id="referred_by"
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
										/>
										{#if showReferrerDropdown}
											<ul class="contact-form__dropdown">
												{#each referrerResults as r (r.id)}
													<li>
														<button
															type="button"
															class="contact-form__dropdown-item"
															onmousedown={() => selectReferrer(r)}
														>
															<span class="contact-form__dropdown-name">{r.full_name}</span>
															<span class="contact-form__dropdown-phone">{r.phone}</span>
														</button>
													</li>
												{/each}
											</ul>
										{/if}
									{/if}
								</div>
							</div>
						</section>

						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Service address</h2>
							<p class="contact-form__section-hint">
								Optional. Where the work happens — used later on quotes, jobs, and appointments.
							</p>
							<AddressForm value={address} required={false} />
						</section>

						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Tags</h2>
							<ContactTagsEditor bind:value={tags} />
						</section>

						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Short note</h2>
							<div class="field">
								<textarea
									id="notes"
									class="field__textarea"
									bind:value={notes}
									maxlength={2000}
									rows={3}
									placeholder="Anything the team should know about this contact…"
								></textarea>
							</div>
						</section>
					{:else}
						<button type="button" class="contact-form__more" onclick={() => (showMore = true)}>
							<i class="ri-add-line" aria-hidden="true"></i>
							More details
						</button>
					{/if}
				</div>
			{:else}
				<div class="contact-form__cols">
					<div class="contact-form__col">
						<!-- Contact info -->
						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Contact info</h2>

							{#if mode === 'edit' && c}
								<div class="contact-form__avatar-row">
									<ContactAvatarUploader
										contactId={c.id}
										name={full_name || c.full_name}
										src={avatar_url}
										status={c.status}
										size={80}
										onChange={(r) => {
											avatar_url = r.avatar_url;
											if (detail) detail.contact.updated_at = r.updated_at;
										}}
									/>
									<div>
										<p class="contact-form__avatar-label">Profile photo</p>
										<p class="contact-form__avatar-hint">
											Tap the photo to upload. JPEG, PNG, or WebP, up to 5 MB.
										</p>
									</div>
								</div>
							{/if}

							<div class="contact-form__grid">
								<div class="field contact-form__span-2">
									<label class="field__label field__label--required" for="full_name">Name</label>
									<input
										id="full_name"
										class="field__input"
										bind:value={full_name}
										required
										maxlength={200}
										autocomplete="name"
									/>
								</div>

								<div class="field contact-form__span-2">
									<label class="field__label" for="company_name">Company</label>
									<input
										id="company_name"
										class="field__input"
										bind:value={company_name}
										maxlength={200}
										autocomplete="organization"
										placeholder="Business, HOA, or property manager"
									/>
								</div>

								<div class="field">
									<label class="field__label" for="phone">Phone</label>
									<PhoneField
										id="phone"
										bind:value={phone}
										defaultCountry={orgCountry}
										invalid={!!fieldErrors.phone}
									/>
									{#if fieldErrors.phone}
										<p class="field__error">{fieldErrors.phone}</p>
									{/if}
								</div>

								<div class="field">
									<label class="field__label" for="email">Email</label>
									<input
										id="email"
										type="email"
										class="field__input"
										bind:value={email}
										autocomplete="email"
									/>
								</div>

								<div class="field contact-form__span-2">
									<label class="field__label" for="alt_phone">Alt phone</label>
									<div class="contact-form__alt-phone">
										<PhoneField
											id="alt_phone"
											bind:value={alt_phone}
											defaultCountry={orgCountry}
											invalid={!!fieldErrors.alt_phone}
										/>
										<select
											class="field__select contact-form__alt-type"
											bind:value={alt_phone_label}
										>
											<option value="">Type</option>
											<option value="mobile">Mobile</option>
											<option value="home">Home</option>
											<option value="work">Work</option>
											<option value="fax">Fax</option>
											<option value="other">Other</option>
										</select>
									</div>
									{#if fieldErrors.alt_phone}
										<p class="field__error">{fieldErrors.alt_phone}</p>
									{/if}
								</div>
							</div>
						</section>
					</div>

					<div class="contact-form__col">
						<!-- Lead details -->
						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Lead details</h2>
							<div class="contact-form__grid contact-form__grid--2col">
								<div class="field">
									<label class="field__label" for="contact_status">Contact type</label>
									<select id="contact_status" class="field__select" bind:value={status}>
										<option value="lead">Lead</option>
										<option value="customer">Customer</option>
										{#if mode === 'edit'}
											<option value="archived">Archived</option>
										{/if}
									</select>
									{#if c?.converted_at}
										<p class="field__hint">Converted on {formatDateTime(c.converted_at)}</p>
									{:else if c?.status === 'lead' && status === 'customer'}
										<p class="field__hint">Saving will mark this contact as converted.</p>
									{/if}
									{#if archiveBlockCounts}
										<div class="contact-form__archive-block">
											<p class="contact-form__archive-block-title">
												Can't archive — close or reassign these first:
											</p>
											<ul class="contact-form__archive-block-list">
												{#if archiveBlockCounts.opportunities > 0}
													<li>Opportunities: {archiveBlockCounts.opportunities}</li>
												{/if}
												{#if archiveBlockCounts.jobs > 0}<li>
														Jobs: {archiveBlockCounts.jobs}
													</li>{/if}
												{#if archiveBlockCounts.quotes > 0}<li>
														Quotes: {archiveBlockCounts.quotes}
													</li>{/if}
												{#if archiveBlockCounts.invoices > 0}
													<li>Invoices: {archiveBlockCounts.invoices}</li>
												{/if}
												{#if archiveBlockCounts.conversations > 0}
													<li>Conversations: {archiveBlockCounts.conversations}</li>
												{/if}
											</ul>
										</div>
									{/if}
								</div>

								<div class="field">
									<label class="field__label" for="lead_source">Lead source</label>
									<select id="lead_source" class="field__select" bind:value={lead_source}>
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
								</div>

								<div class="field">
									<label class="field__label" for="lead_temperature">Lead temperature</label>
									<select id="lead_temperature" class="field__select" bind:value={lead_temperature}>
										<option value="">Not set</option>
										<option value="hot">Hot</option>
										<option value="warm">Warm</option>
										<option value="cold">Cold</option>
									</select>
								</div>

								<div class="field">
									<label class="field__label" for="assigned_to">Assigned to</label>
									<select id="assigned_to" class="field__select" bind:value={assigned_to}>
										<option value="">Unassigned</option>
										{#each assignees as a (a.id)}
											<option value={a.id}>{a.full_name}</option>
										{/each}
									</select>
									{#if fieldErrors.assigned_to}
										<p class="field__error">{fieldErrors.assigned_to}</p>
									{/if}
								</div>

								<!-- Referred by (combobox) -->
								<div class="field contact-form__referred">
									<label class="field__label" for="referred_by">Referred by (optional)</label>
									{#if referred_by_contact_id}
										<div class="contact-form__referrer-selected">
											<span class="contact-form__referrer-name">{referrerName}</span>
											<button
												type="button"
												class="contact-form__referrer-clear"
												onclick={clearReferrer}
												aria-label="Clear referrer"
											>
												<i class="ri-close-line" aria-hidden="true"></i>
											</button>
										</div>
									{:else}
										<input
											id="referred_by"
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
										/>
										{#if showReferrerDropdown}
											<ul class="contact-form__dropdown">
												{#each referrerResults as r (r.id)}
													<li>
														<button
															type="button"
															class="contact-form__dropdown-item"
															onmousedown={() => selectReferrer(r)}
														>
															<span class="contact-form__dropdown-name">{r.full_name}</span>
															<span class="contact-form__dropdown-phone">{r.phone}</span>
														</button>
													</li>
												{/each}
											</ul>
										{/if}
									{/if}
								</div>
							</div>
						</section>

						<!-- Follow-up & preferences (edit only) -->
						{#if mode === 'edit'}
							<section class="contact-form__section">
								<h2 class="contact-form__section-title">Follow-up & preferences</h2>
								<div class="contact-form__grid contact-form__grid--2col">
									<div class="field">
										<label class="field__label" for="next_follow_up_at">Next follow-up</label>
										<DateTimePicker
											bind:value={next_follow_up_at_local}
											placeholder="Pick date & time"
										/>
										{#if next_follow_up_at_local}
											<button
												type="button"
												class="field__hint field__hint--link"
												onclick={() => (next_follow_up_at_local = '')}
											>
												Clear
											</button>
										{/if}
									</div>

									<div class="field">
										<label class="field__label" for="preferred_contact_method"
											>Preferred method</label
										>
										<select
											id="preferred_contact_method"
											class="field__select"
											bind:value={preferred_contact_method}
										>
											<option value="">No preference</option>
											<option value="sms">SMS</option>
											<option value="call">Call</option>
											<option value="email">Email</option>
											<option value="whatsapp">WhatsApp</option>
											<option value="messenger">Messenger</option>
										</select>
									</div>

									<div class="contact-form__toggle-row contact-form__span-2">
										<div>
											<p class="contact-form__toggle-label">Email opt-in</p>
											<p class="contact-form__toggle-desc">
												Independent from SMS opt-out. Controls marketing & broadcast emails only.
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={email_opt_in}
											class="toggle {email_opt_in ? 'toggle--on' : ''}"
											onclick={() => (email_opt_in = !email_opt_in)}
											aria-label="Email opt-in"
										>
											<span class="toggle__thumb"></span>
										</button>
									</div>

									<div
										class="contact-form__toggle-row contact-form__span-2 {do_not_contact
											? 'contact-form__toggle-row--danger'
											: ''}"
									>
										<div>
											<p class="contact-form__toggle-label">Do Not Contact</p>
											<p class="contact-form__toggle-desc">
												Blocks all outbound messages (SMS, email, any channel). Use for legal
												requests or abusive contacts.
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={do_not_contact}
											class="toggle {do_not_contact ? 'toggle--on' : ''}"
											onclick={() => (do_not_contact = !do_not_contact)}
											aria-label="Do not contact"
										>
											<span class="toggle__thumb"></span>
										</button>
									</div>
								</div>
							</section>
						{/if}

						<!-- Tags -->
						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Tags</h2>
							<ContactTagsEditor bind:value={tags} />
						</section>

						<!-- Short note -->
						<section class="contact-form__section">
							<h2 class="contact-form__section-title">Short note</h2>
							<div class="field">
								<textarea
									id="notes"
									class="field__textarea"
									bind:value={notes}
									maxlength={2000}
									rows={3}
									placeholder="Anything the team should know about this contact…"
								></textarea>
							</div>
						</section>
					</div>
				</div>
			{/if}

			{#if errorMsg}
				<div class="contact-form__error-block">
					<p>{errorMsg}</p>
					{#if duplicateInfo && !duplicateInfo.soft}
						<a class="contact-form__error-link" href={`/contacts/${duplicateInfo.id}`}>
							Open existing contact
						</a>
					{:else if duplicateInfo && duplicateInfo.soft}
						<div style="margin-top:0.5rem;">
							<Button
								variant="secondary"
								size="sm"
								loading={restoring}
								loadingLabel="Restoring…"
								onclick={restoreContact}
							>
								Restore this contact
							</Button>
						</div>
					{/if}
				</div>
			{/if}

			<div class="contact-form__footer">
				<Button variant="secondary" onclick={() => goto(cancelHref)} disabled={saving}>
					Cancel
				</Button>
				<Button
					type="submit"
					loadingLabel="Saving…"
					successLabel={mode === 'edit' ? 'Saved' : 'Created'}
					loading={saving}
				>
					{mode === 'edit' ? 'Save changes' : 'Create contact'}
				</Button>
			</div>
		</form>

		<!-- Addresses (edit: multi-address tab, saved independently) -->
		{#if mode === 'edit' && detail}
			<section class="contact-form__section contact-form__section--standalone">
				<h2 class="contact-form__section-title">Addresses</h2>
				<AddressesTab contactId={detail.contact.id} bind:addresses canEdit={true} />
			</section>

			<section class="contact-form__section contact-form__section--standalone">
				<h2 class="contact-form__section-title">Recent notes</h2>
				{#if recentNotes.length === 0}
					<p class="contact-form__empty-notes">No notes yet.</p>
				{:else}
					<ul class="contact-form__notes-list">
						{#each recentNotes as n (n.id)}
							<li class="contact-form__note-item">
								<p class="contact-form__note-content">{n.content}</p>
								<p class="contact-form__note-meta">
									{n.author_name ?? 'Unknown'} · {formatDateTime(n.created_at)}
								</p>
							</li>
						{/each}
					</ul>
					<p class="contact-form__notes-hint">Add or edit notes from the contact's Notes tab.</p>
				{/if}
			</section>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-form {
		display: flex;
		flex-direction: column;
		gap: $space-2;

		&__header {
			margin-bottom: $space-2;
		}
		// &__content {
		// 	display: grid;
		// 	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		// }
		&__title {
			font-size: $fs-h2;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}
		&__subtitle {
			margin-top: $space-1;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__body {
			display: flex;
			flex-direction: column;
			gap: $space-5;
		}

		&__cols {
			display: grid;
			gap: $space-5;
			@media (min-width: $bp-tablet) {
				grid-template-columns: 1fr 1fr;
				align-items: start;
			}
		}
		&__col {
			display: flex;
			flex-direction: column;
			gap: $space-5;
			min-width: 0;
		}

		&__section {
			border: 1px solid var(--color-border);
			border-radius: $radius-2xl;
			background: var(--color-bg-surface);
			padding: $space-5;

			&--standalone {
				margin-top: $space-5;
			}
		}
		&__section-title {
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--color-text-secondary);
			margin-bottom: $space-4;
		}
		&__section-hint {
			margin-top: -#{$space-2};
			margin-bottom: $space-4;
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__avatar-row {
			display: flex;
			align-items: center;
			gap: $space-4;
			margin-bottom: $space-4;
		}
		&__avatar-label {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}
		&__avatar-hint {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__grid {
			display: grid;
			gap: $space-4;
			&--2col {
				@media (min-width: $bp-tablet) {
					grid-template-columns: 1fr 1fr;
				}
			}
		}

		&__span-2 {
			@media (min-width: $bp-tablet) {
				grid-column: span 2;
			}
		}

		&__alt-phone {
			display: flex;
			gap: $space-2;
		}
		&__alt-type {
			width: 120px;
			flex-shrink: 0;
		}

		&__referred {
			position: relative;
			@media (min-width: $bp-tablet) {
				grid-column: span 2;
			}
		}

		&__referrer-selected {
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 44px;
			padding: 0 $space-4;
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-md;
			background: var(--color-bg-surface-sunk);
		}
		&__referrer-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}
		&__referrer-clear {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			flex-shrink: 0;
			border: none;
			border-radius: $radius-md;
			background: transparent;
			color: var(--color-text-secondary);
			cursor: pointer;
			i {
				font-size: $fs-body;
			}
			&:hover {
				color: var(--color-text-primary);
				background: var(--color-border);
			}
		}

		&__dropdown {
			position: absolute;
			top: calc(100% + 4px);
			left: 0;
			right: 0;
			z-index: 20;
			max-height: 12rem;
			overflow-y: auto;
			list-style: none;
			padding: $space-1;
			border: 1px solid var(--color-border);
			border-radius: $radius-lg;
			background: var(--color-bg-surface);
			box-shadow: var(--shadow-lg);
		}
		&__dropdown-item {
			display: flex;
			align-items: center;
			gap: $space-2;
			width: 100%;
			padding: $space-2 $space-3;
			border: none;
			border-radius: $radius-md;
			background: transparent;
			text-align: left;
			cursor: pointer;
			font: inherit;
			transition: background-color $duration-fast $ease-standard;
			&:hover {
				background: var(--color-bg-surface-sunk);
			}
		}
		&__dropdown-name {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}
		&__dropdown-phone {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__archive-block {
			margin-top: $space-2;
			padding: $space-3;
			border: 1px solid rgba(225, 29, 72, 0.3);
			border-radius: $radius-lg;
			background: var(--danger-bg);
			font-size: $fs-caption;
		}
		&__archive-block-title {
			font-weight: $weight-medium;
			color: var(--danger-text);
			margin-bottom: $space-1;
		}
		&__archive-block-list {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: $space-1 $space-4;
			list-style: none;
			color: var(--color-text-primary);
		}

		&__toggle-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-xl;
			background: var(--color-bg-app);
			padding: $space-3 $space-4;
			&--danger {
				border-color: rgba(225, 29, 72, 0.4);
				background: var(--danger-bg);
			}
		}
		&__toggle-label {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}
		&__toggle-desc {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__error-block {
			padding: $space-3 $space-4;
			border: 1px solid rgba(225, 29, 72, 0.3);
			border-radius: $radius-lg;
			background: var(--danger-bg);
			font-size: $fs-body;
			color: var(--danger-text);
		}
		&__error-link {
			display: inline-block;
			margin-top: $space-1;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-brand);
			text-decoration: underline;
		}

		&__create {
			display: flex;
			flex-direction: column;
			gap: $space-5;
			max-width: 640px;
		}

		&__more {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			align-self: flex-start;
			padding: $space-3 $space-4;
			border: 1px dashed var(--color-border-strong);
			border-radius: $radius-xl;
			background: var(--color-bg-surface);
			color: var(--color-text-secondary);
			font-size: $fs-body;
			font-weight: $weight-medium;
			cursor: pointer;
			transition:
				color $duration-fast $ease-standard,
				border-color $duration-fast $ease-standard,
				background-color $duration-fast $ease-standard;
			i {
				font-size: $fs-body;
			}
			&:hover {
				color: var(--color-text-primary);
				border-color: var(--color-brand);
				background: var(--color-bg-surface-sunk);
			}
		}

		&__footer {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
		}

		&__empty-notes {
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}
		&__notes-list {
			display: flex;
			flex-direction: column;
			gap: $space-3;
			list-style: none;
		}
		&__note-item {
			border: 1px solid var(--color-border);
			border-radius: $radius-xl;
			background: var(--color-bg-app);
			padding: $space-3;
		}
		&__note-content {
			font-size: $fs-body;
			color: var(--color-text-primary);
			white-space: pre-wrap;
		}
		&__note-meta {
			margin-top: $space-2;
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}
		&__notes-hint {
			margin-top: $space-3;
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}
	}
</style>
