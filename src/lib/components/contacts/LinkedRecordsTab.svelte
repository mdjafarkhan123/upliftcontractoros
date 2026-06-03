<script lang="ts">
	import {
		GitBranch,
		Briefcase,
		FileText,
		Receipt,
		MessageSquare,
		ChevronRight,
		ChevronDown,
		UserPlus
	} from '@lucide/svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import type { Component } from 'svelte';

	type Counts = {
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	};

	let {
		contactId,
		counts,
		referralCount = 0
	}: { contactId: string; counts: Counts; referralCount?: number } = $props();

	type Row = { label: string; href: string; count: number; icon: Component };

	const rows: Row[] = $derived([
		{
			label: 'Opportunities',
			href: `/pipeline?contact=${contactId}`,
			count: counts.opportunities,
			icon: GitBranch
		},
		{ label: 'Jobs', href: `/jobs?contact_id=${contactId}`, count: counts.jobs, icon: Briefcase },
		{ label: 'Quotes', href: `/quotes?contact=${contactId}`, count: counts.quotes, icon: FileText },
		{
			label: 'Invoices',
			href: `/invoices?contact=${contactId}`,
			count: counts.invoices,
			icon: Receipt
		},
		{
			label: 'Conversations',
			href: `/inbox?contact=${contactId}`,
			count: counts.conversations,
			icon: MessageSquare
		}
	]);

	type Referral = {
		id: string;
		full_name: string;
		phone: string;
		status: string;
		created_at: string;
	};
	let referralsOpen = $state(false);
	let referrals = $state<Referral[]>([]);
	let referralsLoading = $state(false);
	let referralsLoaded = $state(false);

	async function toggleReferrals() {
		referralsOpen = !referralsOpen;
		if (referralsOpen && !referralsLoaded) {
			referralsLoading = true;
			try {
				const res = await fetch(`/api/contacts/${contactId}/referrals`);
				if (res.ok) {
					const body = await res.json();
					referrals = body.referrals;
				}
			} finally {
				referralsLoading = false;
				referralsLoaded = true;
			}
		}
	}
</script>

<ul class="space-y-2">
	{#each rows as row (row.label)}
		<li>
			<a
				href={row.href}
				class="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"
					>
						<row.icon class="h-4 w-4" />
					</div>
					<div>
						<p class="text-sm font-medium text-foreground">{row.label}</p>
						<p class="text-xs text-muted-foreground">
							{row.count}
							{row.count === 1 ? 'record' : 'records'}
						</p>
					</div>
				</div>
				<ChevronRight class="h-4 w-4 text-muted-foreground" />
			</a>
		</li>
	{/each}
</ul>

{#if referralCount > 0}
	<div class="mt-4 rounded-xl border border-border bg-card">
		<button
			type="button"
			class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
			onclick={toggleReferrals}
		>
			<div class="flex items-center gap-3">
				<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<UserPlus class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-medium text-foreground">Referrals</p>
					<p class="text-xs text-muted-foreground">
						{referralCount}
						{referralCount === 1 ? 'person' : 'people'} referred
					</p>
				</div>
			</div>
			<ChevronDown
				class="h-4 w-4 text-muted-foreground transition-transform {referralsOpen
					? 'rotate-180'
					: ''}"
			/>
		</button>
		{#if referralsOpen}
			<div class="border-t border-border px-4 py-3">
				{#if referralsLoading}
					<p class="text-sm text-muted-foreground">Loading…</p>
				{:else if referrals.length === 0}
					<p class="text-sm text-muted-foreground">No referrals found.</p>
				{:else}
					<ul class="space-y-2">
						{#each referrals as ref (ref.id)}
							<li>
								<a
									href={`/contacts/${ref.id}`}
									class="flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-accent/40"
								>
									<div>
										<p class="text-sm font-medium text-foreground">{ref.full_name}</p>
										<p class="text-xs text-muted-foreground">{formatPhoneDisplay(ref.phone)}</p>
									</div>
									<Badge
										variant={ref.status === 'customer'
											? 'success'
											: ref.status === 'archived'
												? 'warning'
												: 'info'}
										label={ref.status === 'customer'
											? 'Customer'
											: ref.status === 'archived'
												? 'Archived'
												: 'Lead'}
									/>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<p class="mt-3 text-xs text-muted-foreground">
	Linked records are read-only here for now. Open each module to manage them.
</p>
