<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
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

	// Archive confirm dialog — only needed once the user clicks the trash icon.
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (ConfirmDialog || !deleteOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

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

	const channelLabel = (ch: string) => ch[0].toUpperCase() + ch.slice(1);
</script>

<svelte:head><title>Quick Replies — Settings</title></svelte:head>

<PageWrapper
	title="Quick Replies"
	subtitle="Saved message templates for the inbox"
	back="/settings"
>
	<div class="quick-replies">
		<div class="quick-replies__hint">
			<div class="quick-replies__hint-icon">
				<i class="ri-flashlight-line" aria-hidden="true"></i>
			</div>
			<div class="quick-replies__hint-body">
				<p>Tokens you can use in the body:</p>
				<ul class="quick-replies__hint-list">
					<li>
						<code class="quick-replies__token">{'{contact_name}'}</code> — replaced with the contact's
						full name when sending
					</li>
					<li>
						<code class="quick-replies__token">{'{org_name}'}</code> — replaced with your business name
					</li>
				</ul>
			</div>
		</div>

		{#if loading}
			<SkeletonLoader lines={3} height="56px" label="Loading quick replies" />
		{:else}
			{#if items.length === 0 && !creating}
				<EmptyState
					iconClass="ri-flashlight-line"
					title="No quick replies yet"
					description="Save a template once, reuse it forever from the inbox composer."
					actionLabel="New quick reply"
					onAction={() => (creating = true)}
				/>
			{:else}
				<ul class="quick-replies__list">
					{#each items as q (q.id)}
						<li class="quick-replies__card">
							<div class="quick-replies__card-main">
								<input
									class="field__input quick-replies__title-input"
									value={q.title}
									onchange={(e) => {
										const v = (e.currentTarget as HTMLInputElement).value.trim();
										if (v && v !== q.title) void update(q.id, { title: v });
									}}
								/>
								<textarea
									class="field__textarea"
									value={q.body}
									rows={2}
									onchange={(e) => {
										const v = (e.currentTarget as HTMLTextAreaElement).value.trim();
										if (v && v !== q.body) void update(q.id, { body: v });
									}}
								></textarea>
								<div class="quick-replies__card-foot">
									<Select.Root
										value={q.channel}
										onValueChange={(v) => {
											if (v !== q.channel)
												void update(q.id, { channel: v as QuickReply['channel'] });
										}}
									>
										<Select.Trigger class="field__input quick-replies__channel">
											<Select.Value />
										</Select.Trigger>
										<Select.Content>
											{#each CHANNELS as ch}
												<Select.Item value={ch} label={channelLabel(ch)}
													>{channelLabel(ch)}</Select.Item
												>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
							</div>
							<button
								type="button"
								class="quick-replies__icon-btn quick-replies__icon-btn--danger"
								aria-label="Archive"
								onclick={() => {
									deleteTarget = q;
									deleteOpen = true;
								}}
							>
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if creating}
				<div class="quick-replies__card quick-replies__card--new">
					<div class="quick-replies__card-main">
						<div class="quick-replies__card-head">
							<h3 class="quick-replies__card-title">New quick reply</h3>
							<button
								type="button"
								class="quick-replies__icon-btn"
								aria-label="Cancel"
								onclick={() => {
									creating = false;
									newTitle = '';
									newBody = '';
								}}
							>
								<i class="ri-close-line" aria-hidden="true"></i>
							</button>
						</div>
						<input
							class="field__input"
							bind:value={newTitle}
							placeholder="Title (e.g. Thanks for reaching out)"
							maxlength={60}
						/>
						<textarea
							class="field__textarea"
							bind:value={newBody}
							placeholder={'Hi {contact_name}, thanks for reaching out to {org_name}…'}
							rows={3}
							maxlength={1000}
						></textarea>
						<div class="quick-replies__card-foot">
							<Select.Root bind:value={newChannel}>
								<Select.Trigger class="field__input quick-replies__channel">
									<Select.Value placeholder="Any channel" />
								</Select.Trigger>
								<Select.Content>
									{#each CHANNELS as ch}
										<Select.Item value={ch} label={channelLabel(ch)}>{channelLabel(ch)}</Select.Item
										>
									{/each}
								</Select.Content>
							</Select.Root>
							<Button
								style="margin-left:auto"
								disabled={!newTitle.trim() || !newBody.trim() || saving}
								onclick={() => void create()}
							>
								<i class="ri-save-line" aria-hidden="true"></i>
								Save
							</Button>
						</div>
					</div>
				</div>
			{:else}
				<button type="button" class="quick-replies__add" onclick={() => (creating = true)}>
					<i class="ri-add-line" aria-hidden="true"></i>
					New quick reply
				</button>
			{/if}
		{/if}
	</div>

	{#if ConfirmDialog}
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
	{/if}
</PageWrapper>
