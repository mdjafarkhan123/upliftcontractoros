import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'cos-theme';

function readInitial(): Theme {
	if (!browser) return 'dark';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	return 'dark';
}

function applyToDocument(theme: Theme) {
	if (!browser) return;
	const root = document.documentElement;
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;
}

function createTheme() {
	const initial = readInitial();
	let value = $state<Theme>(initial);

	if (browser) applyToDocument(initial);

	return {
		get value() {
			return value;
		},
		set(next: Theme) {
			value = next;
			if (browser) {
				localStorage.setItem(STORAGE_KEY, next);
				applyToDocument(next);
			}
		},
		toggle() {
			this.set(value === 'dark' ? 'light' : 'dark');
		}
	};
}

export const theme = createTheme();
