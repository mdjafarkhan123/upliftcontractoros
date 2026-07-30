<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/stores/toast.svelte';

	type Channel = 'sms' | 'email' | 'call' | 'whatsapp' | 'messenger' | 'gbp' | 'webchat';
	type Workflow = {
		id: string;
		name: string;
		status: 'draft' | 'published' | 'paused';
		trigger_filters: {
			direction?: 'inbound' | 'outbound';
			state?: 'enabled' | 'disabled';
			scope?: 'all_channels' | 'specific_channels';
			channels?: Channel[];
		};
		action_config: {
			direction: 'inbound' | 'outbound';
			operation: 'enable' | 'disable';
			scope: 'all_channels' | 'specific_channels';
			channels?: Channel[];
		};
		enabled: boolean;
		updated_at: string;
	};

	const channels: { value: Channel; label: string }[] = [
		{ value: 'sms', label: 'SMS' },
		{ value: 'email', label: 'Email' },
		{ value: 'call', label: 'Calls' },
		{ value: 'whatsapp', label: 'WhatsApp' },
		{ value: 'messenger', label: 'Messenger' },
		{ value: 'gbp', label: 'Google Business' },
		{ value: 'webchat', label: 'Webchat' }
	];
	let workflows = $state<Workflow[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let editingId = $state<string | null>(null);
	let draft = $state<Workflow | null>(null);

	function blank(): Workflow {
		return {
			id: '',
			name: '',
			status: 'draft',
			trigger_filters: { scope: 'all_channels' },
			action_config: { direction: 'outbound', operation: 'disable', scope: 'all_channels' },
			enabled: false,
			updated_at: ''
		};
	}
	function toggleChannel(target: Channel[], channel: Channel) {
		target.includes(channel) ? target.splice(target.indexOf(channel), 1) : target.push(channel);
	}
	function channelsText(values: Channel[] | undefined) {
		return values?.length
			? values.map((v) => channels.find((c) => c.value === v)?.label ?? v).join(', ')
			: 'All channels';
	}
	async function load() {
		try {
			const response = await fetch('/api/settings/automation/communication-workflows');
			const body = (await response.json()) as { data?: Workflow[]; error?: string };
			if (!response.ok) throw new Error(body.error ?? 'Unable to load DND workflows.');
			workflows = body.data ?? [];
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to load DND workflows.');
		} finally {
			loading = false;
		}
	}
	async function save() {
		if (!draft || saving) return;
		const currentDraft = draft;
		if (!currentDraft.name.trim()) {
			toast.error('Name is required.');
			return;
		}
		if (
			currentDraft.action_config.scope === 'specific_channels' &&
			!currentDraft.action_config.channels?.length
		) {
			toast.error('Choose at least one action channel.');
			return;
		}
		saving = true;
		try {
			const response = await fetch(
				`/api/settings/automation/communication-workflows${currentDraft.id ? `/${currentDraft.id}` : ''}`,
				{
					method: currentDraft.id ? 'PATCH' : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(currentDraft)
				}
			);
			const body = (await response.json()) as { data?: Workflow; error?: string };
			if (!response.ok || !body.data) throw new Error(body.error ?? 'Unable to save workflow.');
			workflows = currentDraft.id
				? workflows.map((item) => (item.id === currentDraft.id ? body.data! : item))
				: [body.data, ...workflows];
			editingId = null;
			draft = null;
			toast.success('DND workflow saved.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to save workflow.');
		} finally {
			saving = false;
		}
	}
	async function remove(id: string) {
		if (!confirm('Delete this DND workflow?')) return;
		const response = await fetch(`/api/settings/automation/communication-workflows/${id}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			toast.error(body.error ?? 'Unable to delete workflow.');
			return;
		}
		workflows = workflows.filter((item) => item.id !== id);
		toast.success('Workflow deleted.');
	}
	function edit(workflow: Workflow) {
		editingId = workflow.id;
		draft = structuredClone(workflow);
	}

	$effect(() => {
		void load();
	});
</script>

<section class="dnd-workflows">
	<div class="dnd-workflows__header">
		<div>
			<p class="eyebrow">GHL controls</p>
			<h2>DND workflows</h2>
			<p>
				When a contact’s preference changes, automatically enable or disable the matching DND scope.
			</p>
		</div>
		<Button
			size="sm"
			onclick={() => {
				editingId = 'new';
				draft = blank();
			}}><i class="ri-add-line" aria-hidden="true"></i> New workflow</Button
		>
	</div>
	{#if draft}
		<div class="dnd-workflows__editor">
			<div class="dnd-workflows__editor-head">
				<h3>{draft.id ? 'Edit workflow' : 'New DND workflow'}</h3>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						draft = null;
						editingId = null;
					}}>Cancel</Button
				>
			</div>
			<div class="dnd-workflows__fields">
				<label>Name<Input bind:value={draft.name} placeholder="Customer opts out of SMS" /></label>
				<label
					>Trigger direction<Select.Root
						bind:value={draft.trigger_filters.direction}
						items={[
							{ value: 'inbound', label: 'Inbound' },
							{ value: 'outbound', label: 'Outbound' }
						]}
						><Select.Trigger><Select.Value placeholder="Any direction" /></Select.Trigger
						><Select.Content
							><Select.Item value="inbound" label="Inbound">Inbound</Select.Item><Select.Item
								value="outbound"
								label="Outbound">Outbound</Select.Item
							></Select.Content
						></Select.Root
					></label
				>
				<label
					>Trigger state<Select.Root
						bind:value={draft.trigger_filters.state}
						items={[
							{ value: 'enabled', label: 'DND enabled' },
							{ value: 'disabled', label: 'DND disabled' }
						]}
						><Select.Trigger><Select.Value placeholder="Any state" /></Select.Trigger
						><Select.Content
							><Select.Item value="enabled" label="DND enabled">DND enabled</Select.Item
							><Select.Item value="disabled" label="DND disabled">DND disabled</Select.Item
							></Select.Content
						></Select.Root
					></label
				>
				<label
					>Action direction<Select.Root
						bind:value={draft.action_config.direction}
						items={[
							{ value: 'inbound', label: 'Inbound' },
							{ value: 'outbound', label: 'Outbound' }
						]}
						><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
							><Select.Item value="inbound" label="Inbound">Inbound</Select.Item><Select.Item
								value="outbound"
								label="Outbound">Outbound</Select.Item
							></Select.Content
						></Select.Root
					></label
				>
				<label
					>Action<Select.Root
						bind:value={draft.action_config.operation}
						items={[
							{ value: 'enable', label: 'Enable DND' },
							{ value: 'disable', label: 'Disable DND' }
						]}
						><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
							><Select.Item value="enable" label="Enable DND">Enable DND</Select.Item><Select.Item
								value="disable"
								label="Disable DND">Disable DND</Select.Item
							></Select.Content
						></Select.Root
					></label
				>
				<label
					>Action scope<Select.Root
						bind:value={draft.action_config.scope}
						items={[
							{ value: 'all_channels', label: 'All channels' },
							{ value: 'specific_channels', label: 'Specific channels' }
						]}
						><Select.Trigger><Select.Value /></Select.Trigger><Select.Content
							><Select.Item value="all_channels" label="All channels">All channels</Select.Item
							><Select.Item value="specific_channels" label="Specific channels"
								>Specific channels</Select.Item
							></Select.Content
						></Select.Root
					></label
				>
			</div>
			{#if draft.action_config.scope === 'specific_channels'}<div
					class="dnd-workflows__channel-picker"
				>
					<span>Channels</span>
					<div>
						{#each channels as channel (channel.value)}<button
								type="button"
								class:active={draft.action_config.channels?.includes(channel.value)}
								onclick={() => {
									draft!.action_config.channels ??= [];
									toggleChannel(draft!.action_config.channels, channel.value);
								}}>{channel.label}</button
							>{/each}
					</div>
				</div>{/if}
			<div class="dnd-workflows__editor-footer">
				<label class="dnd-workflows__publish"
					><Switch
						checked={draft.enabled}
						onchange={(checked) => {
							draft!.enabled = checked;
							draft!.status = checked ? 'published' : 'paused';
						}}
					/> <span>Workflow active</span></label
				><Button size="sm" loading={saving} loadingLabel="Saving…" onclick={() => void save()}
					>Save workflow</Button
				>
			</div>
		</div>
	{/if}
	{#if loading}<p class="dnd-workflows__empty">
			Loading workflows…
		</p>{:else if workflows.length === 0}<p class="dnd-workflows__empty">
			No DND workflows yet. Add one when a preference change should drive another DND action.
		</p>{:else}<div class="dnd-workflows__list">
			{#each workflows as workflow (workflow.id)}<article class="dnd-workflows__row">
					<div class="dnd-workflows__row-copy">
						<div class="dnd-workflows__row-title">
							<h3>{workflow.name}</h3>
							<span class:published={workflow.enabled}
								>{workflow.enabled ? 'Active' : workflow.status}</span
							>
						</div>
						<p>
							When {workflow.trigger_filters.direction ?? 'any'} contact DND is {workflow
								.trigger_filters.state ?? 'changed'} → {workflow.action_config.operation ===
							'enable'
								? 'enable'
								: 'disable'}
							{workflow.action_config.direction} DND · {channelsText(
								workflow.action_config.channels
							)}
						</p>
					</div>
					<div class="dnd-workflows__row-actions">
						<Button variant="ghost" size="sm" onclick={() => edit(workflow)}>Edit</Button><Button
							variant="ghost"
							size="sm"
							onclick={() => void remove(workflow.id)}>Delete</Button
						>
					</div>
				</article>{/each}
		</div>{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;
	.dnd-workflows {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		padding: $space-5;
		border: 1px solid var(--color-border);
		border-radius: $radius-2xl;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-sm);
	}
	.dnd-workflows__header,
	.dnd-workflows__editor-head,
	.dnd-workflows__editor-footer,
	.dnd-workflows__row,
	.dnd-workflows__row-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-4;
	}
	.dnd-workflows h2 {
		margin: 2px 0 0;
		font-size: $fs-lg;
		color: var(--color-text-primary);
	}
	.dnd-workflows__header p,
	.dnd-workflows__row p {
		margin: 3px 0 0;
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}
	.dnd-workflows__editor {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		padding: $space-4;
		border-radius: $radius-lg;
		background: var(--color-bg-surface-sunk);
	}
	.dnd-workflows__editor h3 {
		margin: 0;
		font-size: $fs-body;
		color: var(--color-text-primary);
	}
	.dnd-workflows__fields {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: $space-3;
	}
	.dnd-workflows__fields label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: $fs-caption;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
	}
	.dnd-workflows__channel-picker {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		font-size: $fs-caption;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
	}
	.dnd-workflows__channel-picker div {
		display: flex;
		flex-wrap: wrap;
		gap: $space-2;
	}
	.dnd-workflows__channel-picker button {
		padding: 6px 10px;
		border: 1px solid var(--color-border-strong);
		border-radius: $radius-full;
		background: var(--color-bg-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.dnd-workflows__channel-picker button.active {
		border-color: var(--color-brand);
		background: var(--state-active-tint);
		color: var(--color-brand-strong);
	}
	.dnd-workflows__publish {
		display: flex;
		align-items: center;
		gap: $space-2;
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}
	.dnd-workflows__list {
		display: flex;
		flex-direction: column;
	}
	.dnd-workflows__row {
		padding: $space-4 0;
		border-top: 1px solid var(--color-border);
	}
	.dnd-workflows__row-title {
		justify-content: flex-start;
	}
	.dnd-workflows__row-title h3 {
		margin: 0;
		font-size: $fs-body;
		color: var(--color-text-primary);
	}
	.dnd-workflows__row-title span {
		padding: 3px 8px;
		border-radius: $radius-full;
		background: var(--color-bg-surface-sunk);
		font-size: $fs-caption;
		color: var(--color-text-muted);
	}
	.dnd-workflows__row-title span.published {
		background: var(--success-bg);
		color: var(--success-solid);
	}
	.dnd-workflows__row-actions {
		display: flex;
		gap: $space-1;
		flex-shrink: 0;
	}
	.dnd-workflows__empty {
		margin: 0;
		padding: $space-4;
		border-radius: $radius-lg;
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-muted);
	}
	@media (max-width: 900px) {
		.dnd-workflows__fields {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
