<script lang="ts">
	import { beforeNavigate } from '$app/navigation';

	let {
		dirty,
		message = 'You have unsaved changes. Leave anyway?'
	}: { dirty: boolean; message?: string } = $props();

	beforeNavigate((nav) => {
		if (!dirty) return;
		if (nav.willUnload) return; // browser handles via beforeunload below
		const ok = window.confirm(message);
		if (!ok) nav.cancel();
	});

	$effect(() => {
		function handler(e: BeforeUnloadEvent) {
			if (!dirty) return;
			e.preventDefault();
			// Modern browsers ignore custom strings, but returnValue keeps the prompt
			e.returnValue = '';
		}
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});
</script>
