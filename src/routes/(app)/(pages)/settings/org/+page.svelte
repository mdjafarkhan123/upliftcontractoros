<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import OrgLogoUploader from '$lib/components/settings/OrgLogoUploader.svelte';
	import TimezoneCombobox from '$lib/components/shared/TimezoneCombobox.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Popover from '$lib/components/ui/popover';
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { cn } from '$lib/utils/cn';

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
		google_review_link: string | null;
		calendar_day_start_hour: number;
		calendar_day_end_hour: number;
		quiet_hours_enabled: boolean;
		quiet_hours_start_hour: number;
		quiet_hours_end_hour: number;
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
		google_review_link: string;
		calendar_day_start_hour: number;
		calendar_day_end_hour: number;
		quiet_hours_enabled: boolean;
		quiet_hours_start_hour: number;
		quiet_hours_end_hour: number;
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
			google_review_link: d.google_review_link ?? '',
			calendar_day_start_hour: d.calendar_day_start_hour,
			calendar_day_end_hour: d.calendar_day_end_hour,
			quiet_hours_enabled: d.quiet_hours_enabled,
			quiet_hours_start_hour: d.quiet_hours_start_hour,
			quiet_hours_end_hour: d.quiet_hours_end_hour
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
				'google_review_link'
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
					<TimezoneCombobox
						id="timezone"
						bind:value={form.timezone}
						invalid={Boolean(fieldErrors.timezone)}
					/>
					{#if fieldErrors.timezone}
						<p class="text-xs text-destructive">{fieldErrors.timezone}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Used for booking links, reminders, and all date formatting.
						</p>
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

			<section class="grid gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1.5 md:col-span-2">
					<Label for="google_review_link">Google Business Profile review link</Label>
					<Input
						id="google_review_link"
						type="url"
						bind:value={form.google_review_link}
						placeholder="https://g.page/r/..."
						maxlength={500}
					/>
					{#if fieldErrors.google_review_link}
						<p class="text-xs text-destructive">{fieldErrors.google_review_link}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Used in review-request messages as the <code class="text-[11px]"
								>{'{review_link}'}</code
							>
							variable. Find this in your Google Business Profile under "Get more reviews".
						</p>
					{/if}
				</div>
			</section>

			<section class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Calendar visible hours</h3>
					<p class="text-xs text-muted-foreground">
						Sets the time range shown on your Appointments calendar. Bookings outside this range
						still appear — off-hours are just dimmed.
					</p>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="calendar_day_start_hour">Day starts</Label>
						<select
							id="calendar_day_start_hour"
							class="h-11 rounded-lg border border-input bg-background px-3 text-sm"
							bind:value={form.calendar_day_start_hour}
						>
							{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						{#if fieldErrors.calendar_day_start_hour}
							<p class="text-xs text-destructive">{fieldErrors.calendar_day_start_hour}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="calendar_day_end_hour">Day ends</Label>
						<select
							id="calendar_day_end_hour"
							class="h-11 rounded-lg border border-input bg-background px-3 text-sm"
							bind:value={form.calendar_day_end_hour}
						>
							{#each HOUR_OPTIONS.slice(1) as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						{#if fieldErrors.calendar_day_end_hour}
							<p class="text-xs text-destructive">{fieldErrors.calendar_day_end_hour}</p>
						{/if}
					</div>
				</div>
			</section>

			<section class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h3 class="text-sm font-semibold text-foreground">SMS quiet hours</h3>
						<p class="text-xs text-muted-foreground">
							Outbound texts are held during these hours and sent automatically once the window
							reopens — they're never lost. Evaluated in your business timezone.
						</p>
					</div>
					<label class="flex shrink-0 items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="h-4 w-4 rounded border-input accent-primary"
							bind:checked={form.quiet_hours_enabled}
						/>
						<span class="text-muted-foreground">Enabled</span>
					</label>
				</div>
				<div class={cn('grid grid-cols-2 gap-3', !form.quiet_hours_enabled && 'opacity-50')}>
					<div class="flex flex-col gap-1.5">
						<Label for="quiet_hours_start_hour">Quiet from</Label>
						<select
							id="quiet_hours_start_hour"
							class="h-11 rounded-lg border border-input bg-background px-3 text-sm disabled:cursor-not-allowed"
							bind:value={form.quiet_hours_start_hour}
							disabled={!form.quiet_hours_enabled}
						>
							{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						{#if fieldErrors.quiet_hours_start_hour}
							<p class="text-xs text-destructive">{fieldErrors.quiet_hours_start_hour}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="quiet_hours_end_hour">Quiet until</Label>
						<select
							id="quiet_hours_end_hour"
							class="h-11 rounded-lg border border-input bg-background px-3 text-sm disabled:cursor-not-allowed"
							bind:value={form.quiet_hours_end_hour}
							disabled={!form.quiet_hours_enabled}
						>
							{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						{#if fieldErrors.quiet_hours_end_hour}
							<p class="text-xs text-destructive">{fieldErrors.quiet_hours_end_hour}</p>
						{/if}
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
						<Popover.Root>
							<Popover.Trigger
								type="button"
								aria-label="Open color picker"
								class={cn(
									'h-9 w-9 overflow-hidden rounded-md border border-border transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
								)}
								style={`background-color: ${form.primary_color || 'transparent'}`}
							>
								{#if !form.primary_color}
									<span
										class="block h-full w-full bg-gradient-to-br from-rose-400 via-amber-300 to-sky-400 opacity-60"
									></span>
								{/if}
							</Popover.Trigger>
							<Popover.Content class="w-64 p-3">
								<div class="grid grid-cols-5 gap-2">
									{#each SWATCHES as swatch (swatch)}
										<button
											type="button"
											aria-label={swatch}
											class={cn(
												'h-8 w-8 rounded-md border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-popover',
												form.primary_color?.toLowerCase() === swatch
													? 'border-foreground ring-2 ring-ring'
													: 'border-border'
											)}
											style:background-color={swatch}
											onclick={() => form && (form.primary_color = swatch)}
										></button>
									{/each}
								</div>
								<div class="mt-3 flex items-center gap-2 border-t border-border pt-3">
									<label
										class="relative h-8 w-8 cursor-pointer overflow-hidden rounded-md border border-border"
										aria-label="Pick a custom color"
									>
										<input
											type="color"
											class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
											value={form.primary_color || '#3b82f6'}
											oninput={(e) => {
												if (form) form.primary_color = (e.currentTarget as HTMLInputElement).value;
											}}
										/>
										<span
											class="block h-full w-full"
											style:background-color={form.primary_color || '#3b82f6'}
										></span>
									</label>
									<span class="text-xs text-muted-foreground">Custom hex</span>
									{#if form.primary_color}
										<button
											type="button"
											class="ml-auto text-xs text-muted-foreground hover:text-foreground"
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
						<p class="text-xs text-destructive">{fieldErrors.primary_color}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Brand color applies to customer-facing experiences such as invoices, quotes,
							reminders, portals, and public-facing assets. It does not change the CRM interface
							theme.
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label>Logo</Label>
					<OrgLogoUploader currentLogoUrl={logoUrl} onChange={(next) => (logoUrl = next)} />
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
