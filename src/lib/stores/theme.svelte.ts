import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'cos-theme';

function readInitial(): Theme {
	if (!browser) return 'dark';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
	return prefersLight ? 'light' : 'dark';
}

function applyToDocument(theme: Theme) {
	if (!browser) return;
	const root = document.documentElement;
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;
}

function createTheme() {
	let value = $state<Theme>(readInitial());

	if (browser) applyToDocument(value);

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
