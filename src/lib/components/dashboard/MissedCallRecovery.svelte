<script lang="ts">
	import type { DashboardMissedCallRecovery } from '$lib/types/dashboard';
	import { PhoneMissed, PhoneIncoming } from '@lucide/svelte';

	let { stats }: { stats: DashboardMissedCallRecovery } = $props();

	const rate = $derived(
		stats.missed_count > 0 ? Math.round((stats.recovered_count / stats.missed_count) * 100) : null
	);
</script>

<section
	class="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card dark:border-white/10"
>
	<header
		class="flex items-center justify-between border-b border-border/70 bg-card-raised/35 px-5 py-4"
	>
		<h2 class="text-base font-semibold tracking-tight text-foreground">Missed-call recovery</h2>
		<span class="text-xs font-medium text-muted-foreground">This month</span>
	</header>

	{#if stats.missed_count === 0}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-8 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<PhoneIncoming class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">No missed calls this month</p>
			<p class="text-xs text-muted-foreground">Every call got through. Nice.</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 divide-x divide-border/60">
			<div class="flex flex-col gap-1 px-5 py-5">
				<span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<PhoneMissed class="h-3.5 w-3.5 text-rose-500" />
					Missed calls
				</span>
				<span class="text-3xl font-semibold leading-none tracking-tight text-foreground">
					{stats.missed_count}
				</span>
			</div>
			<div class="flex flex-col gap-1 px-5 py-5">
				<span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<PhoneIncoming class="h-3.5 w-3.5 text-emerald-500" />
					Recovered
				</span>
				<span class="flex items-baseline gap-2">
					<span class="text-3xl font-semibold leading-none tracking-tight text-foreground">
						{rate}%
					</span>
					<span class="text-xs text-muted-foreground">
						{stats.recovered_count} of {stats.missed_count}
					</span>
				</span>
			</div>
		</div>
	{/if}
</section>
