# Color System — Contractor Growth OS

> This reference was copied from the old Claude skill and may mention Tailwind, shadcn-svelte,
> and `app.css`. For this repo, `AGENTS.md` is authoritative: use SCSS, CSS custom properties,
> and shared tokens under `src/lib/styles/`. Translate utility-class examples into SCSS selectors.
>
> This is the authoritative color definition for the entire project.
> Replace the contents of `src/lib/styles/app.css` with the system below.
> Light mode is the default (`:root`). Dark mode is applied via `.dark` class on `<html>`.
> Never use raw hex values. Always use the semantic Tailwind classes from these CSS variables.
> The sidebar surface (`--sidebar`) is a separate token from `--background` —
> always use `bg-sidebar` for the left sidebar so it reads as a distinct panel.

---

## Full `app.css` — Replace Entirely

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─── Geist Font ──────────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

@layer base {

  /* ═══════════════════════════════════════════════════════════════════
     LIGHT MODE — DEFAULT  (the primary experience)
     Target: clean white + soft gray — like Linear, Craft, Notion
  ═══════════════════════════════════════════════════════════════════ */
  :root {
    /* ── Surfaces ───────────────────────────────────────────────── */
    --background:         0 0% 100%;        /* #FFFFFF — main content area */
    --sidebar:            220 14% 96%;      /* #F4F5F7 — left sidebar panel */
    --card:               0 0% 100%;        /* #FFFFFF — cards sit on white */
    --card-raised:        0 0% 98%;         /* #FAFAFA — slightly lifted card */
    --popover:            0 0% 100%;        /* #FFFFFF — dropdowns */
    --muted:              220 14% 96%;      /* #F4F5F7 — subtle bg, empty states */
    --accent:             220 14% 93%;      /* #ECEEF2 — hover bg on list rows */
    --secondary:          220 14% 93%;      /* same as accent */

    /* ── Brand Primary — Indigo ─────────────────────────────────── */
    --primary:            239 84% 60%;      /* indigo-600 */
    --primary-foreground: 0 0% 100%;

    /* ── Text ───────────────────────────────────────────────────── */
    --foreground:         222 47% 11%;      /* #0F172A — slate-900, primary text */
    --card-foreground:    222 47% 11%;
    --popover-foreground: 222 47% 11%;
    --muted-foreground:   215 16% 47%;      /* #64748B — slate-500, secondary text */
    --accent-foreground:  222 47% 11%;
    --secondary-foreground: 222 47% 11%;

    /* ── Semantic ───────────────────────────────────────────────── */
    --destructive:        0 84% 60%;        /* red-500 */
    --destructive-foreground: 0 0% 100%;

    /* ── Borders & Inputs ───────────────────────────────────────── */
    --border:             220 13% 91%;      /* #E2E8F0 — slate-200, very soft */
    --input:              220 13% 91%;
    --ring:               239 84% 60%;      /* indigo-600 focus ring */

    /* ── Radius ─────────────────────────────────────────────────── */
    --radius:             0.5rem;

    /* ── Layout dimensions ──────────────────────────────────────── */
    --bottom-nav-height:  64px;
    --sidebar-width:      240px;
    --header-height:      56px;
    --content-max-width:  768px;

    /* ── Status colors ──────────────────────────────────────────── */
    --status-active:      142 71% 45%;      /* green-500 */
    --status-pending:     38 92% 50%;       /* amber-500 */
    --status-inactive:    215 20% 65%;      /* slate-400 */
    --status-overdue:     0 84% 60%;        /* red-500 */
    --status-lead:        199 89% 48%;      /* sky-500 */
    --status-draft:       215 20% 65%;      /* slate-400 */

    /* ── Shadow tokens ──────────────────────────────────────────── */
    --shadow-card:        0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06);
    --shadow-dropdown:    0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06);
    --shadow-modal:       0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.08);
  }

  /* ═══════════════════════════════════════════════════════════════════
     DARK MODE  — applied via .dark class on <html>
     Equally polished. Deep zinc-950 base, layered surfaces.
  ═══════════════════════════════════════════════════════════════════ */
  .dark {
    /* ── Surfaces ───────────────────────────────────────────────── */
    --background:         224 71% 4%;       /* #050A14 — deepest, page bg */
    --sidebar:            222 47% 6%;       /* #090E1A — sidebar slightly lighter */
    --card:               222 47% 8%;       /* #0D1526 — card surface */
    --card-raised:        222 47% 10%;      /* #111D33 — raised card */
    --popover:            222 47% 8%;       /* same as card */
    --muted:              215 28% 12%;      /* subtle bg */
    --accent:             215 28% 14%;      /* hover bg */
    --secondary:          215 28% 14%;

    /* ── Brand Primary ──────────────────────────────────────────── */
    --primary:            239 84% 67%;      /* indigo-500 — brighter on dark */
    --primary-foreground: 0 0% 100%;

    /* ── Text ───────────────────────────────────────────────────── */
    --foreground:         210 40% 96%;      /* near-white */
    --card-foreground:    210 40% 96%;
    --popover-foreground: 210 40% 96%;
    --muted-foreground:   215 20% 55%;      /* zinc-400 */
    --accent-foreground:  210 40% 96%;
    --secondary-foreground: 210 40% 96%;

    /* ── Semantic ───────────────────────────────────────────────── */
    --destructive:        0 72% 51%;
    --destructive-foreground: 0 0% 100%;

    /* ── Borders & Inputs ───────────────────────────────────────── */
    --border:             215 28% 17%;      /* subtle dark border */
    --input:              215 28% 17%;
    --ring:               239 84% 67%;

    /* ── Shadow tokens (dark — more diffuse) ────────────────────── */
    --shadow-card:        0 1px 3px 0 rgb(0 0 0 / 0.30), 0 1px 2px -1px rgb(0 0 0 / 0.20);
    --shadow-dropdown:    0 4px 6px -1px rgb(0 0 0 / 0.40), 0 2px 4px -2px rgb(0 0 0 / 0.30);
    --shadow-modal:       0 20px 25px -5px rgb(0 0 0 / 0.50), 0 8px 10px -6px rgb(0 0 0 / 0.40);
  }
}

