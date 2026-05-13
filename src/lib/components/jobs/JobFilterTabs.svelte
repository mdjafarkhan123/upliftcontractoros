<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import type { JobsFilterStatus } from '$lib/types/jobs';

	let {
		value = $bindable<JobsFilterStatus>('all'),
		onChange
	}: {
		value?: JobsFilterStatus;
		onChange?: (next: JobsFilterStatus) => void;
	} = $props();

	function set(next: JobsFilterStatus) {
		value = next;
		onChange?.(next);
	}
</script>

<Tabs.Root value={value} onValueChange={(v: string) => set(v as JobsFilterStatus)}>
	<Tabs.List class="w-full">
		<Tabs.Trigger value="all">All</Tabs.Trigger>
		<Tabs.Trigger value="scheduled">Scheduled</Tabs.Trigger>
		<Tabs.Trigger value="in_progress">In Progress</Tabs.Trigger>
		<Tabs.Trigger value="completed">Completed</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
