import Root from './select-root.svelte';
import Trigger from './select-trigger.svelte';
import Value from './select-value.svelte';
import Content from './select-content.svelte';
import Item from './select-item.svelte';

export { Root, Trigger, Value, Content, Item };

export {
	Root as SelectRoot,
	Trigger as SelectTrigger,
	Value as SelectValue,
	Content as SelectContent,
	Item as SelectItem
};

// Legacy native-select wrapper — kept for backward compatibility
export { default as Select } from './select.svelte';
