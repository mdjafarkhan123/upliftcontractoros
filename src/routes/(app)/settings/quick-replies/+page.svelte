<script lang="ts">
	import { onMount } from 'svelte';
	import { Zap, Plus, Trash2, Save, X } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';
	import { toast } from '$lib/stores/toast.svelte';

	type QuickReply = {
		id: string;
		title: string;
		body: string;
		channel: 'sms' | 'email' | 'webchat' | 'any';
		sort_order: number;
	};

	const CHANNELS = ['any', 'sms', 'email', 'webchat'] as const;

	let items = $state<QuickReply[]>([]);
	let loading = $state(true);
	let creating = $state(false);

	let deleteTarget = $state<QuickReply | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	let newTitle = $state('');
	let newBody = $state('');
	let newChannel = $state<(typeof CHANNELS)[number]>('any');
	let saving = $state(false);

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/quick-replies');
			if (!res.ok) {
				toast.error('Could not load quick replies.');
				return;
			}
			const body = (await res.json()) as { data: { items: QuickReply[] } };
			items = body.data.items;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	async function create() {
		if (!newTitle.trim() || !newBody.trim() || saving) return;
		saving = true;
		try {
			const res = await fetch('/api/quick-replies', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: newTitle.trim(),
					body: newBody.trim(),
					channel: newChannel
				})
			});
			const json = (await res.json().catch(() => ({}))) as {
				data?: { quick_reply: QuickReply };
				error?: string;
			};
			if (!res.ok || !json.data) {
				toast.error('Could not create', { description: json.error });
				return;
			}
			items = [...items, json.data.quick_reply];
			newTitle = '';
			newBody = '';
			newChannel = 'any';
			creating = false;
			toast.success('Quick reply created');
		} finally {
			saving = false;
		}
	}

	async function update(id: string, patch: Partial<QuickReply>) {
		const res = await fetch(`/api/quick-replies/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		});
		if (!res.ok) {
			const json = (await res.json().catch(() => ({}))) as { error?: string };
			toast.error('Update failed', { description: json.error });
			return;
		}
		const json = (await res.json()) as { data: { quick_reply: QuickReply } };
		items = items.map((q) => (q.id === id ? json.data.quick_reply : q));
		toast.success('Saved');
	}

	async function remove(id: string) {
		deleting = true;
		try {
			const res = await fetch(`/api/quick-replies/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Delete failed');
				return;
			}
			items = items.filter((q) => q.id !== id);
			toast.success('Archived');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}
</script>

<svelte:head><title>Quick Replies — Settings</title></svelte:head>

<PageWrapper
	title="Quick Replies"
	subtitle="Saved message templates for the inbox"
	back="/settings"
>
	<div class="mx-auto flex max-w-2xl flex-col gap-4">
		<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400"
				>
					<Zap class="h-5 w-5" />
				</div>
				<div class="flex-1 text-sm text-muted-foreground">
					<p>Tokens you can use in the body:</p>
					<ul class="mt-1 list-inside list-disc">
						<li>
							<code class="rounded bg-muted px-1.5 py-0.5 text-xs">{'{contact_name}'}</code> — replaced
							with the contact's full name when sending
						</li>
						<li>
							<code class="rounded bg-muted px-1.5 py-0.5 text-xs">{'{org_name}'}</code> — replaced with
							your business name
						</li>
					</ul>
				</div>
			</div>
		</div>

		{#if loading}
			<SkeletonLoader lines={3} height="56px" label="Loading quick replies" />
		{:else}
			{#if items.length === 0 && !creating}
				<EmptyState
					icon={Zap}
					title="No quick replies yet"
					description="Save a template once, reuse it forever from the inbox composer."
					actionLabel="New quick reply"
					onAction={() => (creating = true)}
				/>
			{:else}
				<ul class="grid gap-2">
					{#each items as q (q.id)}
						<li class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<Input
										value={q.title}
										onchange={(e) => {
											const v = (e.currentTarget as HTMLInputElement).value.trim();
											if (v && v !== q.title) void update(q.id, { title: v });
										}}
										class="h-9 border-border/60 bg-background text-sm font-semibold shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
									/>
									<Textarea
										value={q.body}
										onchange={(e) => {
											const v = (e.currentTarget as HTMLTextAreaElement).value.trim();
											if (v && v !== q.body) void update(q.id, { body: v });
										}}
										rows={2}
										class="mt-2 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
									/>
									<div class="mt-2 flex items-center gap-2">
										<Select.Root
											value={q.channel}
											onValueChange={(v) => {
												if (v !== q.channel)
													void update(q.id, { channel: v as QuickReply['channel'] });
											}}
										>
											<Select.Trigger class="h-9 w-36 text-xs">
												<Select.Value />
											</Select.Trigger>
											<Select.Content>
												{#each CHANNELS as ch}
													<Select.Item value={ch}>{ch[0].toUpperCase() + ch.slice(1)}</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
									</div>
								</div>
								<button
									type="button"
									class="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label="Archive"
									onclick={() => {
										deleteTarget = q;
										deleteOpen = true;
									}}
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if creating}
				<div class="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-card">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-semibold">New quick reply</h3>
						<button
							type="button"
							class="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
							aria-label="Cancel"
							onclick={() => {
								creating = false;
								newTitle = '';
								newBody = '';
							}}
						>
							<X class="h-4 w-4" />
						</button>
					</div>
					<div class="mt-3 grid gap-2">
						<Input
							bind:value={newTitle}
							placeholder="Title (e.g. Thanks for reaching out)"
							maxlength={60}
							class="h-10 border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
						/>
						<Textarea
							bind:value={newBody}
							placeholder={'Hi {contact_name}, thanks for reaching out to {org_name}…'}
							rows={3}
							maxlength={1000}
							class="border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
						/>
						<div class="flex items-center gap-2">
							<Select.Root bind:value={newChannel}>
								<Select.Trigger class="h-9 w-36 text-xs">
									<Select.Value placeholder="Any channel" />
								</Select.Trigger>
								<Select.Content>
									{#each CHANNELS as ch}
										<Select.Item value={ch}>{ch[0].toUpperCase() + ch.slice(1)}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<Button
								class="ml-auto gap-1.5"
								disabled={!newTitle.trim() || !newBody.trim() || saving}
								onclick={() => void create()}
							>
								<Save class="h-4 w-4" />
								Save
							</Button>
						</div>
					</div>
				</div>
			{:else}
				<button
					type="button"
					class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-background text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
					onclick={() => (creating = true)}
				>
					<Plus class="h-4 w-4" />
					New quick reply
				</button>
			{/if}
		{/if}
	</div>

	<ConfirmDialog
		bind:open={deleteOpen}
		title="Archive quick reply"
		description={deleteTarget
			? `Archive "${deleteTarget.title}"? You can restore it later if needed.`
			: ''}
		confirmLabel="Archive"
		variant="destructive"
		loading={deleting}
		onConfirm={() => {
			if (deleteTarget) void remove(deleteTarget.id);
		}}
	/>
</PageWrapper>
