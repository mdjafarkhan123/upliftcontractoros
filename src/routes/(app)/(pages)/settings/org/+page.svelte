<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import OrgLogoUploader from '$lib/components/settings/OrgLogoUploader.svelte';
	import TimezoneCombobox from '$lib/components/shared/TimezoneCombobox.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { getMemberContext } from '$lib/context/member';

	type OrgSettingsApi = {
		name: string;
		trade_type: string;
		timezone: string;
		address: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
		primary_color: string | null;
		tagline: string | null;
		logo_url: string | null;
		signature_block_enabled: boolean;
		signature_name: string | null;
		signature_title: string | null;
		signature_statement: string | null;
		signature_image_url: string | null;
		default_quote_terms: string | null;
		google_review_link: string | null;
		calendar_day_start_hour: number;
		calendar_day_end_hour: number;
		quiet_hours_enabled: boolean;
		quiet_hours_start_hour: number;
		quiet_hours_end_hour: number;
		target_margin_pct: string | null;
	};

	type OrgForm = {
		name: string;
		trade_type: string;
		timezone: string;
		address: string;
		city: string;
		state: string;
		zip: string;
		primary_color: string;
		tagline: string;
		signature_block_enabled: boolean;
		signature_name: string;
		signature_title: string;
		signature_statement: string;
		default_quote_terms: string;
		google_review_link: string;
		calendar_day_start_hour: number;
		calendar_day_end_hour: number;
		quiet_hours_enabled: boolean;
		quiet_hours_start_hour: number;
		quiet_hours_end_hour: number;
		target_margin_pct: string;
	};

	function apiToForm(d: OrgSettingsApi): OrgForm {
		return {
			name: d.name,
			trade_type: d.trade_type,
			timezone: d.timezone,
			address: d.address ?? '',
			city: d.city ?? '',
			state: d.state ?? '',
			zip: d.zip ?? '',
			primary_color: d.primary_color ?? '',
			tagline: d.tagline ?? '',
			signature_block_enabled: d.signature_block_enabled,
			signature_name: d.signature_name ?? '',
			signature_title: d.signature_title ?? '',
			signature_statement: d.signature_statement ?? '',
			default_quote_terms: d.default_quote_terms ?? '',
			google_review_link: d.google_review_link ?? '',
			calendar_day_start_hour: d.calendar_day_start_hour,
			calendar_day_end_hour: d.calendar_day_end_hour,
			quiet_hours_enabled: d.quiet_hours_enabled,
			quiet_hours_start_hour: d.quiet_hours_start_hour,
			quiet_hours_end_hour: d.quiet_hours_end_hour,
			target_margin_pct: d.target_margin_pct ?? ''
		};
	}

	const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => ({
		value: h,
		label:
			h === 0
				? '12:00 AM'
				: h < 12
					? `${h}:00 AM`
					: h === 12
						? '12:00 PM'
						: h === 24
							? '12:00 AM (next day)'
							: `${h - 12}:00 PM`
	}));

	const SWATCHES = [
		'#ef4444',
		'#f97316',
		'#f59e0b',
		'#eab308',
		'#84cc16',
		'#22c55e',
		'#10b981',
		'#14b8a6',
		'#06b6d4',
		'#0ea5e9',
		'#3b82f6',
		'#6366f1',
		'#8b5cf6',
		'#a855f7',
		'#d946ef',
		'#ec4899',
		'#f43f5e',
		'#64748b',
		'#475569',
		'#0f172a'
	];

	const member = getMemberContext();
	let m = $derived(member());

	let original = $state<OrgForm | null>(null);
	let form = $state<OrgForm | null>(null);
	let logoUrl = $state<string | null>(null);
	let signatureImageUrl = $state<string | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	let dirty = $derived(
		original !== null && form !== null && JSON.stringify(original) !== JSON.stringify(form)
	);

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/org');
			const body = (await res.json()) as { data?: OrgSettingsApi; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load organization settings');
				return;
			}
			const formed = apiToForm(body.data);
			original = formed;
			form = { ...formed };
			logoUrl = body.data.logo_url;
			signatureImageUrl = body.data.signature_image_url;
		} finally {
			loading = false;
		}
	}

	async function save() {
		if (!form || !original) return;
		saving = true;
		fieldErrors = {};
		try {
			// Only send changed fields; convert empty strings → null for nullable columns.
			const nullableKeys = new Set<keyof OrgForm>([
				'address',
				'city',
				'state',
				'zip',
				'primary_color',
				'tagline',
				'signature_name',
				'signature_title',
				'signature_statement',
				'default_quote_terms',
				'google_review_link'
			]);
			const payload: Record<string, unknown> = {};
			for (const k of Object.keys(form) as (keyof OrgForm)[]) {
				if (form[k] !== original[k]) {
					const v = form[k];
					payload[k] = nullableKeys.has(k) && v === '' ? null : v;
				}
			}
			// Margin floor is a text input but the API expects a number (or null to clear).
			if ('target_margin_pct' in payload) {
				const raw = String(payload.target_margin_pct ?? '').trim();
				payload.target_margin_pct = raw === '' ? null : Number(raw);
			}
			if (Object.keys(payload).length === 0) {
				toast.info('No changes to save');
				saving = false;
				return;
			}

			const res = await fetch('/api/settings/org', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as {
				data?: OrgSettingsApi;
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				const formed = apiToForm(body.data);
				original = formed;
				form = { ...formed };
				logoUrl = body.data.logo_url;
				signatureImageUrl = body.data.signature_image_url;
				sessionStore.invalidate();
				void sessionStore.load(true);
				toast.success('Organization settings saved');
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Organization Settings</title></svelte:head>

<UnsavedChangesGuard {dirty} />

<PageWrapper title="Organization" subtitle="Business details and branding" back="/settings">
	{#if loading || !form}
		<div class="settings-form">
			<SkeletonLoader lines={8} label="Loading organization settings" />
		</div>
	{:else}
		<form
			class="settings-form"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<!-- Business details -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Business details</p>
						<p class="settings-card__desc">The basics shown across customer-facing documents.</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="settings-grid">
						<div class="field">
							<label class="field__label field__label--required" for="name">Business name</label>
							<input
								id="name"
								class="field__input"
								data-invalid={fieldErrors.name ? '' : undefined}
								bind:value={form.name}
								required
								maxlength={200}
							/>
							{#if fieldErrors.name}<p class="field__error">{fieldErrors.name}</p>{/if}
						</div>

						<div class="field">
							<label class="field__label field__label--required" for="trade_type">Trade</label>
							<input
								id="trade_type"
								class="field__input"
								data-invalid={fieldErrors.trade_type ? '' : undefined}
								bind:value={form.trade_type}
								required
								maxlength={100}
							/>
							{#if fieldErrors.trade_type}<p class="field__error">{fieldErrors.trade_type}</p>{/if}
						</div>

						<div class="field settings-grid__full">
							<label class="field__label field__label--required" for="timezone">Timezone</label>
							<TimezoneCombobox
								id="timezone"
								bind:value={form.timezone}
								invalid={Boolean(fieldErrors.timezone)}
							/>
							{#if fieldErrors.timezone}
								<p class="field__error">{fieldErrors.timezone}</p>
							{:else}
								<p class="field__hint">
									Used for booking links, reminders, and all date formatting.
								</p>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Location -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Location</p>
						<p class="settings-card__desc">Where your business operates.</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="settings-grid">
						<div class="field settings-grid__full">
							<label class="field__label" for="address">Address</label>
							<input id="address" class="field__input" bind:value={form.address} maxlength={500} />
							{#if fieldErrors.address}<p class="field__error">{fieldErrors.address}</p>{/if}
						</div>
						<div class="field">
							<label class="field__label" for="city">City</label>
							<input id="city" class="field__input" bind:value={form.city} maxlength={100} />
						</div>
						<div class="settings-grid" style:grid-template-columns="1fr 1fr">
							<div class="field">
								<label class="field__label" for="state">State</label>
								<input id="state" class="field__input" bind:value={form.state} maxlength={100} />
							</div>
							<div class="field">
								<label class="field__label" for="zip">Zip</label>
								<input id="zip" class="field__input" bind:value={form.zip} maxlength={20} />
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Reviews -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Reviews</p>
						<p class="settings-card__desc">Your Google review destination.</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="field">
						<label class="field__label" for="google_review_link">
							Google Business Profile review link
						</label>
						<input
							id="google_review_link"
							type="url"
							class="field__input"
							bind:value={form.google_review_link}
							placeholder="https://g.page/r/..."
							maxlength={500}
						/>
						{#if fieldErrors.google_review_link}
							<p class="field__error">{fieldErrors.google_review_link}</p>
						{:else}
							<p class="field__hint">
								Used in review-request messages as the <code>{'{review_link}'}</code> variable. Find this
								in your Google Business Profile under "Get more reviews".
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Quote profitability -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Quote profitability</p>
						<p class="settings-card__desc">
							Your target profit margin. While building a quote, the internal margin readout turns
							green at or above this number, amber when it's within 10 points below, and red when
							you're underpricing. Only your team sees this — never the customer.
						</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="field" style:max-width="220px">
						<label class="field__label" for="target_margin_pct">Target profit margin (%)</label>
						<input
							id="target_margin_pct"
							type="number"
							inputmode="decimal"
							min="0"
							max="100"
							step="1"
							class="field__input"
							data-invalid={fieldErrors.target_margin_pct ? '' : undefined}
							bind:value={form.target_margin_pct}
							placeholder="e.g. 40"
						/>
						{#if fieldErrors.target_margin_pct}
							<p class="field__error">{fieldErrors.target_margin_pct}</p>
						{:else}
							<p class="field__hint">Leave blank to turn off the color signal.</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Calendar visible hours -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Calendar visible hours</p>
						<p class="settings-card__desc">
							Sets the time range shown on your Appointments calendar. Bookings outside this range
							still appear — off-hours are just dimmed.
						</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="settings-grid" style:grid-template-columns="1fr 1fr">
						<div class="field">
							<label class="field__label" for="calendar_day_start_hour">Day starts</label>
							<select
								id="calendar_day_start_hour"
								class="field__select"
								bind:value={form.calendar_day_start_hour}
							>
								{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							{#if fieldErrors.calendar_day_start_hour}
								<p class="field__error">{fieldErrors.calendar_day_start_hour}</p>
							{/if}
						</div>
						<div class="field">
							<label class="field__label" for="calendar_day_end_hour">Day ends</label>
							<select
								id="calendar_day_end_hour"
								class="field__select"
								bind:value={form.calendar_day_end_hour}
							>
								{#each HOUR_OPTIONS.slice(1) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							{#if fieldErrors.calendar_day_end_hour}
								<p class="field__error">{fieldErrors.calendar_day_end_hour}</p>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- SMS quiet hours -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">SMS quiet hours</p>
						<p class="settings-card__desc">
							Outbound texts are held during these hours and sent automatically once the window
							reopens — they're never lost. Evaluated in your business timezone.
						</p>
					</div>
					<label class="settings-switch-inline">
						<input type="checkbox" bind:checked={form.quiet_hours_enabled} />
						Enabled
					</label>
				</div>
				<div class="settings-card__body">
					<div
						class="settings-grid"
						style:grid-template-columns="1fr 1fr"
						style:opacity={form.quiet_hours_enabled ? 1 : 0.5}
					>
						<div class="field">
							<label class="field__label" for="quiet_hours_start_hour">Quiet from</label>
							<select
								id="quiet_hours_start_hour"
								class="field__select"
								bind:value={form.quiet_hours_start_hour}
								disabled={!form.quiet_hours_enabled}
							>
								{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							{#if fieldErrors.quiet_hours_start_hour}
								<p class="field__error">{fieldErrors.quiet_hours_start_hour}</p>
							{/if}
						</div>
						<div class="field">
							<label class="field__label" for="quiet_hours_end_hour">Quiet until</label>
							<select
								id="quiet_hours_end_hour"
								class="field__select"
								bind:value={form.quiet_hours_end_hour}
								disabled={!form.quiet_hours_enabled}
							>
								{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							{#if fieldErrors.quiet_hours_end_hour}
								<p class="field__error">{fieldErrors.quiet_hours_end_hour}</p>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Branding -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Branding</p>
						<p class="settings-card__desc">
							Logo, brand color, and tagline for customer documents.
						</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="settings-grid">
						<div class="field">
							<label class="field__label" for="primary_color">Brand color</label>
							<div class="color-picker">
								<input
									id="primary_color"
									class="field__input"
									bind:value={form.primary_color}
									placeholder="#3b82f6"
									maxlength={7}
								/>
								<Popover.Root>
									<Popover.Trigger
										type="button"
										aria-label="Open color picker"
										class="color-picker__trigger"
										style={`background-color: ${form.primary_color || 'transparent'}`}
									>
										{#if !form.primary_color}
											<span class="color-picker__trigger-empty"></span>
										{/if}
									</Popover.Trigger>
									<Popover.Content class="color-picker__panel">
										<div class="color-picker__grid">
											{#each SWATCHES as swatch (swatch)}
												<button
													type="button"
													aria-label={swatch}
													class="color-picker__swatch"
													class:color-picker__swatch--selected={form.primary_color?.toLowerCase() ===
														swatch}
													style:background-color={swatch}
													onclick={() => form && (form.primary_color = swatch)}
												></button>
											{/each}
										</div>
										<div class="color-picker__custom">
											<label class="color-picker__custom-swatch" aria-label="Pick a custom color">
												<input
													type="color"
													value={form.primary_color || '#3b82f6'}
													oninput={(e) => {
														if (form)
															form.primary_color = (e.currentTarget as HTMLInputElement).value;
													}}
												/>
												<span style:background-color={form.primary_color || '#3b82f6'}></span>
											</label>
											<span class="color-picker__custom-label">Custom hex</span>
											{#if form.primary_color}
												<button
													type="button"
													class="color-picker__clear"
													onclick={() => form && (form.primary_color = '')}
												>
													Clear
												</button>
											{/if}
										</div>
									</Popover.Content>
								</Popover.Root>
							</div>
							{#if fieldErrors.primary_color}
								<p class="field__error">{fieldErrors.primary_color}</p>
							{:else}
								<p class="field__hint">
									Brand color applies to customer-facing experiences such as invoices, quotes,
									reminders, portals, and public-facing assets. It does not change the CRM interface
									theme.
								</p>
							{/if}
						</div>

						<div class="field">
							<span class="field__label">Logo</span>
							<OrgLogoUploader currentLogoUrl={logoUrl} onChange={(next) => (logoUrl = next)} />
						</div>

						<div class="field settings-grid__full">
							<label class="field__label" for="tagline">Tagline</label>
							<input
								id="tagline"
								class="field__input"
								bind:value={form.tagline}
								placeholder="e.g. Licensed & Insured · Family-Owned Since 2009"
								maxlength={120}
							/>
							{#if fieldErrors.tagline}
								<p class="field__error">{fieldErrors.tagline}</p>
							{:else}
								<p class="field__hint">
									A short line shown under your name on quotes and PDFs. Great for trust cues like
									licensing, warranties, or years in business.
								</p>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Quote signature -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Quote signature</p>
						<p class="settings-card__desc">
							An "Authorized by" block stamped on the bottom of every quote your customer sees and
							on the PDF. Set it once — it applies to all quotes. This is separate from the
							customer's signature when they accept.
						</p>
					</div>
					<label class="settings-switch-inline">
						<input type="checkbox" bind:checked={form.signature_block_enabled} />
						Show on quotes
					</label>
				</div>
				<div class="settings-card__body">
					<div class="settings-grid" style:opacity={form.signature_block_enabled ? 1 : 0.6}>
						<div class="field">
							<label
								class="field__label"
								class:field__label--required={form.signature_block_enabled}
								for="signature_name"
							>
								Authorizer name
							</label>
							<input
								id="signature_name"
								class="field__input"
								bind:value={form.signature_name}
								placeholder="e.g. John Smith"
								maxlength={120}
							/>
							{#if fieldErrors.signature_name}
								<p class="field__error">{fieldErrors.signature_name}</p>
							{/if}
						</div>
						<div class="field">
							<label class="field__label" for="signature_title">Title</label>
							<input
								id="signature_title"
								class="field__input"
								bind:value={form.signature_title}
								placeholder="e.g. Owner"
								maxlength={120}
							/>
							{#if fieldErrors.signature_title}
								<p class="field__error">{fieldErrors.signature_title}</p>
							{/if}
						</div>

						<div class="field settings-grid__full">
							<label class="field__label" for="signature_statement">Authorization line</label>
							<textarea
								id="signature_statement"
								class="field__textarea"
								bind:value={form.signature_statement}
								maxlength={300}
								rows={2}
								placeholder="e.g. Prepared and authorized on behalf of Acme Fencing LLC."
							></textarea>
							{#if fieldErrors.signature_statement}
								<p class="field__error">{fieldErrors.signature_statement}</p>
							{:else}
								<p class="field__hint">
									Optional. A short line that appears under the name — great for an authorization or
									warranty statement.
								</p>
							{/if}
						</div>

						<div class="field settings-grid__full">
							<span class="field__label">Signature image (optional)</span>
							<OrgLogoUploader
								currentLogoUrl={signatureImageUrl}
								onChange={(next) => (signatureImageUrl = next)}
								purposeTag="org_signature"
								fieldKey="signature_image_url"
								noun="signature"
								helpText="Upload a scan or drawn signature. PNG with a transparent background looks best. Up to 5 MB."
							/>
						</div>
					</div>

					{#if form.signature_block_enabled && form.signature_name.trim()}
						<div class="sig-preview">
							<p class="sig-preview__eyebrow">Preview</p>
							<p class="sig-preview__eyebrow">Authorized by</p>
							{#if signatureImageUrl}
								<img class="sig-preview__img" src={signatureImageUrl} alt="Signature" />
							{/if}
							<p class="sig-preview__name">
								{form.signature_name.trim()}{#if form.signature_title.trim()}<span
										class="sig-preview__title"
									>
										· {form.signature_title.trim()}</span
									>{/if}
							</p>
							{#if form.signature_statement.trim()}
								<p class="sig-preview__statement">{form.signature_statement.trim()}</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Quote terms & conditions -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Quote terms &amp; conditions</p>
						<p class="settings-card__desc">
							Your default fine print — payment terms, warranty, what's included or excluded.
							Written once here, it's added to every new quote automatically and shown on the quote
							and PDF above the signature. You can still tweak it on any individual quote. This is
							separate from the free-form "Notes" on a quote.
						</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="field">
						<label class="field__label" for="default_quote_terms">Default terms</label>
						<textarea
							id="default_quote_terms"
							class="field__textarea"
							bind:value={form.default_quote_terms}
							maxlength={8000}
							rows={8}
							placeholder={'e.g. A 50% deposit is required to schedule work. Balance due on completion. All workmanship guaranteed for 1 year. Prices valid for 30 days.'}
						></textarea>
						{#if fieldErrors.default_quote_terms}
							<p class="field__error">{fieldErrors.default_quote_terms}</p>
						{:else}
							<p class="field__hint">
								Leave blank to show no terms. Changing this only affects quotes created from now on
								— quotes you've already sent keep the terms your customer saw.
							</p>
						{/if}
					</div>
				</div>
			</div>

			<footer class="settings-card__footer" style:border-radius="var(--radius-xl)">
				<Button
					variant="secondary"
					disabled={saving || !dirty}
					onclick={() => {
						if (original) form = { ...original };
						fieldErrors = {};
					}}
				>
					Reset
				</Button>
				<Button type="submit" disabled={!dirty} loading={saving} loadingLabel="Saving…">
					Save changes
				</Button>
			</footer>
		</form>
	{/if}
</PageWrapper>
