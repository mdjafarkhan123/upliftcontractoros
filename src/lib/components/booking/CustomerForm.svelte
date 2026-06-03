<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import Loader2 from '@lucide/svelte/icons/loader-2';

	type Props = {
		submitting: boolean;
		error: string | null;
		fieldErrors: Record<string, string>;
		onSubmit: (input: {
			customerName: string;
			customerPhone: string;
			customerEmail: string;
			notes: string;
			website: string; // honeypot
		}) => void;
	};

	let { submitting, error, fieldErrors, onSubmit }: Props = $props();

	let customerName = $state('');
	let customerPhone = $state('');
	let customerEmail = $state('');
	let notes = $state('');
	let website = $state(''); // honeypot — must stay empty

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		onSubmit({
			customerName: customerName.trim(),
			customerPhone: customerPhone.trim(),
			customerEmail: customerEmail.trim(),
			notes: notes.trim(),
			website
		});
	}

	const inputBase =
		'block w-full min-h-[48px] rounded-xl border bg-card px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 ease-out focus:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60';
</script>

<form onsubmit={handleSubmit} class="space-y-4" novalidate>
	<!-- Honeypot — visually hidden, never label it, never reference it on screen -->
	<div aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
		<label>
			Website
			<input type="text" tabindex="-1" autocomplete="off" name="website" bind:value={website} />
		</label>
	</div>

	<div>
		<label for="bk-name" class="mb-1.5 block text-xs font-medium text-muted-foreground">
			Full name <span class="text-destructive">*</span>
		</label>
		<input
			id="bk-name"
			type="text"
			required
			autocomplete="name"
			placeholder="Jane Doe"
			bind:value={customerName}
			disabled={submitting}
			class={cn(inputBase, fieldErrors.customerName ? 'border-destructive/60' : 'border-border/60')}
		/>
		{#if fieldErrors.customerName}
			<p class="mt-1.5 text-xs text-destructive">{fieldErrors.customerName}</p>
		{/if}
	</div>

	<div>
		<label for="bk-phone" class="mb-1.5 block text-xs font-medium text-muted-foreground">
			Phone number <span class="text-destructive">*</span>
		</label>
		<input
			id="bk-phone"
			type="tel"
			required
			inputmode="tel"
			autocomplete="tel"
			placeholder="+1 555 123 4567"
			bind:value={customerPhone}
			disabled={submitting}
			class={cn(
				inputBase,
				fieldErrors.customerPhone ? 'border-destructive/60' : 'border-border/60'
			)}
		/>
		<p class="mt-1.5 text-[11px] text-muted-foreground/70">
			Include country code (e.g. +1 for US/Canada)
		</p>
		{#if fieldErrors.customerPhone}
			<p class="mt-1.5 text-xs text-destructive">{fieldErrors.customerPhone}</p>
		{/if}
	</div>

	<div>
		<label for="bk-email" class="mb-1.5 block text-xs font-medium text-muted-foreground">
			Email <span class="text-muted-foreground/50">(optional)</span>
		</label>
		<input
			id="bk-email"
			type="email"
			autocomplete="email"
			placeholder="you@example.com"
			bind:value={customerEmail}
			disabled={submitting}
			class={cn(
				inputBase,
				fieldErrors.customerEmail ? 'border-destructive/60' : 'border-border/60'
			)}
		/>
		{#if fieldErrors.customerEmail}
			<p class="mt-1.5 text-xs text-destructive">{fieldErrors.customerEmail}</p>
		{/if}
	</div>

	<div>
		<label for="bk-notes" class="mb-1.5 block text-xs font-medium text-muted-foreground">
			Anything we should know? <span class="text-muted-foreground/50">(optional)</span>
		</label>
		<textarea
			id="bk-notes"
			rows="3"
			placeholder="Brief description of what you need…"
			bind:value={notes}
			disabled={submitting}
			class={cn(inputBase, 'resize-none border-border/60')}
		></textarea>
	</div>

	{#if error}
		<div
			class="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{error}
		</div>
	{/if}

	<button
		type="submit"
		disabled={submitting}
		class="group relative mt-2 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--primary-deep))] px-6 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--brand-primary)/0.7),inset_0_1px_0_hsl(0_0%_100%/0.15)] ring-1 ring-[hsl(var(--primary-edge))] transition-all duration-150 ease-out hover:shadow-[0_14px_40px_-10px_hsl(var(--brand-primary)/0.85),inset_0_1px_0_hsl(0_0%_100%/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-70"
	>
		{#if submitting}
			<Loader2 class="h-4 w-4 animate-spin" />
			<span>Booking…</span>
		{:else}
			<span>Book Appointment</span>
		{/if}
	</button>
</form>
