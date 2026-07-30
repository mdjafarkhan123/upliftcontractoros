<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatDateTime } from '$lib/utils/format';

	type Channel = 'all' | 'sms' | 'email' | 'call' | 'whatsapp' | 'messenger' | 'gbp' | 'webchat';
	type Direction = 'all' | 'inbound' | 'outbound';
	type Category =
		| 'all'
		| 'manual_message'
		| 'marketing'
		| 'speed_to_lead'
		| 'quote_send'
		| 'quote_followup'
		| 'invoice_send'
		| 'invoice_reminder'
		| 'appointment_confirmation'
		| 'appointment_reminder'
		| 'job_scheduled'
		| 'job_on_my_way'
		| 'payment_receipt'
		| 'review_request'
		| 'private_feedback_recovery';

	type Preference = {
		id: string;
		channel: Channel;
		direction: Direction;
		category: Category;
		status: 'allowed' | 'blocked' | 'permanent';
		source: string;
		reason_code: string | null;
		reason_message: string | null;
		effective_from: string;
		updated_at: string;
	};
	type Consent = {
		id: string;
		channel: Channel;
		category: Category;
		status: 'unknown' | 'opted_in' | 'opted_out' | 'revoked';
		source: string;
		consented_at: string | null;
		revoked_at: string | null;
		updated_at: string;
	};
	type Event = {
		id: string;
		channel: Channel;
		direction: Direction;
		category: Category;
		previous_status: string | null;
		next_status: string;
		source: string;
		reason_code: string | null;
		reason_message: string | null;
		created_at: string;
	};

	let { contactId }: { contactId: string } = $props();
	let loading = $state(true);
	let saving = $state(false);
	let preferences = $state<Preference[]>([]);
	let consents = $state<Consent[]>([]);
	let events = $state<Event[]>([]);
	let showAdd = $state(false);
	let scope = $state<{ channel: Channel; direction: Direction; category: Category }>({
		channel: 'sms',
		direction: 'outbound',
		category: 'all'
	});
	let reason = $state('');
	let reasonCode = $state('USER_DND_ACTION');
	let consentScope = $state<{ channel: Channel; category: Category }>({
		channel: 'sms',
		category: 'marketing'
	});
	let consentStatus = $state<Consent['status']>('unknown');

	const channels: { value: Channel; label: string }[] = [
		{ value: 'all', label: 'All channels' },
		{ value: 'sms', label: 'SMS' },
		{ value: 'email', label: 'Email' },
		{ value: 'call', label: 'Calls' },
		{ value: 'whatsapp', label: 'WhatsApp' },
		{ value: 'messenger', label: 'Messenger' },
		{ value: 'gbp', label: 'Google Business' },
		{ value: 'webchat', label: 'Webchat' }
	];
	const directions: { value: Direction; label: string }[] = [
		{ value: 'all', label: 'Inbound + outbound' },
		{ value: 'inbound', label: 'Inbound' },
		{ value: 'outbound', label: 'Outbound' }
	];
	const categories: { value: Category; label: string }[] = [
		{ value: 'all', label: 'All categories' },
		{ value: 'manual_message', label: 'Manual messages' },
		{ value: 'marketing', label: 'Marketing' },
		{ value: 'speed_to_lead', label: 'Speed to lead' },
		{ value: 'quote_send', label: 'Quote sends' },
		{ value: 'quote_followup', label: 'Quote follow-ups' },
		{ value: 'invoice_send', label: 'Invoice sends' },
		{ value: 'invoice_reminder', label: 'Invoice reminders' },
		{ value: 'appointment_confirmation', label: 'Appointment confirmations' },
		{ value: 'appointment_reminder', label: 'Appointment reminders' },
		{ value: 'job_scheduled', label: 'Job scheduled' },
		{ value: 'job_on_my_way', label: 'On my way' },
		{ value: 'payment_receipt', label: 'Payment receipts' },
		{ value: 'review_request', label: 'Review requests' },
		{ value: 'private_feedback_recovery', label: 'Private feedback recovery' }
	];
	const consentStatuses = [
		{ value: 'unknown', label: 'Unknown' },
		{ value: 'opted_in', label: 'Opted in' },
		{ value: 'opted_out', label: 'Opted out' },
		{ value: 'revoked', label: 'Revoked' }
	];

	const labelFor = (items: readonly { value: string; label: string }[], value: string) =>
		items.find((item) => item.value === value)?.label ?? value;
	const statusLabel = (status: string) =>
		({
			allowed: 'Allowed',
			blocked: 'Blocked',
			permanent: 'Permanent',
			unknown: 'Unknown',
			opted_in: 'Opted in',
			opted_out: 'Opted out',
			revoked: 'Revoked'
		})[status] ?? status;

	const globalPreference = $derived(
		preferences.find((p) => p.channel === 'all' && p.direction === 'all' && p.category === 'all')
	);
	const activeBlocks = $derived(
		preferences.filter(
			(p) =>
				p.status !== 'allowed' &&
				!(p.channel === 'all' && p.direction === 'all' && p.category === 'all')
		)
	);

	async function load() {
		loading = true;
		try {
			const response = await fetch(`/api/contacts/${contactId}/communication-preferences`);
			const body = (await response.json()) as {
				data?: { preferences: Preference[]; consents: Consent[]; events: Event[] };
				error?: string;
			};
			if (!response.ok || !body.data)
				throw new Error(body.error ?? 'Unable to load communication preferences.');
			preferences = body.data.preferences;
			consents = body.data.consents;
			events = body.data.events;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to load communication preferences.'
			);
		} finally {
			loading = false;
		}
	}

	async function changeDnd(
		target: { channel: Channel; direction: Direction; category: Category },
		enabled: boolean
	) {
		if (saving) return;
		saving = true;
		try {
			const response = await fetch(`/api/contacts/${contactId}/communication-preferences`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...target,
					action: enabled ? 'disable' : 'enable',
					reason_code: reasonCode,
					reason_message: reason || undefined
				})
			});
			const body = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(body.error ?? 'Unable to update DND.');
			toast.success(enabled ? 'DND enabled' : 'DND cleared');
			reason = '';
			showAdd = false;
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to update DND.');
		} finally {
			saving = false;
		}
	}

	async function saveConsent() {
		if (saving) return;
		saving = true;
		try {
			const response = await fetch(
				`/api/contacts/${contactId}/communication-preferences/consents`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...consentScope, status: consentStatus })
				}
			);
			const body = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(body.error ?? 'Unable to update consent.');
			toast.success('Consent updated');
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to update consent.');
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		void load();
	});
