<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	$effect(() => {
		if (!member().can_create_contacts) goto('/contacts');
	});

	let full_name = $state('');
	let phone = $state('');
	let email = $state('');
	let lead_source = $state<
		'website_form' | 'live_chat' | 'missed_call' | 'manual' | 'referral' | 'other'
	>('manual');
	let assigned_to = $state<string>('');
	let referred_by_contact_id = $state<string>('');
	let notes = $state('');

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let duplicateInfo = $state<{ id: string; soft: boolean } | null>(null);
	let restoring = $state(false);

	let assignees = $state<Array<{ id: string; full_name: string }>>([]);

	let referrerSearch = $state('');
	let referrerResults = $state<Array<{ id: string; full_name: string; phone: string }>>([]);
	let referrerName = $state('');
	let referrerSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let showReferrerDropdown = $state(false);

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
				referrerResults = body.items.slice(0, 8);
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
		saving = true;
		errorMsg = null;
		duplicateInfo = null;

		const payload: Record<string, unknown> = {
			full_name: full_name.trim(),
			phone: phone.trim(),
			lead_source
		};
		if (email.trim()) payload.email = email.trim();
		if (assigned_to) payload.assigned_to = assigned_to;
		if (referred_by_contact_id) payload.referred_by_contact_id = referred_by_contact_id;
		if (notes.trim()) payload.notes = notes.trim();

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

<svelte:head><title>New contact</title></svelte:head>

<PageWrapper title="New contact" subtitle="Add a new lead or customer" back="/contacts">
	<form class="grid gap-4" onsubmit={save}>
		<div class="space-y-1.5">
			<Label for="full_name">Name <span class="text-destructive">*</span></Label>
			<Input id="full_name" bind:value={full_name} required maxlength={200} autocomplete="name" />
		</div>

		<div class="space-y-1.5">
			<Label for="phone">Phone <span class="text-destructive">*</span></Label>
			<Input
				id="phone"
				type="tel"
				inputmode="tel"
				bind:value={phone}
				required
				autocomplete="tel"
				placeholder="(555) 123-4567"
			/>
		</div>

		<div class="space-y-1.5">
			<Label for="email">Email</Label>
			<Input id="email" type="email" bind:value={email} autocomplete="email" />
		</div>

		<div class="space-y-1.5">
			<Label for="lead_source">Lead source</Label>
			<Select.Root bind:value={lead_source}>
				<Select.Trigger class="h-11 w-full">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="manual">Manual</Select.Item>
					<Select.Item value="website_form">Website form</Select.Item>
					<Select.Item value="live_chat">Live chat</Select.Item>
					<Select.Item value="missed_call">Missed call</Select.Item>
					<Select.Item value="referral">Referral</Select.Item>
					<Select.Item value="other">Other</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>

		<div class="space-y-1.5">
			<Label for="assigned_to">Assigned to</Label>
			<Select.Root bind:value={assigned_to}>
				<Select.Trigger class="h-11 w-full">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">Unassigned</Select.Item>
					{#each assignees as a (a.id)}
						<Select.Item value={a.id}>{a.full_name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="relative space-y-1.5">
			<Label for="referred_by">Referred by (optional)</Label>
			{#if referred_by_contact_id}
				<div
					class="flex h-11 items-center justify-between rounded-md border border-border bg-muted/50 px-3 text-sm"
				>
					<span class="truncate font-medium">{referrerName}</span>
					<button
						type="button"
						class="ml-2 text-muted-foreground hover:text-foreground"
						onclick={clearReferrer}
						aria-label="Clear referrer">&times;</button
					>
				</div>
			{:else}
				<Input
					id="referred_by"
					type="search"
					inputmode="search"
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
					<ul
						class="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
					>
						{#each referrerResults as r (r.id)}
							<li>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
									onmousedown={() => selectReferrer(r)}
								>
									<span class="font-medium">{r.full_name}</span>
									<span class="text-xs text-muted-foreground">{r.phone}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>

		<div class="space-y-1.5">
			<Label for="notes">Short note</Label>
			<Textarea id="notes" bind:value={notes} maxlength={2000} rows={3} />
		</div>

		{#if errorMsg}
			<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
				<p class="text-destructive">{errorMsg}</p>
				{#if duplicateInfo && !duplicateInfo.soft}
					<a
						class="mt-1 inline-block text-sm font-medium text-primary underline"
						href={`/contacts/${duplicateInfo.id}`}
					>
						Open existing contact
					</a>
				{:else if duplicateInfo && duplicateInfo.soft}
					<div class="mt-2">
						<Button type="button" size="sm" onclick={restoreContact} disabled={restoring}>
							{restoring ? 'Restoring…' : 'Restore this contact'}
						</Button>
					</div>
				{/if}
			</div>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" type="button" onclick={() => goto('/contacts')} disabled={saving}>
				Cancel
			</Button>
			<JetEngineButton
				type="submit"
				label="Create contact"
				loadingLabel="Saving…"
				successLabel="Created"
				state={saving ? 'loading' : 'idle'}
			/>
		</div>
	</form>
</PageWrapper>