@layer base {
  * {
    @apply border-border;
  }

  html {
    font-family: 'Geist', 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply bg-background text-foreground;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }

  /* ── Scrollbar — thin, themed ───────────────────────────────── */
  ::-webkit-scrollbar       { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { @apply bg-transparent; }
  ::-webkit-scrollbar-thumb { @apply bg-border rounded-full; }
  ::-webkit-scrollbar-thumb:hover { @apply bg-muted-foreground/40; }
}

/* ─── Shimmer animation ──────────────────────────────────────────── */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--accent)) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* ─── Status dot ─────────────────────────────────────────────────── */
.status-dot {
  @apply inline-block w-1.5 h-1.5 rounded-full shrink-0;
}
.status-dot-active   { background: hsl(var(--status-active));   }
.status-dot-pending  { background: hsl(var(--status-pending));  }
.status-dot-inactive { background: hsl(var(--status-inactive)); }
.status-dot-overdue  { background: hsl(var(--status-overdue));  }
.status-dot-lead     { background: hsl(var(--status-lead));     }
.status-dot-draft    { background: hsl(var(--status-draft));    }

/* ─── Focus visible ──────────────────────────────────────────────── */
:focus-visible {
  @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background;
}

/* ─── Table base styles ──────────────────────────────────────────── */
.table-container {
  @apply w-full overflow-x-auto rounded-lg border border-border/60;
}
.data-table {
  @apply w-full text-sm;
}
.data-table thead tr {
  @apply border-b border-border/60 bg-muted/40;
}
.data-table thead th {
  @apply px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground;
}
.data-table tbody tr {
  @apply border-b border-border/40 transition-colors duration-150;
}
.data-table tbody tr:last-child {
  @apply border-b-0;
}
.data-table tbody tr:hover {
  @apply bg-muted/40;
}
.data-table tbody td {
  @apply px-4 py-3 text-sm text-foreground;
}

/* ─── Progress bar ───────────────────────────────────────────────── */
.progress-bar-track {
  @apply h-1.5 w-full overflow-hidden rounded-full bg-muted;
}
.progress-bar-fill {
  @apply h-full rounded-full transition-all duration-300;
}
.progress-bar-fill-blue   { @apply bg-blue-500; }
.progress-bar-fill-green  { @apply bg-green-500; }
.progress-bar-fill-yellow { @apply bg-yellow-500; }
.progress-bar-fill-red    { @apply bg-red-500; }
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
<Badge class={cn(
  status === 'active'   && 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
  status === 'lead'     && 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  status === 'inactive' && 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
  status === 'overdue'  && 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  status === 'pending'  && 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20',
  status === 'draft'    && 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
)}>
  <span class={cn('status-dot mr-1.5', `status-dot-${status}`)} />
  {status}
</Badge>
```

### Primary colour usage

```svelte
<!-- Primary action button (shadcn Button default variant handles this) -->
<Button variant="default">Save</Button>

<!-- Primary text link / highlight -->
<span class="text-primary">View details</span>

<!-- Primary subtle bg (e.g. selected nav item) -->
<div class="bg-primary/10 text-primary rounded-md px-3 py-2">

<!-- Focus ring — automatically applied via :focus-visible in app.css -->
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

## tailwind.config.ts — Extend with These

Ensure these are present in `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        sidebar:     'hsl(var(--sidebar))',
        'card-raised': 'hsl(var(--card-raised))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card:     'var(--shadow-card)',
        dropdown: 'var(--shadow-dropdown)',
        modal:    'var(--shadow-modal)',
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
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

Never use `shadow-xl` or `shadow-2xl` directly. The semantic tokens automatically
adjust their intensity between light and dark modes via CSS custom properties.
