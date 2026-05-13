<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	$effect(() => {
		if (!member().can_create_contacts) goto('/contacts');
	});

	let full_name = $state('');
	let phone = $state('');
	let email = $state('');
	let lead_source = $state<'website_form' | 'live_chat' | 'missed_call' | 'manual' | 'referral' | 'other'>('manual');
	let assigned_to = $state<string>('');
	let notes = $state('');

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let duplicateInfo = $state<{ id: string; soft: boolean } | null>(null);

	let assignees = $state<Array<{ id: string; full_name: string }>>([]);

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
					? 'This phone is reserved by a deleted contact. An Admin can release it.'
					: 'This phone is already used by another contact.';
				return;
			}

			errorMsg = body.error ?? 'Failed to create contact.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New contact</title></svelte:head>

<PageWrapper title="New contact" subtitle="Add a new lead or customer">
	<form class="grid max-w-2xl gap-4" onsubmit={save}>
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
			<select
				id="lead_source"
				class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				bind:value={lead_source}
			>
				<option value="manual">Manual</option>
				<option value="website_form">Website form</option>
				<option value="live_chat">Live chat</option>
				<option value="missed_call">Missed call</option>
				<option value="referral">Referral</option>
				<option value="other">Other</option>
			</select>
		</div>

		<div class="space-y-1.5">
			<Label for="assigned_to">Assigned to</Label>
			<select
				id="assigned_to"
				class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				bind:value={assigned_to}
			>
				<option value="">Unassigned</option>
				{#each assignees as a (a.id)}
					<option value={a.id}>{a.full_name}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1.5">
			<Label for="notes">Short note</Label>
			<Textarea id="notes" bind:value={notes} maxlength={2000} rows={3} />
		</div>

		{#if errorMsg}
			<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
				<p class="text-destructive">{errorMsg}</p>
				{#if duplicateInfo && !duplicateInfo.soft}
					<a class="mt-1 inline-block text-sm font-medium text-primary underline" href={`/contacts/${duplicateInfo.id}`}>
						Open existing contact
					</a>
				{/if}
			</div>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" type="button" onclick={() => goto('/contacts')} disabled={saving}>
				Cancel
			</Button>
			<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create contact'}</Button>
		</div>
	</form>
</PageWrapper>
