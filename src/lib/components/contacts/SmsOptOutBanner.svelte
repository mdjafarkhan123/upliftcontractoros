<script lang="ts">
	let {
		source,
		opted_out_at
	}: {
		source?: string | null;
		opted_out_at?: string | Date | null;
	} = $props();

	const when = $derived.by(() => {
		if (!opted_out_at) return null;
		try {
			return new Date(opted_out_at).toLocaleString();
		} catch {
			return null;
		}
	});
</script>

<div class="sms-opt-out-banner" role="status">
	<i class="ri-alert-line sms-opt-out-banner__icon" aria-hidden="true"></i>
	<div class="sms-opt-out-banner__body">
		<p class="sms-opt-out-banner__title">This contact has opted out of SMS.</p>
		<p class="sms-opt-out-banner__desc">
			Outbound SMS is disabled. Re-opt-in can only happen when the contact texts
			<strong>START</strong> or <strong>YES</strong>.
			{#if source}
				<span class="sms-opt-out-banner__meta">Source: {source}{when ? ` · ${when}` : ''}</span>
			{:else if when}
				<span class="sms-opt-out-banner__meta">{when}</span>
			{/if}
		</p>
	</div>
</div>
