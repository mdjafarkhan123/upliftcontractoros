<script lang="ts">
	import RecycleBinList, { type RecycleBinItem } from '$lib/components/shared/RecycleBinList.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import type { ContactListItem } from '$lib/stores/contacts.svelte';

	// Thin adapter: maps deleted contact rows onto the shared RecycleBinList
	// (Restore-only). The old per-contact "delete forever" purge button was
	// removed app-wide — the 30-day soft-delete sweep handles permanent removal.
	let {
		items,
		canRestore,
		onChanged
	}: {
		items: ContactListItem[];
		canRestore: boolean;
		onChanged: (id: string) => void;
	} = $props();

	const binItems = $derived<RecycleBinItem[]>(
		items.map((c) => ({
			id: c.id,
			title: c.full_name,
			pills: c.phone ? [{ icon: 'ri-phone-line', label: formatPhoneDisplay(c.phone) }] : [],
			deleted_at: c.deleted_at
		}))
	);
</script>

<RecycleBinList
	items={binItems}
	noun="contact"
	restoreEndpoint={(id) => `/api/contacts/${id}/restore`}
	{canRestore}
	onRestored={onChanged}
/>