</script>

<section class="communication-preferences">
	<div class="communication-preferences__header">
		<div>
			<p class="eyebrow">Communication</p>
			<h2 class="communication-preferences__title">Communication preferences</h2>
			<p class="communication-preferences__description">
				GHL-style DND and consent controls for this contact.
			</p>
		</div>
		<i class="ri-shield-check-line communication-preferences__header-icon" aria-hidden="true"></i>
	</div>

	{#if loading}
		<SkeletonLoader lines={5} height="48px" label="Loading communication preferences" />
	{:else}
		<div
			class="communication-preferences__global"
			class:communication-preferences__global--blocked={globalPreference?.status !== 'allowed'}
		>
			<div class="communication-preferences__global-copy">
				<div class="communication-preferences__global-icon">
					<i class="ri-forbid-2-line" aria-hidden="true"></i>
				</div>
				<div>
					<h3>Global DND</h3>
					<p>
						{globalPreference?.status === 'permanent'
							? 'Permanent opt-out — locked by provider or customer request.'
							: globalPreference?.status === 'blocked'
								? 'All inbound and outbound communication is blocked.'
								: 'No global DND. Scoped channel or category rules may still apply.'}
					</p>
					{#if globalPreference}<span class="communication-preferences__meta"
							>{statusLabel(globalPreference.status)} · {globalPreference.source} · {formatDateTime(
								globalPreference.updated_at
							)}</span
						>{/if}
				</div>
			</div>
			<Switch
				checked={globalPreference?.status === 'blocked' || globalPreference?.status === 'permanent'}
				disabled={globalPreference?.status === 'permanent' || saving}
				onchange={(checked) =>
					void changeDnd({ channel: 'all', direction: 'all', category: 'all' }, checked)}
				aria-label="Toggle global DND"
			/>
		</div>

		<div class="communication-preferences__section">
			<div class="communication-preferences__section-head">
				<div>
					<h3>DND rules</h3>
					<p>Specific blocks take effect after global DND and before consent checks.</p>
				</div>
				<Button variant="outline" size="sm" onclick={() => (showAdd = !showAdd)}
					><i class="ri-add-line" aria-hidden="true"></i> Add rule</Button
				>
			</div>
			{#if showAdd}
				<div class="communication-preferences__form">
					<label
						>Channel<Select.Root bind:value={scope.channel} items={channels}
							><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
								>{#each channels as item (item.value)}<Select.Item
										value={item.value}
										label={item.label}>{item.label}</Select.Item
									>{/each}</Select.Content
							></Select.Root
						></label
					>
					<label
						>Direction<Select.Root bind:value={scope.direction} items={directions}
							><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
								>{#each directions as item (item.value)}<Select.Item
										value={item.value}
										label={item.label}>{item.label}</Select.Item
									>{/each}</Select.Content
							></Select.Root
						></label
					>
					<label
						>Category<Select.Root bind:value={scope.category} items={categories}
							><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
								>{#each categories as item (item.value)}<Select.Item
										value={item.value}
										label={item.label}>{item.label}</Select.Item
									>{/each}</Select.Content
							></Select.Root
						></label
					>
					<label>Reason code<Input bind:value={reasonCode} /></label>
					<label class="communication-preferences__form-wide"
						>Reason<Input
							bind:value={reason}
							placeholder="Why is this rule being applied?"
						/></label
					>
					<div class="communication-preferences__form-actions">
						<Button variant="outline" size="sm" onclick={() => (showAdd = false)}>Cancel</Button
						><Button size="sm" disabled={saving} onclick={() => void changeDnd(scope, true)}
							>Enable DND</Button
						>
					</div>
				</div>
			{/if}
			{#if activeBlocks.length === 0}
				<p class="communication-preferences__empty">No scoped DND rules.</p>
			{:else}
				<div class="communication-preferences__rules">
					{#each activeBlocks as rule (rule.id)}
						<div class="communication-preferences__rule">
							<div>
								<strong>{labelFor(channels, rule.channel)}</strong><span
									>{labelFor(directions, rule.direction)} · {labelFor(
										categories,
										rule.category
									)}</span
								><small
									>{statusLabel(rule.status)} · {rule.source}{rule.reason_message
										? ` · ${rule.reason_message}`
										: ''}</small
								>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={rule.status === 'permanent' || saving}
								onclick={() =>
									void changeDnd(
										{ channel: rule.channel, direction: rule.direction, category: rule.category },
										false
									)}>{rule.status === 'permanent' ? 'Locked' : 'Clear'}</Button
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="communication-preferences__section">
			<div class="communication-preferences__section-head">
				<div>
					<h3>Consent status</h3>
					<p>Legal consent is separate from DND and is evaluated by category.</p>
				</div>
			</div>
			<div class="communication-preferences__consent-form">
				<Select.Root bind:value={consentScope.channel} items={channels}
					><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
						>{#each channels as item (item.value)}<Select.Item value={item.value} label={item.label}
								>{item.label}</Select.Item
							>{/each}</Select.Content
					></Select.Root
				>
				<Select.Root bind:value={consentScope.category} items={categories}
					><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
						>{#each categories as item (item.value)}<Select.Item
								value={item.value}
								label={item.label}>{item.label}</Select.Item
							>{/each}</Select.Content
					></Select.Root
				>
				<Select.Root bind:value={consentStatus} items={consentStatuses}
					><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
						><Select.Item value="unknown" label="Unknown">Unknown</Select.Item><Select.Item
							value="opted_in"
							label="Opted in">Opted in</Select.Item
						><Select.Item value="opted_out" label="Opted out">Opted out</Select.Item><Select.Item
							value="revoked"
							label="Revoked">Revoked</Select.Item
						></Select.Content
					></Select.Root
				>
				<Button size="sm" disabled={saving} onclick={() => void saveConsent()}>Save consent</Button>
			</div>
			{#if consents.length === 0}<p class="communication-preferences__empty">
					No consent records yet.
				</p>{:else}<div class="communication-preferences__consents">
					{#each consents as consent (consent.id)}<div class="communication-preferences__consent">
							<div>
								<strong
									>{labelFor(channels, consent.channel)} · {labelFor(
										categories,
										consent.category
									)}</strong
								><span>{statusLabel(consent.status)} · {consent.source}</span>
							</div>
							<small>{formatDateTime(consent.updated_at)}</small>
						</div>{/each}
				</div>{/if}
		</div>

		<div class="communication-preferences__section communication-preferences__section--audit">
			<div class="communication-preferences__section-head">
				<div>
					<h3>Audit history</h3>
					<p>Every DND transition is retained with its source and reason.</p>
				</div>
				<span class="communication-preferences__audit-count">{events.length} events</span>
			</div>
			{#if events.length === 0}<p class="communication-preferences__empty">
					No DND changes recorded.
				</p>{:else}<ol class="communication-preferences__timeline">
					{#each events as event (event.id)}<li>
							<span class="communication-preferences__timeline-dot"></span>
							<div>
								<strong
									>{statusLabel(event.next_status)} · {labelFor(channels, event.channel)}</strong
								><span
									>{labelFor(directions, event.direction)} · {labelFor(categories, event.category)} ·
									{event.source}</span
								><small
									>{event.reason_message ?? event.reason_code ?? 'No reason provided'} · {formatDateTime(
										event.created_at
									)}</small
								>
							</div>
						</li>{/each}
				</ol>{/if}
		</div>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.communication-preferences {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		padding: $space-5;
		border: 1px solid var(--color-border);
		border-radius: $radius-2xl;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-sm);
	}
	.communication-preferences__header,
	.communication-preferences__section-head,
	.communication-preferences__global,
	.communication-preferences__rule,
	.communication-preferences__consent,
	.communication-preferences__timeline li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-4;
	}
	.communication-preferences__title {
		margin: 2px 0 0;
		font-size: $fs-lg;
		color: var(--color-text-primary);
	}
	.communication-preferences__description,
	.communication-preferences__section-head p,
	.communication-preferences__global p {
		margin: 3px 0 0;
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}
	.communication-preferences__header-icon {
		font-size: 1.5rem;
		color: var(--color-brand);
	}
	.communication-preferences__global {
		padding: $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		background: var(--color-bg-surface-sunk);
	}
	.communication-preferences__global--blocked {
		border-color: var(--danger-solid);
		background: var(--danger-bg);
	}
	.communication-preferences__global-copy {
		display: flex;
		align-items: flex-start;
		gap: $space-3;
	}
	.communication-preferences__global-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: $radius-full;
		color: var(--danger-solid);
		background: var(--danger-bg);
	}
	.communication-preferences__global h3,
	.communication-preferences__section h3 {
		margin: 0;
		font-size: $fs-body;
		color: var(--color-text-primary);
	}
	.communication-preferences__meta,
	.communication-preferences__rule small,
	.communication-preferences__consent small,
	.communication-preferences__timeline small {
		display: block;
		margin-top: 4px;
		font-size: $fs-caption;
		color: var(--color-text-muted);
	}
	.communication-preferences__section {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		padding-top: $space-4;
		border-top: 1px solid var(--color-border);
	}
	.communication-preferences__form {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: $space-3;
		padding: $space-4;
		border-radius: $radius-lg;
		background: var(--color-bg-surface-sunk);
	}
	.communication-preferences__form label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: $fs-caption;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
	}
	.communication-preferences__form-wide {
		grid-column: span 2;
	}
	.communication-preferences__form-actions {
		display: flex;
		align-items: end;
		justify-content: end;
		gap: $space-2;
		grid-column: span 2;
	}
	.communication-preferences__rules,
	.communication-preferences__consents {
		display: flex;
		flex-direction: column;
	}
	.communication-preferences__rule,
	.communication-preferences__consent {
		padding: $space-3 0;
		border-top: 1px solid var(--color-border);
	}
	.communication-preferences__rule strong,
	.communication-preferences__consent strong,
	.communication-preferences__timeline strong {
		display: block;
		font-size: $fs-body;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}
	.communication-preferences__rule span,
	.communication-preferences__consent span,
	.communication-preferences__timeline span {
		display: block;
		margin-top: 3px;
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}
	.communication-preferences__empty {
		margin: 0;
		padding: $space-3;
		border-radius: $radius-lg;
		background: var(--color-bg-surface-sunk);
		font-size: $fs-body;
		color: var(--color-text-muted);
	}
	.communication-preferences__consent-form {
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr auto;
		gap: $space-3;
		align-items: center;
	}
	.communication-preferences__audit-count {
		font-size: $fs-caption;
		color: var(--color-text-muted);
	}
	.communication-preferences__timeline {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.communication-preferences__timeline li {
		position: relative;
		justify-content: flex-start;
		align-items: flex-start;
		padding: $space-3 0 $space-3 $space-5;
		border-left: 1px solid var(--color-border);
	}
	.communication-preferences__timeline-dot {
		position: absolute;
		left: -5px;
		top: 18px;
		width: 9px;
		height: 9px;
		border: 2px solid var(--color-bg-surface);
		border-radius: $radius-full;
		background: var(--color-brand);
	}
	@media (max-width: 900px) {
		.communication-preferences__form,
		.communication-preferences__consent-form {
			grid-template-columns: 1fr 1fr;
		}
		.communication-preferences__form-wide,
		.communication-preferences__form-actions {
			grid-column: span 2;
		}
	}
</style>
