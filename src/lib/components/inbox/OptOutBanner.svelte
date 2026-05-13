<script lang="ts">
	import { ShieldAlert } from '@lucide/svelte';
</script>

<div
	class="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
>
	<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
	<div class="min-w-0 flex-1">
		<p class="font-medium">This contact has opted out of SMS.</p>
		<p class="text-xs text-destructive/80">
			Outbound messages are disabled. They can reply <strong>START</strong> to re-opt in.
		</p>
	</div>
</div>
