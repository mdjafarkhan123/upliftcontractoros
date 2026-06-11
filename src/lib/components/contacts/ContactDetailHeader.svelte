<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import ContactAvatar from './ContactAvatar.svelte';
	import ContactAvatarUploader from './ContactAvatarUploader.svelte';
	import { cn } from '$lib/utils/cn';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { TEMPERATURE_META, type LeadTemperature } from '$lib/contacts/temperature';
	import { PHONE_LABEL_DISPLAY, type PhoneLabel } from '$lib/contacts/phoneLabel';
	import {
		ArrowLeft,
		Trash2,
		Phone,
		Mail,
		Pencil,
		UserPlus,
		Merge,
		Flame,
		Ban,
		Archive,
		ArchiveRestore
	} from '@lucide/svelte';

	let {
		contact_id,
		full_name,
		company_name = null,
		avatar_url = null,
		phone,
		alt_phone = null,
		alt_phone_label = null,
		email,
		status,
		assignee_name,
		referrer,
		lead_temperature = null,
		next_follow_up_at = null,
		do_not_contact = false,
		canEdit,
		canDelete,
		canMerge = false,
		archiveBusy = false,
		onBack,
		onEdit,
		onDelete,
		onMerge,
		onArchive,
		onUnarchive,
		onAvatarChange
	}: {
		contact_id: string;
		full_name: string;
		company_name?: string | null;
		avatar_url?: string | null;
		phone: string | null;
		alt_phone?: string | null;
		alt_phone_label?: PhoneLabel | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		referrer?: { id: string; name: string } | null;
		lead_temperature?: LeadTemperature | null;
		next_follow_up_at?: string | null;
		do_not_contact?: boolean;
		canEdit: boolean;
		canDelete: boolean;
		canMerge?: boolean;
		archiveBusy?: boolean;
		onBack: () => void;
		onEdit: () => void;
		onDelete: () => void;
		onMerge?: () => void;
		onArchive?: () => void;
		onUnarchive?: () => void;
		onAvatarChange?: (result: { avatar_url: string | null; updated_at: string }) => void;
	} = $props();

	const statusVariant = $derived(
		status === 'customer' ? 'success' : status === 'archived' ? 'warning' : 'info'
	);
	const statusLabel = $derived(
		status === 'customer' ? 'Customer' : status === 'archived' ? 'Archived' : 'Lead'
	);
	const isDue = $derived(
		next_follow_up_at !== null && new Date(next_follow_up_at).getTime() <= Date.now()
	);
	const temp = $derived(lead_temperature ? TEMPERATURE_META[lead_temperature] : null);
</script>

