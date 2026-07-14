<script lang="ts">
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	const canSend = $derived(member().can_send_messages);
</script>

<div class="thread-empty">
	<div class="thread-empty__inner">
		<div class="thread-empty__icon">
			<i class="ri-chat-3-line" aria-hidden="true"></i>
		</div>
		<h3 class="thread-empty__title">Select a conversation</h3>
		<p class="thread-empty__text">
			Choose a thread on the left to read and reply. Or start a new one.
		</p>
		{#if canSend}
			<div class="thread-empty__action">
				<a href="/inbox/compose" class="btn btn--primary">
					<i class="ri-add-line" aria-hidden="true"></i>
					New message
				</a>
			</div>
		{/if}
	</div>
</div>
