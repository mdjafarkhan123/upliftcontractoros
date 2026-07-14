<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';
	import { getCardDef } from '$lib/automation/cardDefinitions';

	type Enrollment = {
		id: string;
		sequence_key: string;
		status: 'active' | 'paused';
		resource_type: string;
		next_step_at: string | null;
		paused_until: string | null;
	};

	let { contactId }: { contactId: string } = $props();

	const member = getMemberContext();
	const canStop = $derived(member().can_send_messages);

	let enrollments = $state<Enrollment[]>([]);
	let loaded = $state(false);
	let confirmOpen = $state(false);
	let target = $state<Enrollment | null>(null);
	let stopping = $state(false);

	async function load(id: string) {
		try {
			const res = await fetch(`/api/automation/enrollments?contact_id=${encodeURIComponent(id)}`);
			if (!res.ok) return;
			const body = await res.json();
			enrollments = body.data ?? [];
		} catch {
			// Non-critical panel — stay silent on failure rather than blocking the page.
		} finally {
			loaded = true;
		}
	}

	// Refetch whenever the contact changes (sheet re-opens for a different deal).
	$effect(() => {
		const id = contactId;
		enrollments = [];
		loaded = false;
		void load(id);
	});

	function titleFor(key: string): string {
		return getCardDef(key)?.title ?? 'Automation';
	}

	// Friendly relative time for the next scheduled message ("in 2h", "in 3d").
	function relative(iso: string): string {
		const ms = new Date(iso).getTime() - Date.now();
		if (ms <= 60_000) return 'shortly';
		const mins = Math.round(ms / 60_000);
		if (mins < 60) return `in ${mins}m`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `in ${hours}h`;
		const days = Math.round(hours / 24);
		return `in ${days}d`;
	}

	function metaFor(e: Enrollment): string {
		if (e.status === 'paused') {
			return e.paused_until ? `Paused · resumes ${relative(e.paused_until)}` : 'Paused';
		}
		return e.next_step_at ? `Next message ${relative(e.next_step_at)}` : 'In progress';
	}

	function requestStop(e: Enrollment) {
		target = e;
		confirmOpen = true;
	}

	async function confirmStop() {
		if (!target) return;
		const id = target.id;
		stopping = true;
		try {
			const res = await fetch(`/api/automation/enrollments/${id}/stop`, { method: 'POST' });
			// 404 = already stopped elsewhere; treat as success and drop it from the list.
			if (res.ok || res.status === 404) {
				enrollments = enrollments.filter((x) => x.id !== id);
				toast.success('Automation stopped.');
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Could not stop automation.');
			}
		} catch {
			toast.error('Could not stop automation.');
		} finally {
			stopping = false;
			target = null;
		}
	}
</script>

{#if loaded && enrollments.length > 0}
	<div class="active-auto">
		<div class="active-auto__head">
			<i class="ri-flashlight-line active-auto__head-icon" aria-hidden="true"></i>
			<p class="active-auto__head-label">Active automations</p>
		</div>
		<ul class="active-auto__list">
			{#each enrollments as e (e.id)}
				<li class="active-auto__row">
					<div class="active-auto__info">
						<div class="active-auto__title-row">
							<span class="active-auto__title">{titleFor(e.sequence_key)}</span>
							{#if e.status === 'paused'}
								<Badge label="Paused" variant="warning" />
							{:else}
								<Badge label="Active" variant="success" />
							{/if}
						</div>
						<p class="active-auto__meta">{metaFor(e)}</p>
					</div>
					{#if canStop}
						<button
							type="button"
							class="active-auto__stop"
							onclick={() => requestStop(e)}
							aria-label={`Stop ${titleFor(e.sequence_key)} automation`}
						>
							<i class="ri-stop-circle-line" aria-hidden="true"></i>
							Stop
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<ConfirmDialog
		bind:open={confirmOpen}
		title="Stop this automation?"
		description={target
			? `“${titleFor(target.sequence_key)}” will stop and no further automated messages will be sent for this. This can't be undone.`
			: ''}
		confirmLabel="Stop automation"
		variant="destructive"
		loading={stopping}
		onConfirm={confirmStop}
		onCancel={() => (target = null)}
	/>
{/if}
