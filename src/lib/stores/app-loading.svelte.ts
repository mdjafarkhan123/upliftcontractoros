/*
 * Global application loading controller.
 *
 * Lifecycle:
 *   1. Static markup in app.html paints instantly (pre-hydration).
 *   2. Root layout mounts, arms a 10s failsafe, and watches readiness.
 *   3. When the relevant readiness signal resolves (session for /(app),
 *      mount-stable for jafar/auth), completeInitialHydration() fades out
 *      and removes the static node after transitionend.
 *   4. Subsequent major-route navigations show the Svelte-rendered overlay
 *      via startTransition() / stopTransition() with a 150ms debounce so
 *      cached navigations don't flash the loader.
 */

const FAILSAFE_MS = 10_000;
const TRANSITION_DEBOUNCE_MS = 150;
const FADE_OUT_MS = 220;

let initialHydrationDone = $state(false);
let overlayLoading = $state(false);

let debounceHandle: ReturnType<typeof setTimeout> | null = null;
let failsafeHandle: ReturnType<typeof setTimeout> | null = null;
let failsafeArmed = false;

export const MAJOR_ROUTE_PREFIXES = [
	'/dashboard',
	'/contacts',
	'/jobs',
	'/invoices',
	'/quotes',
	'/settings',
	'/pipeline',
	'/growth',
	'/reputation'
] as const;

export function isMajorRoute(pathname: string): boolean {
	return MAJOR_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function removeStaticLoader(): void {
	if (typeof document === 'undefined') return;
	const node = document.getElementById('app-loader-initial');
	if (!node) return;
	node.classList.add('app-loader--hidden');

	let removed = false;
	const cleanup = () => {
		if (removed) return;
		removed = true;
		node.removeEventListener('transitionend', cleanup);
		node.parentNode?.removeChild(node);
	};
	node.addEventListener('transitionend', cleanup);
	// Failsafe in case transitionend never fires (display:none ancestor, etc.)
	setTimeout(cleanup, FADE_OUT_MS + 200);
}

export const appLoading = {
	get isInitialHydration(): boolean {
		return !initialHydrationDone;
	},
	get isOverlayLoading(): boolean {
		return overlayLoading;
	},

	/** Arm the 10s deadlock failsafe. Called once from root layout onMount. */
	armFailsafe(): void {
		if (failsafeArmed) return;
		failsafeArmed = true;
		failsafeHandle = setTimeout(() => {
			if (initialHydrationDone) return;
			console.warn(
				'[app-loading] failsafe triggered after 10s — forcing loader hide. ' +
					'Auth/session bootstrap likely hung.'
			);
			appLoading.completeInitialHydration();
		}, FAILSAFE_MS);
	},

	/** Fade and remove the static boot loader. Idempotent. */
	completeInitialHydration(): void {
		if (initialHydrationDone) return;
		initialHydrationDone = true;
		if (failsafeHandle) {
			clearTimeout(failsafeHandle);
			failsafeHandle = null;
		}
		removeStaticLoader();
	},

	/** Debounced overlay show for route transitions. */
	startTransition(): void {
		if (debounceHandle || overlayLoading) return;
		debounceHandle = setTimeout(() => {
			overlayLoading = true;
			debounceHandle = null;
		}, TRANSITION_DEBOUNCE_MS);
	},

	/** Cancel any pending show + hide overlay. */
	stopTransition(): void {
		if (debounceHandle) {
			clearTimeout(debounceHandle);
			debounceHandle = null;
		}
		overlayLoading = false;
	},

	/** Hard reset for emergency use. */
	forceHideLoader(): void {
		appLoading.completeInitialHydration();
		appLoading.stopTransition();
	}
};
