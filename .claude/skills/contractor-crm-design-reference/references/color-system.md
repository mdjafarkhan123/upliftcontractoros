# Color System — Contractor Growth OS

> This is the authoritative color definition for the entire project.
> `src/lib/styles/app.css` is the source of truth — the tokens below match it exactly.
> Never introduce new CSS variables without adding them here first.
> Light mode is the default (`:root`). Dark mode is applied via `.dark` class on `<html>`.
> Never use raw hex values in components. Always use the semantic Tailwind classes from these CSS variables.
> Exception: Tailwind named color utilities (`bg-green-50`, `bg-amber-500/10`, etc.) are allowed for
> status badge and avatar ring colors where the trifecta pattern (bg + text + border) is needed.
> The sidebar surface (`--sidebar`) is a separate token from `--background` —
> always use `bg-sidebar` for the left sidebar so it reads as a distinct panel.

---

## Full `app.css` — Replace Entirely

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * Geist is self-hosted from /static/fonts — no Google Fonts round-trip.
 * font-display: swap ensures text paints immediately in the system fallback.
 * 300-400 → regular face; 500 → medium; 600-700 → semibold face.
 * font-bold (700) resolves to the 600 face — no synthesized bold artifact.
 */
@font-face {
	font-family: 'Geist';
	font-style: normal;
	font-weight: 300 400;
	font-display: swap;
	src: url('/fonts/geist-v5-latin-regular.woff2') format('woff2');
}
@font-face {
	font-family: 'Geist';
	font-style: normal;
	font-weight: 500;
	font-display: swap;
	src: url('/fonts/geist-v5-latin-500.woff2') format('woff2');
}
@font-face {
	font-family: 'Geist';
	font-style: normal;
	font-weight: 600 700;
	font-display: swap;
	src: url('/fonts/geist-v5-latin-600.woff2') format('woff2');
}

