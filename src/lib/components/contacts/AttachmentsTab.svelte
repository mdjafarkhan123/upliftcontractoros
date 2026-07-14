<script lang="ts">
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { getMemberContext } from '$lib/context/member';

	let { contactId }: { contactId: string } = $props();

	const member = getMemberContext();
	const canView = $derived(member().can_view_all_files);
	const canUpload = $derived(member().can_upload_files);
	// The media DELETE endpoint authorizes on can_upload_files, so gate the
	// delete affordance the same way the quote/invoice/job attachment views do
	// — otherwise the button would 403.
	const canDelete = $derived(member().can_upload_files);
</script>

{#if canView}
	<AttachmentList
		parentFk={{ contact_id: contactId }}
		purposeTag="contact_attachment"
		title="Files"
		uploadLabel="Add file"
		{canUpload}
		{canDelete}
	/>
{:else}
	<EmptyState
		title="No access to files"
		description="You don't have permission to view files for this contact."
		iconClass="ri-file-text-line"
	/>
{/if}
