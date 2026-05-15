<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import OrgLogoUploader from '$lib/components/settings/OrgLogoUploader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/stores/toast.svelte';
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
		logo_url: string | null;
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
			primary_color: d.primary_color ?? ''
		};
	}

	const member = getMemberContext();
	let m = $derived(member());

	let original = $state<OrgForm | null>(null);
	let form = $state<OrgForm | null>(null);
	let logoUrl = $state<string | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	let dirty = $derived(
		original !== null &&
			form !== null &&
			JSON.stringify(original) !== JSON.stringify(form)
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
				'primary_color'
			]);
			const payload: Record<string, unknown> = {};
			for (const k of Object.keys(form) as (keyof OrgForm)[]) {
				if (form[k] !== original[k]) {
					const v = form[k];
					payload[k] = nullableKeys.has(k) && v === '' ? null : v;
				}
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

<PageWrapper title="Organization" subtitle="Business details and branding">
	{#if loading || !form}
		<SkeletonLoader lines={8} label="Loading organization settings" />
	{:else}
		<form
			class="flex flex-col gap-6"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<section class="grid gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<Label for="name">Business name <span class="text-destructive">*</span></Label>
					<Input id="name" bind:value={form.name} required maxlength={200} />
					{#if fieldErrors.name}
						<p class="text-xs text-destructive">{fieldErrors.name}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="trade_type">Trade <span class="text-destructive">*</span></Label>
					<Input id="trade_type" bind:value={form.trade_type} required maxlength={100} />
					{#if fieldErrors.trade_type}
						<p class="text-xs text-destructive">{fieldErrors.trade_type}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5 md:col-span-2">
					<Label for="timezone">Timezone <span class="text-destructive">*</span></Label>
					<Input id="timezone" bind:value={form.timezone} placeholder="America/Chicago" required />
					{#if fieldErrors.timezone}
						<p class="text-xs text-destructive">{fieldErrors.timezone}</p>
					{:else}
						<p class="text-xs text-muted-foreground">IANA timezone, e.g. America/Chicago.</p>
					{/if}
				</div>
			</section>

			<section class="grid gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1.5 md:col-span-2">
					<Label for="address">Address</Label>
					<Input id="address" bind:value={form.address} maxlength={500} />
					{#if fieldErrors.address}
						<p class="text-xs text-destructive">{fieldErrors.address}</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="city">City</Label>
					<Input id="city" bind:value={form.city} maxlength={100} />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="state">State</Label>
						<Input id="state" bind:value={form.state} maxlength={100} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="zip">Zip</Label>
						<Input id="zip" bind:value={form.zip} maxlength={20} />
					</div>
				</div>
			</section>

			<section class="grid gap-6 md:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<Label for="primary_color">Brand color</Label>
					<div class="flex items-center gap-2">
						<Input
							id="primary_color"
							bind:value={form.primary_color}
							placeholder="#3b82f6"
							maxlength={7}
							class="font-mono"
						/>
						{#if form.primary_color}
							<div
								class="h-9 w-9 rounded-md border border-border"
								style:background-color={form.primary_color}
								aria-hidden="true"
							></div>
						{/if}
					</div>
					{#if fieldErrors.primary_color}
						<p class="text-xs text-destructive">{fieldErrors.primary_color}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Brand color applies to customer-facing experiences such as invoices, quotes,
							reminders, portals, and public-facing assets. It does not change the CRM
							interface theme.
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label>Logo</Label>
					<OrgLogoUploader
						currentLogoUrl={logoUrl}
						onChange={(next) => (logoUrl = next)}
					/>
				</div>
			</section>

			<footer class="flex items-center justify-end gap-2 border-t border-border pt-4">
				<Button
					variant="outline"
					type="button"
					disabled={saving || !dirty}
					onclick={() => {
						if (original) form = { ...original };
						fieldErrors = {};
					}}
				>
					Reset
				</Button>
				<Button type="submit" disabled={saving || !dirty}>
					{saving ? 'Saving…' : 'Save changes'}
				</Button>
			</footer>
		</form>
	{/if}
</PageWrapper>