@layer base {
	/* ═══════════════════════════════════════════════════════════════════
     LIGHT MODE — DEFAULT  (the primary experience)
     Target: clean white + soft gray — like Linear, Craft, Notion
  ═══════════════════════════════════════════════════════════════════ */
	:root {
		/* ── Surfaces ───────────────────────────────────────────────── */
		--background: 0 0% 100%; /* #FFFFFF — main content area */
		--sidebar: 220 14% 96%; /* #F4F5F7 — left sidebar panel */
		--card: 0 0% 100%; /* #FFFFFF — cards sit on white */
		--card-raised: 0 0% 98%; /* #FAFAFA — slightly lifted card */
		--popover: 0 0% 100%; /* #FFFFFF — dropdowns */
		--muted: 220 14% 96%; /* #F4F5F7 — subtle bg, empty states */
		--accent: 220 14% 93%; /* #ECEEF2 — hover bg on list rows */
		--secondary: 220 14% 93%; /* same as accent */

		/* ── Brand Primary — Forest Green ──────────────────────────── */
		--primary: 151 70% 35%; /* #1a8c52 — forest green */
		--primary-foreground: 0 0% 100%;

		/* ── Extended Brand Palette ─────────────────────────────────── */
		/* Use ONLY for gradients, glow effects, and decorative accents.
		   Never use these for functional UI states — use --primary instead. */
		--brand-deep: 150 57% 17%; /* #13452d — deep forest green */
		--brand-primary: 150 57% 31%; /* #227d53 — mid green */
		--brand-light: 114 100% 48%; /* #17f700 — bright accent green */

		/* ── Text ───────────────────────────────────────────────────── */
		--foreground: 222 47% 11%; /* #0F172A — slate-900, primary text */
		--card-foreground: 222 47% 11%;
		--popover-foreground: 222 47% 11%;
		--muted-foreground: 215 16% 47%; /* #64748B — slate-500, secondary text */
		--accent-foreground: 222 47% 11%;
		--secondary-foreground: 222 47% 11%;

		/* ── Semantic ───────────────────────────────────────────────── */
		--destructive: 0 84% 60%; /* red-500 */
		--destructive-foreground: 0 0% 100%;

		/* ── Borders & Inputs ───────────────────────────────────────── */
		--border: 220 13% 91%; /* #E2E8F0 — slate-200, very soft */
		--input: 220 13% 91%;
		--ring: 151 62% 40%; /* green focus ring */

		/* ── Button gradient/edge tokens ────────────────────────────── */
		/* These power the raised/3D look on primary and destructive buttons */
		--primary-deep: 150 57% 27%; /* gradient end — darker green */
		--primary-edge: 150 57% 22%; /* 1px bottom border — deepest green */
		--destructive-deep: 0 72% 44%;
		--destructive-edge: 0 72% 38%;
		--surface-raised: 220 14% 96%; /* secondary button fill */
		--surface-raised-hover: 220 14% 92%;
		--surface-raised-border: 220 13% 86%;
		--surface-raised-border-hover: 220 13% 78%;

		/* ── Radius ─────────────────────────────────────────────────── */
		--radius: 0.5rem;

		/* ── Layout dimensions ──────────────────────────────────────── */
		--bottom-nav-height: 64px;
		--sidebar-width: 240px;
		--header-height: 56px;
		/* WARNING: Only for narrow single-column forms (settings, onboarding).
		   NEVER apply to list pages or dashboards — tables must fill the full area. */
		--content-max-width: 768px;

		/* ── Status colors ──────────────────────────────────────────── */
		--status-active: 142 71% 45%; /* green-500 */
		--status-pending: 38 92% 50%; /* amber-500 */
		--status-inactive: 215 20% 65%; /* slate-400 */
		--status-overdue: 0 84% 60%; /* red-500 */
		--status-lead: 199 89% 48%; /* sky-500 */
		--status-draft: 215 20% 65%; /* slate-400 */

		/* ── Shadow tokens ──────────────────────────────────────────── */
		--shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06);
		--shadow-dropdown: 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06);
		--shadow-modal: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.08);
	}

	/* ═══════════════════════════════════════════════════════════════════
     DARK MODE  — applied via .dark class on <html>
     Equally polished. Deep navy base, layered surfaces.
     Dark cards use a subtle inset top-highlight to simulate depth.
  ═══════════════════════════════════════════════════════════════════ */
	.dark {
		/* ── Surfaces ───────────────────────────────────────────────── */
		--background: 220 28% 5%; /* #080C14 — deepest, page bg */
		--sidebar: 220 22% 8%; /* slightly lighter — nav rail */
		--card: 220 22% 11%; /* card surface */
		--card-raised: 220 18% 15%; /* raised card */
		--popover: 220 22% 11%;
		--muted: 220 16% 15%; /* subtle bg */
		--accent: 154 34% 16%; /* green-tinted hover bg */
		--secondary: 220 16% 15%;

		/* ── Brand Primary — brighter on dark bg ────────────────────── */
		--primary: 151 62% 43%;
		--primary-foreground: 0 0% 100%;

		/* ── Text ───────────────────────────────────────────────────── */
		--foreground: 210 40% 96%; /* near-white */
		--card-foreground: 210 40% 96%;
		--popover-foreground: 210 40% 96%;
		--muted-foreground: 215 18% 67%;
		--accent-foreground: 210 40% 96%;
		--secondary-foreground: 210 40% 96%;

		/* ── Semantic ───────────────────────────────────────────────── */
		--destructive: 0 72% 51%;
		--destructive-foreground: 0 0% 100%;

		/* ── Borders & Inputs ───────────────────────────────────────── */
		--border: 220 14% 30%; /* visible but not heavy on dark */
		--input: 220 14% 30%;
		--ring: 151 62% 46%;

		/* ── Button gradient/edge tokens — dark mode ────────────────── */
		--primary-deep: 150 57% 27%;
		--primary-edge: 150 57% 22%;
		--destructive-deep: 0 72% 44%;
		--destructive-edge: 0 72% 38%;
		--surface-raised: 215 28% 16%;
		--surface-raised-hover: 215 28% 19%;
		--surface-raised-border: 215 28% 22%;
		--surface-raised-border-hover: 215 28% 28%;

		/* ── Status colors (same values — vivid enough on dark) ─────── */
		--status-active: 142 71% 45%;
		--status-pending: 38 92% 50%;
		--status-inactive: 215 20% 65%;
		--status-overdue: 0 84% 60%;
		--status-lead: 199 89% 48%;
		--status-draft: 215 20% 65%;

		/* ── Shadow tokens — dark uses inset top-highlight technique ── */
		/* The inset rgba(255,255,255/0.04) line simulates a light source from
		   above, giving dark cards dimension without heavy drop shadows.
		   This is the "Linear / Loom dark mode" depth technique. */
		--shadow-card: 0 18px 40px -30px rgb(0 0 0 / 0.85), 0 1px 0 0 rgb(255 255 255 / 0.04) inset;
		--shadow-dropdown: 0 22px 55px -28px rgb(0 0 0 / 0.9), 0 1px 0 0 rgb(255 255 255 / 0.06) inset;
		--shadow-modal: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.4);
	}
}

