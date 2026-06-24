<script lang="ts">
	import { ExternalLink, Mail, MapPin, Phone } from '@lucide/svelte';

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

	function initials(name: string): string {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}

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

<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
	<p class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
		Client
	</p>

	<a
		href="/contacts/{contact_id}"
		class="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40"
	>
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary"
		>
			{initials(contact_name)}
		</div>
		<div class="min-w-0">
			<p class="truncate font-semibold text-foreground">{contact_name}</p>
			<p class="text-xs text-primary">View contact →</p>
		</div>
	</a>

	<div class="mt-3 space-y-0.5">
		{#if contact_phone}
			<a
				href="tel:{contact_phone}"
				class="flex min-h-[36px] items-center gap-2 rounded-md px-1 py-1 text-sm text-foreground transition-colors hover:bg-accent/40"
			>
				<Phone class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				{contact_phone}
			</a>
		{/if}
		{#if contact_email}
			<a
				href="mailto:{contact_email}"
				class="flex min-h-[36px] min-w-0 items-center gap-2 rounded-md px-1 py-1 text-sm text-foreground transition-colors hover:bg-accent/40"
			>
				<Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<span class="truncate">{contact_email}</span>
			</a>
		{/if}
	</div>

	{#if hasAddress}
		<div class="mt-3 border-t border-border/50 pt-3">
			<p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
				Service address
			</p>
			<div class="flex items-start gap-2">
				<MapPin class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<div class="min-w-0 text-sm text-foreground">
					{#if service_address_line_1}
						<p>{service_address_line_1}</p>
					{/if}
					{#if service_address_line_2}
						<p>{service_address_line_2}</p>
					{/if}
					{#if service_address_city || service_address_state || service_address_zip}
						<p>
							{[service_address_city, service_address_state, service_address_zip]
								.filter(Boolean)
								.join(', ')}
						</p>
					{/if}
					{#if mapsUrl}
						<a
							href={mapsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
						>
							<ExternalLink class="h-3 w-3" /> Open in Maps
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
