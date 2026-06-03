<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { List, CalendarDays } from '@lucide/svelte';
	import type { AppointmentView } from '$lib/types/appointments';

	let { view = $bindable('list') }: { view?: AppointmentView } = $props();
</script>

<div class="inline-flex rounded-md border border-border bg-card p-0.5">
	<Button
		variant={view === 'list' ? 'default' : 'ghost'}
		size="sm"
		class="h-9"
		onclick={() => (view = 'list')}
	>
		<List class="h-4 w-4" /> List
	</Button>
	<Button
		variant={view === 'calendar' ? 'default' : 'ghost'}
		size="sm"
		class="h-9"
		onclick={() => (view = 'calendar')}
	>
		<CalendarDays class="h-4 w-4" /> Calendar
	</Button>
</div>