@layer base {
	* {
		@apply border-border;
	}

	html {
		/* Geist applied at CSS level — NOT via tailwind.config fontFamily.
		   This ensures the 600-weight face handles font-bold correctly. */
		font-family: 'Geist', 'Inter', system-ui, sans-serif;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	body {
		@apply bg-background text-foreground;
		font-feature-settings:
			'rlig' 1,
			'calt' 1;
	}

	/* ── Scrollbar — thin, themed ───────────────────────────────── */
	::-webkit-scrollbar {
		width: 5px;
		height: 5px;
	}
	::-webkit-scrollbar-track {
		@apply bg-transparent;
	}
	::-webkit-scrollbar-thumb {
		@apply bg-border rounded-full;
	}
	::-webkit-scrollbar-thumb:hover {
		@apply bg-muted-foreground/40;
	}
}

/* ─── Shimmer animation ──────────────────────────────────────────── */
@keyframes shimmer {
	0%   { background-position: 200% 0; }
	100% { background-position: -200% 0; }
}

/* Light mode — crisp shimmer on white cards */
html:not(.dark) .skeleton-shimmer {
	background: linear-gradient(
		90deg,
		rgba(240, 240, 240, 1) 25%,
		rgba(220, 220, 220, 1) 50%,
		rgba(240, 240, 240, 1) 100%
	);
	background-size: 200% 100%;
	animation: shimmer 1.2s ease-in-out infinite;
	border-radius: 4px;
}

/* Dark mode shimmer — mid-gray visible on dark card surface */
.skeleton-shimmer {
	background: linear-gradient(
		90deg,
		rgb(102, 102, 102) 25%,
		rgb(78, 78, 78) 50%,
		rgb(102, 102, 102) 100%
	);
	background-size: 200% 100%;
	animation: shimmer 1.2s ease-in-out infinite;
	border-radius: 4px;
}

/* ─── Status dot ─────────────────────────────────────────────────── */
.status-dot {
	@apply inline-block w-1.5 h-1.5 rounded-full shrink-0;
}
.status-dot-active {
	background: hsl(var(--status-active));
}
.status-dot-pending {
	background: hsl(var(--status-pending));
}
.status-dot-inactive {
	background: hsl(var(--status-inactive));
}
.status-dot-overdue {
	background: hsl(var(--status-overdue));
}
.status-dot-lead {
	background: hsl(var(--status-lead));
}
.status-dot-draft {
	background: hsl(var(--status-draft));
}

/* ─── Focus visible ──────────────────────────────────────────────── */
:focus-visible {
	@apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background;
}

/* ─── Table base styles ──────────────────────────────────────────── */
/*
 * NOTE: These CSS utility classes are available but NOT used by actual table
 * components (ContactTable, etc.) which use inline Tailwind for full control.
 * Do NOT use .data-table for new components — follow the inline Tailwind
 * pattern in layout-patterns.md → Data Table Pattern instead.
 * Kept here only as token reference.
 */
.table-container {
	@apply w-full overflow-x-auto rounded-xl border border-border/70;
}
.data-table {
	@apply w-full text-sm;
}
.data-table thead tr {
	@apply border-b border-border/60 bg-muted/30;
}
.data-table thead th {
	@apply px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground;
}
.data-table tbody tr {
	@apply border-b border-border/30 transition-colors duration-150;
}
.data-table tbody tr:last-child {
	@apply border-b-0;
}
.data-table tbody tr:hover {
	@apply bg-muted/20;
}
.data-table tbody td {
	@apply px-4 py-3.5 text-sm text-foreground;
}

/* ─── Progress bar ───────────────────────────────────────────────── */
.progress-bar-track {
	@apply h-1.5 w-full overflow-hidden rounded-full bg-muted;
}
.progress-bar-fill {
	@apply h-full rounded-full transition-all duration-300;
}
.progress-bar-fill-blue {
	@apply bg-blue-500;
}
.progress-bar-fill-green {
	@apply bg-green-500;
}
.progress-bar-fill-yellow {
	@apply bg-yellow-500;
}
.progress-bar-fill-red {
	@apply bg-red-500;
}
```

---

## Semantic Tailwind Classes — Usage Guide

### When to use which background

```svelte
<!-- App shell sidebar — distinct panel -->
<aside class="bg-sidebar border-r border-border/60">

<!-- Page root / main content -->
<div class="min-h-screen bg-background">

<!-- Card / panel -->
<Card.Root class="bg-card border-border/60 shadow-card">

<!-- Hover state on list row -->
<div class="hover:bg-muted/60 transition-colors duration-150">

<!-- Subtle section / empty state area -->
<div class="bg-muted rounded-lg p-6">

<!-- Selected / active item -->
<div class="bg-primary/10 text-primary">
```

### Status colour usage

```svelte
<!-- Status badge — always use Badge component -->
<Badge
	class={cn(
		status === 'active' &&
			'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
		status === 'lead' &&
			'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
		status === 'inactive' &&
			'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
		status === 'overdue' &&
			'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
		status === 'pending' &&
			'bg-amber-50 text-amber-700 border-amber-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20',
		status === 'draft' &&
			'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20'
	)}
>
	<span class={cn('status-dot mr-1.5', `status-dot-${status}`)} />
	{status}
</Badge>
```

### Primary colour usage

The brand primary is **forest green** — `bg-primary` renders as green in both light and dark mode.

```svelte
<!-- Primary action button (shadcn Button default variant handles this) -->
<Button variant="default">Save</Button>

<!-- Primary text link / highlight -->
<span class="text-primary">View details</span>

<!-- Primary subtle bg (e.g. selected nav item, active badge) -->
<div class="bg-primary/10 text-primary rounded-md px-3 py-2">

<!-- Focus ring — green, automatically applied via :focus-visible in app.css -->
```

### Border usage

```svelte
<!-- Standard card border -->
<div class="border border-border/60 rounded-lg">

<!-- Stronger divider -->
<div class="border-t border-border">

<!-- Danger state border -->
<div class="border border-destructive/30 bg-destructive/5">
```

---

## tailwind.config.ts — Reference

The actual `tailwind.config.ts` must match this. Key things to note:
- `fontFamily.sans` is NOT extended with Geist — font is applied via `html { font-family }` in `app.css`
- Colors use `/ <alpha-value>` syntax to support Tailwind opacity modifiers (`bg-primary/10`)
- `minHeight` and `minWidth` touch shortcuts enforce the 44px touch target rule
- `plugins` includes `tailwindcss-animate` and `@tailwindcss/typography`

```typescript
import { fontFamily } from 'tailwindcss/defaultTheme';
import type { Config } from 'tailwindcss';

export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		screens: {
			sm: '640px',
			md: '768px',
			lg: '1024px',
			xl: '1280px',
			'2xl': '1536px',
		},
		extend: {
			// Geist is loaded via @font-face in app.css — do NOT add it here.
			fontFamily: {
				sans: [...fontFamily.sans],
			},
			colors: {
				border: 'hsl(var(--border) / <alpha-value>)',
				input: 'hsl(var(--input) / <alpha-value>)',
				ring: 'hsl(var(--ring) / <alpha-value>)',
				background: 'hsl(var(--background) / <alpha-value>)',
				foreground: 'hsl(var(--foreground) / <alpha-value>)',
				sidebar: 'hsl(var(--sidebar) / <alpha-value>)',
				'card-raised': 'hsl(var(--card-raised) / <alpha-value>)',
				primary: {
					DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
					foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
					foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
					foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
					foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
					foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
				},
				card: {
					DEFAULT: 'hsl(var(--card) / <alpha-value>)',
					foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
					foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
			boxShadow: {
				card: 'var(--shadow-card)',
				dropdown: 'var(--shadow-dropdown)',
				modal: 'var(--shadow-modal)',
			},
			spacing: {
				'bottom-nav': 'var(--bottom-nav-height)',
			},
			minHeight: {
				touch: '44px',
			},
			minWidth: {
				touch: '44px',
			},
		},
	},
	plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
```

---

## New Token: `bg-sidebar`

The sidebar now has its own dedicated surface token. This is critical — it creates the visual
panel split between the navigation rail and the main content area without any box-shadow.

```svelte
<!-- Always use bg-sidebar on the <aside> element -->
<aside class="bg-sidebar border-r border-border/60 ...">

<!-- Content area stays bg-background (white) -->
<main class="bg-background ...">

<!-- Cards inside content area — bg-card (also white, but defined separately for dark mode) -->
<Card.Root class="bg-card border border-border/60 shadow-card">
```

In dark mode, `bg-sidebar` renders slightly lighter than `bg-background`, maintaining the same
structural depth cue in reverse — darker background, lighter sidebar panel.

---

## Shadow Usage Guide

Use the semantic shadow tokens, never raw Tailwind shadow classes for components:

```svelte
<!-- Standard card — barely lifted -->
<div class="shadow-card border border-border/60 rounded-lg bg-card">

<!-- Hovered card — more presence -->
<div class="shadow-dropdown rounded-lg bg-card">

<!-- Modal / dialog — floating above everything -->
<Dialog.Content class="shadow-modal">
```

Never use `shadow-xl`, `shadow-2xl`, or `shadow-lg` directly on cards, dialogs, or dropdowns.
The semantic tokens adjust their technique between light and dark modes — light uses traditional
drop shadows; dark uses the inset top-highlight technique defined above. Using raw Tailwind shadow
classes breaks this auto-adaptation.
