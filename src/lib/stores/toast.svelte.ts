export type ToastVariant = 'success' | 'error' | 'info';

// A toast can carry ONE action: either a link (navigation) or a click callback
// (e.g. "Undo" — revert an optimistic change). `icon` overrides the default glyph.
export type ToastAction =
	| { label: string; href: string; icon?: string }
	| { label: string; onClick: () => void; icon?: string };

export type Toast = {
	id: string;
	variant: ToastVariant;
	message: string;
	description?: string;
	action?: ToastAction;
	createdAt: number;
};

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
	success: 3000,
	info: 3500,
	error: 5000
};

const items = $state<Toast[]>([]);
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function makeId(): string {
	return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function push(
	variant: ToastVariant,
	message: string,
	opts?: { description?: string; duration?: number; action?: ToastAction }
): string {
	const id = makeId();
	items.push({
		id,
		variant,
		message,
		description: opts?.description,
		action: opts?.action,
		createdAt: Date.now()
	});
	// Toasts with an action get extra time so the user can tap it.
	const duration = opts?.duration ?? (opts?.action ? 7000 : DEFAULT_DURATIONS[variant]);
	if (duration > 0) {
		const handle = setTimeout(() => dismiss(id), duration);
		timers.set(id, handle);
	}
	return id;
}

function dismiss(id: string): void {
	const idx = items.findIndex((t) => t.id === id);
	if (idx >= 0) items.splice(idx, 1);
	const handle = timers.get(id);
	if (handle) {
		clearTimeout(handle);
		timers.delete(id);
	}
}

function clear(): void {
	for (const handle of timers.values()) clearTimeout(handle);
	timers.clear();
	items.length = 0;
}

export const toast = {
	get items(): Toast[] {
		return items;
	},
	success(
		message: string,
		opts?: { description?: string; duration?: number; action?: ToastAction }
	): string {
		return push('success', message, opts);
	},
	error(
		message: string,
		opts?: { description?: string; duration?: number; action?: ToastAction }
	): string {
		return push('error', message, opts);
	},
	info(
		message: string,
		opts?: { description?: string; duration?: number; action?: ToastAction }
	): string {
		return push('info', message, opts);
	},
	dismiss,
	clear
};
