import type { Action } from 'svelte/action';

/**
 * Warm a cache the instant the user *signals intent* to open something — on
 * hover (desktop), touch-start (mobile, fires a beat before the click lands),
 * and focus (keyboard). By the time navigation completes the data is usually
 * already there, so the destination renders instantly. This is how Linear and
 * Notion make navigation feel immediate.
 *
 * The callback must be idempotent — it fires on every intent event and is
 * expected to no-op when the cache is already warm (see `prefetch()` on the
 * detail stores).
 *
 * Usage: `<a href="/contacts/{id}" use:prefetchOnIntent={() => store.prefetch(id)}>`
 */
export const prefetchOnIntent: Action<HTMLElement, () => void> = (node, callback) => {
	let cb = callback;
	const trigger = () => cb();

	node.addEventListener('pointerenter', trigger);
	node.addEventListener('touchstart', trigger, { passive: true });
	node.addEventListener('focusin', trigger);

	return {
		update(next: () => void) {
			cb = next;
		},
		destroy() {
			node.removeEventListener('pointerenter', trigger);
			node.removeEventListener('touchstart', trigger);
			node.removeEventListener('focusin', trigger);
		}
	};
};
