import type { ActionReturn } from 'svelte/action';
import type { Options, Item, DndZoneAttributes } from 'svelte-dnd-action';

/**
 * Lazy wrapper around svelte-dnd-action's `dndzone`.
 *
 * `svelte-dnd-action` is the heaviest dependency on the Pipeline board, but the
 * board only needs it once the user starts dragging. This action paints the
 * cards immediately and dynamically imports the drag engine a beat after first
 * render — cards stay clickable the whole time; only dragging is unavailable for
 * the moment the chunk loads. Mirrors the lazy-load pattern used in the Inbox.
 *
 * It re-exposes the same `ActionReturn<Options, DndZoneAttributes>` shape so the
 * `onconsider` / `onfinalize` event attributes still typecheck at the call site.
 */
export function lazyDndzone<T extends Item>(
	node: HTMLElement,
	options: Options<T>
): ActionReturn<Options<T>, DndZoneAttributes<T>> {
	let handle: ActionReturn<Options<T>> | undefined;
	let latest = options;
	let destroyed = false;

	void import('svelte-dnd-action').then(({ dndzone }) => {
		if (destroyed) return;
		handle = dndzone(node, latest);
	});

	return {
		update(newOptions: Options<T>) {
			latest = newOptions;
			handle?.update?.(newOptions);
		},
		destroy() {
			destroyed = true;
			handle?.destroy?.();
		}
	};
}
