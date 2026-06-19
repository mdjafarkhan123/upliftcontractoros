<script lang="ts">
	import { MessageSquare, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	const canSend = $derived(member().can_send_messages);
</script>

<div class="flex flex-1 items-center justify-center bg-muted/20 p-8">
	<div class="max-w-sm text-center">
		<div
			class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20"
		>
			<MessageSquare class="h-7 w-7" />
		</div>
		<h3 class="text-base font-semibold tracking-tight text-foreground">Select a conversation</h3>
		<p class="mt-1.5 text-sm text-muted-foreground">
			Choose a thread on the left to read and reply. Or start a new one.
		</p>
		{#if canSend}
			<div class="mt-4">
				<Button href="/inbox/compose">
					<Plus class="h-4 w-4" />
					New message
				</Button>
			</div>
		{/if}
	</div>
</div>
