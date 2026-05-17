<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AddressesTab from '$lib/components/contacts/AddressesTab.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { getMemberContext } from '$lib/context/member';
	import { formatDateTime } from '$lib/utils/format';
	import { ArrowLeft } from '@lucide/svelte';
	import type { ContactDetailResponse } from '../+page';

	let { data }: { data: { id: string } } = $props();

	const member = getMemberContext();

	$effect(() => {
		if (!member().can_edit_contacts) goto(`/contacts/${data.id}`);
	});

	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	let original = $state<ContactDetailResponse | null>(null);
	let addresses = $state<ContactDetailResponse['addresses']>([]);
	let recentNotes = $state<ContactDetailResponse['notes']>([]);

	let full_name = $state('');
	let phone = $state('');
	let email = $state('');
	let assigned_to = $state<string>('');
	let lead_source = $state<
		'website_form' | 'live_chat' | 'missed_call' | 'manual' | 'referral' | 'other'
	>('manual');
	let status = $state<'lead' | 'customer' | 'archived'>('lead');
	let next_follow_up_at_local = $state(''); // datetime-local string
	let preferred_contact_method = $state<
		'' | 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger'
	>('');
	let email_opt_in = $state(false);

	let assignees = $state<Array<{ id: string; full_name: string }>>([]);

	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

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

	onMount(async () => {
		try {
			const [detailRes, assigneesRes] = await Promise.all([
				fetch(`/api/contacts/${data.id}`),
				fetch('/api/contacts/assignees')
			]);

			if (detailRes.status === 404) {
				errorMsg = 'Contact not found.';
				return;
			}
			if (detailRes.status === 403) {
				errorMsg = 'You do not have access to this contact.';
				return;
			}
			if (!detailRes.ok) {
				errorMsg = 'Failed to load contact.';
				return;
			}

			const body = (await detailRes.json()) as ContactDetailResponse;
			original = body;
			addresses = body.addresses;
			recentNotes = body.notes;

			full_name = body.contact.full_name;
			phone = body.contact.phone;
			email = body.contact.email ?? '';
			assigned_to = body.contact.assigned_to ?? '';
			lead_source = body.contact.lead_source as typeof lead_source;
			status = body.contact.status;
			next_follow_up_at_local = toLocalInput(body.contact.next_follow_up_at);
			preferred_contact_method =
				(body.contact.preferred_contact_method as typeof preferred_contact_method) ?? '';
			email_opt_in = body.contact.email_opt_in;

			if (assigneesRes.ok) {
				const aBody = (await assigneesRes.json()) as {
					assignees: Array<{ id: string; full_name: string }>;
				};
				assignees = aBody.assignees;
			}
		} catch {
			errorMsg = 'Failed to load contact.';
		} finally {
			loading = false;
		}
	});

	async function save(e: Event) {
		e.preventDefault();
		if (!original || saving) return;
		saving = true;
		saveError = null;
		fieldErrors = {};

		const payload: Record<string, unknown> = {
			updated_at: original.contact.updated_at,
			full_name: full_name.trim(),
			phone: phone.trim(),
			email: email.trim() ? email.trim() : null,
			assigned_to: assigned_to || null,
			lead_source,
			status,
			next_follow_up_at: fromLocalInput(next_follow_up_at_local),
			preferred_contact_method: preferred_contact_method || null,
			email_opt_in
		};

		try {
			const res = await fetch(`/api/contacts/${original.contact.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));

			if (res.ok) {
				goto(`/contacts/${original.contact.id}`);
				return;
			}

			if (res.status === 409 && body.code === 'STALE_UPDATE') {
				saveError =
					'This contact was changed by someone else. Reload the page to see the latest version.';
				return;
			}
			if (res.status === 409 && body.code === 'PHONE_DUPLICATE') {
				fieldErrors.phone = 'A contact with this phone already exists.';
				saveError = fieldErrors.phone;
				return;
			}
			if (res.status === 422 && body.code === 'PHONE_INVALID') {
				fieldErrors.phone = body.error ?? 'Invalid phone value.';
				saveError = fieldErrors.phone;
				return;
			}
			if (res.status === 422 && body.code === 'INVALID_ASSIGNEE') {
				fieldErrors.assigned_to = body.error;
				saveError = body.error;
				return;
			}

			saveError = body.error ?? 'Failed to save contact.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Edit {original?.contact.full_name ?? 'contact'}</title></svelte:head>

<PageWrapper>
	<div class="mx-auto w-full max-w-2xl space-y-6">
		<button
			type="button"
			class="inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
			onclick={() => goto(`/contacts/${data.id}`)}
		>
			<ArrowLeft class="h-4 w-4" /> Back to contact
		</button>

		{#if loading}
			<SkeletonLoader lines={8} height="48px" label="Loading contact" />
		{:else if errorMsg || !original}
			<EmptyState title="Couldn't load contact" description={errorMsg ?? 'Unknown error.'} />
		{:else}
			<header>
				<h1 class="text-2xl font-semibold tracking-tight text-foreground">Edit contact</h1>
				<p class="mt-1 text-sm text-muted-foreground">{original.contact.full_name}</p>
			</header>

			<form class="space-y-8" onsubmit={save}>
				<!-- Identity -->
				<section class="rounded-2xl border border-border bg-card p-5">
					<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Identity
					</h2>
					<div class="grid gap-4">
						<div class="space-y-1.5">
							<Label for="full_name">
								Name <span class="text-destructive">*</span>
							</Label>
							<Input
								id="full_name"
								bind:value={full_name}
								required
								maxlength={200}
								autocomplete="name"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="phone">
								Phone <span class="text-destructive">*</span>
							</Label>
							<Input
								id="phone"
								type="tel"
								inputmode="tel"
								bind:value={phone}
								required
								autocomplete="tel"
								aria-invalid={fieldErrors.phone ? 'true' : undefined}
							/>
							{#if fieldErrors.phone}
								<p class="text-xs text-destructive">{fieldErrors.phone}</p>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="email">Email</Label>
							<Input id="email" type="email" bind:value={email} autocomplete="email" />
						</div>
					</div>
				</section>

				<!-- Assignment & status -->
				<section class="rounded-2xl border border-border bg-card p-5">
					<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Assignment & status
					</h2>
					<div class="grid gap-4 sm:grid-cols-2">
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
							{#if fieldErrors.assigned_to}
								<p class="text-xs text-destructive">{fieldErrors.assigned_to}</p>
							{/if}
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
						<div class="space-y-1.5 sm:col-span-2">
							<Label for="status">Contact status</Label>
							<select
								id="status"
								class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								bind:value={status}
							>
								<option value="lead">Lead</option>
								<option value="customer">Customer</option>
								<option value="archived">Archived</option>
							</select>
							{#if original.contact.converted_at}
								<p class="text-xs text-muted-foreground">
									Converted on {formatDateTime(original.contact.converted_at)}
								</p>
							{:else if original.contact.status === 'lead' && status === 'customer'}
								<p class="text-xs text-muted-foreground">
									Saving will mark this contact as converted.
								</p>
							{/if}
						</div>
					</div>
				</section>

				<!-- Follow-up & contact preferences -->
				<section class="rounded-2xl border border-border bg-card p-5">
					<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Follow-up & preferences
					</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-1.5">
							<Label for="next_follow_up_at">Next follow-up</Label>
							<Input
								id="next_follow_up_at"
								type="datetime-local"
								bind:value={next_follow_up_at_local}
							/>
							{#if next_follow_up_at_local}
								<button
									type="button"
									class="text-xs font-medium text-muted-foreground underline"
									onclick={() => (next_follow_up_at_local = '')}
								>
									Clear
								</button>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="preferred_contact_method">Preferred method</Label>
							<select
								id="preferred_contact_method"
								class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
						<div
							class="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 sm:col-span-2"
						>
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground">Email opt-in</p>
								<p class="text-xs text-muted-foreground">
									Independent from SMS opt-out. Controls marketing & broadcast emails only.
								</p>
							</div>
							<Switch bind:checked={email_opt_in} aria-label="Email opt-in" />
						</div>
					</div>
				</section>

				{#if saveError}
					<div
						class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
					>
						{saveError}
					</div>
				{/if}

				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						variant="outline"
						type="button"
						onclick={() => goto(`/contacts/${original!.contact.id}`)}
						disabled={saving}
					>
						Cancel
					</Button>
					<JetEngineButton
						type="submit"
						label="Save changes"
						loadingLabel="Saving…"
						successLabel="Saved"
						state={saving ? 'loading' : 'idle'}
					/>
				</div>
			</form>

			<!-- Addresses (inline) -->
			<section class="rounded-2xl border border-border bg-card p-5">
				<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					Addresses
				</h2>
				<AddressesTab contactId={original.contact.id} bind:addresses canEdit={true} />
			</section>

			<!-- Recent notes (read-only) -->
			<section class="rounded-2xl border border-border bg-card p-5">
				<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					Recent notes
				</h2>
				{#if recentNotes.length === 0}
					<p class="text-sm text-muted-foreground">No notes yet.</p>
				{:else}
					<ul class="space-y-3">
						{#each recentNotes as n (n.id)}
							<li class="rounded-xl border border-border bg-background p-3">
								<p class="whitespace-pre-wrap text-sm text-foreground">{n.content}</p>
								<p class="mt-2 text-xs text-muted-foreground">
									{n.author_name ?? 'Unknown'} · {formatDateTime(n.created_at)}
								</p>
							</li>
						{/each}
					</ul>
					<p class="mt-3 text-xs text-muted-foreground">
						Add or edit notes from the contact's Notes tab.
					</p>
				{/if}
			</section>
		{/if}
	</div>
</PageWrapper>
