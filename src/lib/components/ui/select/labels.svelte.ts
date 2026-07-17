// Why this exists: Bits UI works out what the CLOSED trigger should say by looking the selected
// value up among the <Select.Item> nodes that are currently in the DOM. Our dropdown content is
// portalled and only mounted while open, so that lookup is a race — if the bound value settles
// AFTER the dropdown closes (any `value` that is a $derived of other state, e.g. the job form's
// `repeatMode`), the items are already gone and Bits falls back to printing the raw value
// ("week1", "as_needed") instead of "Weekly on Tuesday".
//
// The registry removes the race: every <Select.Item> records its label here while it is mounted,
// and entries are kept after unmount, so <Select.Value /> can always resolve a label from data
// instead of from the DOM. Scoped per <Select.Root> via context, so two selects on one page can
// reuse the same value ("none") with different labels.
import { getContext, hasContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

const KEY = Symbol('ui-select-labels');

/** Called by <Select.Root>. Creates the value→label map for this select's subtree. */
export function createSelectLabels(): SvelteMap<string, string> {
	const labels = new SvelteMap<string, string>();
	setContext(KEY, labels);
	return labels;
}

/**
 * Called by <Select.Item> / <Select.Value>. Returns `undefined` when used outside our
 * <Select.Root> (e.g. under a raw Bits UI root), where callers fall back to Bits' own label.
 */
export function getSelectLabels(): SvelteMap<string, string> | undefined {
	return hasContext(KEY) ? getContext<SvelteMap<string, string>>(KEY) : undefined;
}
