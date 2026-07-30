<script lang="ts">
	import Avatar from '$lib/components/shared/Avatar.svelte';

	let {
		contact_id,
		contact_name,
		contact_phone,
		contact_email,
		service_address_line_1 = null,
		service_address_line_2 = null,
		service_address_city = null,
		service_address_state = null,
		service_address_zip = null
	}: {
		contact_id: string;
		contact_name: string;
		contact_phone: string;
		contact_email: string | null;
		service_address_line_1?: string | null;
		service_address_line_2?: string | null;
		service_address_city?: string | null;
		service_address_state?: string | null;
		service_address_zip?: string | null;
	} = $props();

	const mapsUrl = $derived.by(() => {
		const parts = [
			service_address_line_1,
			service_address_city,
			service_address_state,
			service_address_zip
		]
			.filter(Boolean)
			.join(', ');
		if (!parts) return null;
		return `https://maps.google.com/?q=${encodeURIComponent(parts)}`;
	});

	const hasAddress = $derived(
		!!(service_address_line_1 || service_address_city || service_address_zip)
	);
</script>

<div class="job-client">
	<p class="job-eyebrow">Client</p>

	<a href="/contacts/{contact_id}" class="job-client__contact">
		<Avatar size="md" name={contact_name} />
		<span class="job-client__identity">
			<span class="job-client__name">{contact_name}</span>
			<span class="job-client__view">View contact →</span>
		</span>
	</a>

	<div class="job-client__rows">
		{#if contact_phone}
			<a href="tel:{contact_phone}" class="job-client__row">
				<i class="ri-phone-line" aria-hidden="true"></i>
				{contact_phone}
			</a>
		{/if}
		{#if contact_email}
			<a href="mailto:{contact_email}" class="job-client__row">
				<i class="ri-mail-line" aria-hidden="true"></i>
				<span>{contact_email}</span>
			</a>
		{/if}
	</div>

	{#if hasAddress}
		<div class="job-client__addr">
			<p class="job-eyebrow">Service address</p>
			<div class="job-client__addr-body">
				<i class="ri-map-pin-line job-client__addr-icon" aria-hidden="true"></i>
				<div class="job-client__addr-lines">
					{#if service_address_line_1}<p>{service_address_line_1}</p>{/if}
					{#if service_address_line_2}<p>{service_address_line_2}</p>{/if}
					{#if service_address_city || service_address_state || service_address_zip}
						<p>
							{[service_address_city, service_address_state, service_address_zip]
								.filter(Boolean)
								.join(', ')}
						</p>
					{/if}
					{#if mapsUrl}
						<a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="job-client__maps">
							<i class="ri-external-link-line" aria-hidden="true"></i> Open in Maps
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
