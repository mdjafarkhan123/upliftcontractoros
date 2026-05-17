<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { ArrowLeft, Trash2, Phone, Mail, Pencil } from '@lucide/svelte';

	let {
		full_name,
		phone,
		email,
		status,
		assignee_name,
		canEdit,
		canDelete,
		onBack,
		onEdit,
		onDelete
	}: {
		full_name: string;
		phone: string;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		canEdit: boolean;
		canDelete: boolean;
		onBack: () => void;
		onEdit: () => void;
		onDelete: () => void;
	} = $props();

	const statusVariant = $derived(
		status === 'customer' ? 'success' : status === 'archived' ? 'default' : 'info'
	);
	const statusLabel = $derived(
		status === 'customer' ? 'Customer' : status === 'archived' ? 'Archived' : 'Lead'
	);
	const initials = $derived(
		full_name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('')
	);
</script>

<header class="space-y-4">
	<div class="flex items-center justify-between gap-2">
		<button
			type="button"
			class="inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
			onclick={onBack}
		>
			<ArrowLeft class="h-4 w-4" /> Back
		</button>
		<div class="flex items-center gap-1">
			{#if canEdit}
				<Button variant="ghost" size="icon" aria-label="Edit contact" onclick={onEdit}>
					<Pencil class="h-5 w-5 text-muted-foreground" />
				</Button>
			{/if}
			{#if canDelete}
				<Button variant="ghost" size="icon" aria-label="Delete contact" onclick={onDelete}>
					<Trash2 class="h-5 w-5 text-destructive" />
				</Button>
			{/if}
		</div>
	</div>

	<div class="flex items-start gap-4">
		<div
			class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
		>
			{initials || '?'}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="truncate text-2xl font-semibold text-foreground">{full_name}</h1>
				<Badge variant={statusVariant} label={statusLabel} />
			</div>
			{#if assignee_name}
				<p class="mt-1 text-sm text-muted-foreground">Assigned to {assignee_name}</p>
			{:else}
				<p class="mt-1 text-sm italic text-muted-foreground">Unassigned</p>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
		<a
			class="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent/40"
			href={`tel:${phone}`}
		>
			<Phone class="h-4 w-4 text-muted-foreground" />
			<span class="font-medium">{formatPhoneDisplay(phone)}</span>
		</a>
		{#if email}
			<a
				class="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent/40"
				href={`mailto:${email}`}
			>
				<Mail class="h-4 w-4 text-muted-foreground" />
				<span class="truncate font-medium">{email}</span>
			</a>
		{/if}
	</div>
</header>
