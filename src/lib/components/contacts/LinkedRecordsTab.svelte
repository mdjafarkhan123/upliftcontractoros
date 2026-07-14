<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';

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

	type Row = { label: string; href: string; count: number; icon: string };

	const rows: Row[] = $derived([
		{
			label: 'Opportunities',
			href: `/pipeline?contact=${contactId}`,
			count: counts.opportunities,
			icon: 'ri-git-branch-line'
		},
		{ label: 'Jobs', href: `/jobs?contact_id=${contactId}`, count: counts.jobs, icon: 'ri-briefcase-line' },
		{ label: 'Quotes', href: `/quotes?contact=${contactId}`, count: counts.quotes, icon: 'ri-file-text-line' },
		{ label: 'Invoices', href: `/invoices?contact=${contactId}`, count: counts.invoices, icon: 'ri-receipt-line' },
		{
			label: 'Conversations',
			href: `/inbox?contact=${contactId}`,
			count: counts.conversations,
			icon: 'ri-message-2-line'
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

<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.5rem;">
	{#each rows as row (row.label)}
		<li>
			<a href={row.href} class="contact-linked__row">
				<span class="contact-linked__label">
					<i class={row.icon} aria-hidden="true"></i>
					{row.label}
				</span>
				<span class="contact-linked__right">
					<span class="contact-linked__count {row.count > 0 ? 'contact-linked__count--active' : ''}">
						{row.count}
					</span>
					{#if row.count > 0}
						<i class="ri-arrow-right-s-line contact-linked__chevron" aria-hidden="true"></i>
					{/if}
				</span>
			</a>
		</li>
	{/each}
</ul>

{#if referralCount > 0}
	<div style="margin-top:1rem; border:1px solid var(--color-border); border-radius:var(--radius-lg, 12px); overflow:hidden;">
		<button
			type="button"
			class="contact-linked__row"
			style="width:100%; border:none; background:transparent; cursor:pointer;"
			onclick={toggleReferrals}
		>
			<span class="contact-linked__label">
				<i class="ri-user-add-line" aria-hidden="true"></i>
				Referrals
			</span>
			<span class="contact-linked__right">
				<span class="contact-linked__count contact-linked__count--active">{referralCount}</span>
				<i
					class="ri-arrow-down-s-line contact-linked__chevron"
					aria-hidden="true"
					style="transition:transform 0.2s; transform:{referralsOpen ? 'rotate(180deg)' : 'none'}"
				></i>
			</span>
		</button>
		{#if referralsOpen}
			<div style="border-top:1px solid var(--color-border); padding:0.75rem 1rem;">
				{#if referralsLoading}
					<p class="contact-linked__note">Loading…</p>
				{:else if referrals.length === 0}
					<p class="contact-linked__note">No referrals found.</p>
				{:else}
					<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.5rem;">
						{#each referrals as ref (ref.id)}
							<li>
								<a
									href={`/contacts/${ref.id}`}
									style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem; border-radius:0.5rem; text-decoration:none; transition:background-color 0.15s;"
									onmouseenter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface-sunk)')}
									onmouseleave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
								>
									<div>
										<p class="contact-linked__ref-name">{ref.full_name}</p>
										<p class="contact-linked__ref-phone">{formatPhoneDisplay(ref.phone)}</p>
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

<p class="contact-linked__hint">
	Linked records are read-only here for now. Open each module to manage them.
</p>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-linked {
		&__note {
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}
		&__ref-name {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}
		&__ref-phone {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}
		&__hint {
			margin-top: $space-3;
			font-size: $fs-caption;
			color: var(--color-text-muted);
		}
	}
</style>
