<script lang="ts">
	import InboxThreadView from '$lib/components/inbox/InboxThreadView.svelte';

	let { data } = $props<{ data: { conversationId: string } }>();
</script>

<InboxThreadView conversationId={data.conversationId} />