<header class="space-y-4">
	<!-- Top bar: back + actions -->
	<div class="flex items-center justify-between gap-2">
		<button
			type="button"
			class="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
			onclick={onBack}
		>
			<ArrowLeft class="h-4 w-4" />
			<span>Back</span>
		</button>

		<div class="flex items-center gap-0.5">
			{#if canEdit}
				<Button
					variant="ghost"
					size="icon"
					class="h-9 w-9 text-muted-foreground hover:text-foreground"
					aria-label="Edit contact"
					onclick={onEdit}
				>
					<Pencil class="h-4 w-4" />
				</Button>
			{/if}
			{#if canMerge}
				<Button
					variant="ghost"
					size="icon"
					class="h-9 w-9 text-muted-foreground hover:text-foreground"
					aria-label="Merge duplicate"
					onclick={onMerge}
				>
					<Merge class="h-4 w-4" />
				</Button>
			{/if}
			{#if canEdit && status === 'archived' && onUnarchive}
				<Button
					variant="ghost"
					size="icon"
					class="h-9 w-9 text-muted-foreground hover:text-foreground"
					aria-label="Unarchive contact"
					disabled={archiveBusy}
					onclick={onUnarchive}
				>
					<ArchiveRestore class="h-4 w-4" />
				</Button>
			{:else if canEdit && status !== 'archived' && onArchive}
				<Button
					variant="ghost"
					size="icon"
					class="h-9 w-9 text-muted-foreground hover:text-foreground"
					aria-label="Archive contact"
					disabled={archiveBusy}
					onclick={onArchive}
				>
					<Archive class="h-4 w-4" />
				</Button>
			{/if}
			{#if canDelete}
				<Button
					variant="ghost"
					size="icon"
					class="h-9 w-9 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
					aria-label="Delete contact"
					onclick={onDelete}
				>
					<Trash2 class="h-4 w-4" />
				</Button>
			{/if}
		</div>
	</div>

	<!-- Identity block -->
	<div class="flex items-start gap-4">
		<!-- Avatar with status ring — click to change when editable (GHL-style) -->
		{#if canEdit && onAvatarChange}
			<ContactAvatarUploader
				contactId={contact_id}
				name={full_name}
				src={avatar_url}
				{status}
				class="h-16 w-16 text-xl"
				onChange={onAvatarChange}
			/>
		{:else}
			<ContactAvatar name={full_name} src={avatar_url} {status} class="h-16 w-16 text-xl ring-2" />
		{/if}

		<div class="min-w-0 flex-1 pt-0.5">
			<!-- Name + badges -->
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">{full_name}</h1>
				<Badge variant={statusVariant} label={statusLabel} />
				{#if temp}
					<span
						class={cn(
							'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
							temp.badge
						)}
					>
						<span class={cn('h-1.5 w-1.5 rounded-full', temp.dot)}></span>
						{temp.label}
					</span>
				{/if}
				{#if do_not_contact}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-xs font-semibold text-destructive"
					>
						<Ban class="h-3 w-3" />
						Do Not Contact
					</span>
				{/if}
				{#if isDue}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400"
					>
						<Flame class="h-3 w-3" />
						Due
					</span>
				{/if}
			</div>
			{#if company_name}
				<p class="mt-0.5 truncate text-sm font-medium text-muted-foreground">{company_name}</p>
			{/if}

			<!-- Assignee + referrer row -->
			<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
				{#if assignee_name}
					<p class="text-sm text-muted-foreground">
						<span class="text-muted-foreground/60">Assigned to</span>
						<span class="font-medium text-foreground">{assignee_name}</span>
					</p>
				{:else}
					<p class="text-sm italic text-muted-foreground">Unassigned</p>
				{/if}
				{#if referrer}
					<a
						href={`/contacts/${referrer.id}`}
						class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
					>
						<UserPlus class="h-3.5 w-3.5" />
						Ref: {referrer.name}
					</a>
				{/if}
			</div>
		</div>
	</div>

	<!-- Contact pills -->
	<div class="flex flex-wrap gap-2">
		{#if phone}
			<a
				class="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm"
				href={`tel:${phone}`}
			>
				<Phone class="h-3.5 w-3.5 text-muted-foreground" />
				{formatPhoneDisplay(phone)}
			</a>
		{/if}
		{#if alt_phone}
			<a
				class="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm"
				href={`tel:${alt_phone}`}
			>
				<Phone class="h-3.5 w-3.5 text-muted-foreground" />
				{formatPhoneDisplay(alt_phone)}
				<span class="text-xs text-muted-foreground"
					>({alt_phone_label ? PHONE_LABEL_DISPLAY[alt_phone_label] : 'alt'})</span
				>
			</a>
		{/if}
		{#if email}
			<a
				class="inline-flex min-h-[40px] max-w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm"
				href={`mailto:${email}`}
			>
				<Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<span class="truncate">{email}</span>
			</a>
		{:else if !phone}
			<div
				class="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-dashed border-border/60 bg-card px-3 py-1.5 text-sm text-muted-foreground"
			>
				<Mail class="h-3.5 w-3.5" />
				No contact info
			</div>
		{/if}
	</div>
</header>
