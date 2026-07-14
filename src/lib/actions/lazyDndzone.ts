import type { ActionReturn } from 'svelte/action';
import type { Options, Item, DndZoneAttributes, TRIGGERS } from 'svelte-dnd-action';

/**
 * Library constants published the moment the drag engine loads. The engine and
 * these constants come from the SAME dynamic import, and creating the zone (below)
 * is what activates drag events — so `dndReady.consts` is guaranteed non-null
 * before any `consider`/`finalize` event can fire. The Pipeline page reads this
 * instead of doing its own separate, unsynchronized import, which used to race the
 * first drag and silently drop the move. Read only inside event handlers (never a
 * template), so a plain object — no `$state` — is correct.
 */
export const dndReady: {
	consts: { TRIGGERS: typeof TRIGGERS; SHADOW: string } | null;
} = { consts: null };

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

	void import('svelte-dnd-action').then((m) => {
		if (!dndReady.consts) {
			dndReady.consts = { TRIGGERS: m.TRIGGERS, SHADOW: m.SHADOW_ITEM_MARKER_PROPERTY_NAME };
		}
		if (destroyed) return;
		handle = m.dndzone(node, latest);
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
