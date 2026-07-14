<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import NotificationPanel from '$lib/components/notifications/NotificationPanel.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';

	$effect(() => {
		void notificationStore.load();
	});
</script>

<svelte:head><title>Notifications</title></svelte:head>

<PageWrapper title="Notifications">
	<div class="noti-page-card">
		<NotificationPanel variant="page" />
	</div>
</PageWrapper>
