<script lang="ts">
	// Shared multi-assignee + lead picker. Used by the full AppointmentForm and the
	// calendar's inline quick-create bubble so the crew UX lives in exactly one place.
	type Assignee = { id: string; full_name: string };

	let {
		assignees,
		selectedIds = $bindable([]),
		leadId = $bindable(null)
	}: {
		assignees: Assignee[];
		selectedIds?: string[];
		leadId?: string | null;
	} = $props();

	function toggleAssignee(memberId: string) {
		if (selectedIds.includes(memberId)) {
			selectedIds = selectedIds.filter((id) => id !== memberId);
			if (leadId === memberId) leadId = selectedIds[0] ?? null;
		} else {
			selectedIds = [...selectedIds, memberId];
			if (leadId === null) leadId = memberId;
		}
	}

	function setLead(memberId: string) {
		if (!selectedIds.includes(memberId)) {
			selectedIds = [...selectedIds, memberId];
		}
		leadId = memberId;
	}
</script>

{#if assignees.length === 0}
	<p class="appt-crew-picker__empty">No team members available.</p>
{:else}
	<ul class="appt-crew-picker">
		{#each assignees as a (a.id)}
			{@const selected = selectedIds.includes(a.id)}
			{@const isLead = leadId === a.id && selected}
			<li class="appt-crew-picker__row">
				<button
					type="button"
					class="appt-crew-picker__toggle"
					class:appt-crew-picker__toggle--selected={selected}
					onclick={() => toggleAssignee(a.id)}
					aria-pressed={selected}
				>
					<span class="appt-crew-picker__check" class:appt-crew-picker__check--on={selected}>
						{#if selected}
							<i class="ri-check-line" aria-hidden="true"></i>
						{/if}
					</span>
					<span class="appt-crew-picker__name">{a.full_name}</span>
					{#if isLead}
						<span class="appt-crew-picker__lead-pill">
							<i class="ri-vip-crown-line" aria-hidden="true"></i> Lead
						</span>
					{/if}
				</button>
				<button
					type="button"
					class="appt-crew-picker__crown"
					class:appt-crew-picker__crown--active={isLead}
					onclick={() => setLead(a.id)}
					disabled={isLead}
					aria-label={isLead ? `${a.full_name} is lead` : `Make ${a.full_name} the lead`}
				>
					<i class="ri-vip-crown-line" aria-hidden="true"></i>
				</button>
			</li>
		{/each}
	</ul>
	<p class="field__hint">
		{selectedIds.length === 0
			? 'No crew assigned.'
			: selectedIds.length === 1
				? '1 member · lead set'
				: `${selectedIds.length} members · lead set`}
	</p>
{/if}
