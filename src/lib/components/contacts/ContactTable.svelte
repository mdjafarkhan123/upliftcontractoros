<script lang="ts">
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils/cn';
	import type { ContactListItem } from '$lib/stores/contacts.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import ContactAvatar from './ContactAvatar.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatRelativeShort } from '$lib/utils/format';
	import { formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { TEMPERATURE_META } from '$lib/contacts/temperature';
	import { Check, MoreHorizontal } from '@lucide/svelte';

	let {
		items,
		selectable = false,
		selected,
		onToggleSelect,
		onToggleAll,
		allSelected = false
	}: {
		items: ContactListItem[];
		selectable?: boolean;
		selected?: Set<string>;
		onToggleSelect?: (id: string) => void;
		onToggleAll?: () => void;
		allSelected?: boolean;
	} = $props();

	function statusVariant(s: ContactListItem['status']) {
		return s === 'customer' ? 'success' : s === 'archived' ? 'warning' : 'info';
	}
	function statusLabel(s: ContactListItem['status']) {
		return s === 'customer' ? 'Customer' : s === 'archived' ? 'Archived' : 'Lead';
	}
</script>

<div class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[640px] text-sm">
			<thead>
				<tr class="border-b border-border/60 bg-muted/30">
					{#if selectable}
						<th class="w-11 px-4 py-3">
							<button
								type="button"
								onclick={onToggleAll}
								aria-label="Select all contacts"
								class={cn(
									'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded border-2 transition-colors',
									allSelected
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-background hover:border-primary/60'
								)}
							>
								{#if allSelected}<Check class="h-2.5 w-2.5" />{/if}
							</button>
						</th>
					{/if}
					<th
						class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>Contact</th
					>
					<th
						class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell"
						>Email</th
					>
					<th
						class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell"
						>Phone</th
					>
					<th
						class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>Status</th
					>
					<th
						class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell"
						>Temp</th
					>
					<th
						class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell"
						>Last contacted</th
					>
					<th
						class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell"
						>Assignee</th
					>
					<th
						class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground 2xl:table-cell"
						>Tags</th
					>
					<th class="w-12 px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border/30">
				{#each items as c (c.id)}
					{@const isSelected = selected?.has(c.id) ?? false}
					{@const isArchived = c.status === 'archived'}
					{@const visibleTags = c.tags.slice(0, 2)}
					{@const extraTags = Math.max(0, c.tags.length - 2)}
					<tr
						class={cn(
							'group transition-colors',
							selectable ? 'cursor-pointer select-none hover:bg-muted/40' : 'hover:bg-muted/20',
							isSelected && 'bg-primary/5 hover:bg-primary/[0.08]',
							isArchived && 'opacity-60'
						)}
						onclick={selectable ? () => onToggleSelect?.(c.id) : undefined}
					>
						{#if selectable}
							<td class="w-11 px-4 py-4">
								<div
									class={cn(
										'mx-auto flex h-[18px] w-[18px] items-center justify-center rounded border-2 transition-colors',
										isSelected
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-border bg-background group-hover:border-primary/60'
									)}
								>
									{#if isSelected}<Check class="h-2.5 w-2.5" />{/if}
								</div>
							</td>
						{/if}

						<!-- Contact: avatar + name -->
						<td class="px-4 py-3.5">
							<div class="flex items-center gap-3">
								<ContactAvatar
									name={c.full_name}
									src={c.avatar_url}
									status={c.status}
									class="h-9 w-9 text-xs ring-1"
								/>
								<div class="min-w-0">
									{#if selectable}
										<p class="truncate font-medium leading-snug text-foreground">{c.full_name}</p>
									{:else}
										<a
											href="/contacts/{c.id}"
											onclick={(e) => e.stopPropagation()}
											class="block truncate font-medium leading-snug text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
										>
											{c.full_name}
										</a>
									{/if}
									{#if c.company_name}
										<p class="truncate text-[11px] font-medium text-muted-foreground">
											{c.company_name}
										</p>
									{/if}
									{#if c.sms_opt_out}
										<p class="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
											SMS opted out
										</p>
									{/if}
								</div>
							</div>
						</td>

						<!-- Email -->
						<td class="hidden px-4 py-3.5 xl:table-cell">
							<span class="block max-w-[200px] truncate text-muted-foreground">
								{c.email ?? '—'}
							</span>
						</td>

						<!-- Phone -->
						<td class="hidden px-4 py-3.5 lg:table-cell">
							<span class="whitespace-nowrap text-muted-foreground">
								{c.phone ? formatPhoneDisplay(c.phone) : '—'}
							</span>
						</td>

						<!-- Status -->
						<td class="px-4 py-3.5">
							<Badge variant={statusVariant(c.status)} label={statusLabel(c.status)} />
						</td>

						<!-- Temperature -->
						<td class="hidden px-4 py-3.5 lg:table-cell">
							{#if c.lead_temperature}
								{@const meta = TEMPERATURE_META[c.lead_temperature]}
								<span
									class={cn(
										'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
										meta.badge
									)}
								>
									<span class={cn('h-1.5 w-1.5 rounded-full', meta.dot)}></span>
									{meta.label}
								</span>
							{:else}
								<span class="text-xs text-muted-foreground/30">—</span>
							{/if}
						</td>

						<!-- Last contacted -->
						<td class="hidden whitespace-nowrap px-4 py-3.5 xl:table-cell">
							{#if c.last_contacted_at}
								<span class="text-muted-foreground">{formatRelativeShort(c.last_contacted_at)}</span
								>
							{:else}
								<span class="italic text-muted-foreground/40">Never</span>
							{/if}
						</td>

						<!-- Assignee -->
						<td class="hidden px-4 py-3.5 xl:table-cell">
							{#if c.assignee_name}
								<span class="text-muted-foreground">{c.assignee_name}</span>
							{:else}
								<span class="italic text-muted-foreground/40">Unassigned</span>
							{/if}
						</td>

						<!-- Tags -->
						<td class="hidden px-4 py-3.5 2xl:table-cell">
							{#if visibleTags.length > 0}
								<div class="flex flex-wrap items-center gap-1.5">
									{#each visibleTags as t (t)}
										<span
											class={cn(
												'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
												isDestructiveTag(t)
													? 'border-destructive/30 bg-destructive/5 text-destructive'
													: 'border-border bg-muted/50 text-muted-foreground'
											)}
										>
											{formatTagLabel(t)}
										</span>
									{/each}
									{#if extraTags > 0}
										<span
											class="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
											>+{extraTags}</span
										>
									{/if}
								</div>
							{:else}
								<span class="text-xs text-muted-foreground/30">—</span>
							{/if}
						</td>

						<!-- Actions -->
						<td class="w-12 px-2 py-3.5" onclick={(e) => e.stopPropagation()}>
							{#if !selectable}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger
										class={cn(
											'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
											'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
										)}
										aria-label="Actions for {c.full_name}"
									>
										<MoreHorizontal class="h-4 w-4" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onclick={() => goto(`/contacts/${c.id}`)}>
											View contact
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => goto(`/contacts/${c.id}/edit`)}>
											Edit contact
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
