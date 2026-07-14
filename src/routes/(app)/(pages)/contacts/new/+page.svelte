<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ContactForm from '$lib/components/contacts/ContactForm.svelte';
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	$effect(() => {
		if (!member().can_create_contacts) goto('/contacts');
	});
</script>

<svelte:head><title>New contact</title></svelte:head>

<PageWrapper>
	<ContactForm mode="create" />
</PageWrapper>
