# Color System — Contractor Growth OS

> This is the authoritative color definition for the entire project.
> Replace the contents of `src/lib/styles/app.css` with this system.
> Never use raw hex values anywhere. Always use the semantic Tailwind classes
> derived from these CSS custom properties.

---

## Full `app.css` — Replace Entirely

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─── Geist Font ──────────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

@layer base {
  /* ─── Dark Mode (default) ─────────────────────────────────────────── */
  :root {
    /* Backgrounds — layered surface system */
    --background:       224 71% 4%;      /* zinc-950 tinted navy — page bg */
    --card:             222 47% 8%;      /* zinc-900 tinted — card surface */
    --popover:          222 47% 8%;      /* same as card */
    --muted:            215 28% 12%;     /* subtle bg for empty states, disabled */
    --accent:           215 28% 14%;     /* hover / selected bg */
    --secondary:        215 28% 14%;     /* secondary button bg */

    /* Brand Primary — Indigo/Violet */
    --primary:          239 84% 67%;     /* indigo-500 */
    --primary-foreground: 0 0% 100%;

    /* Text */
    --foreground:       210 40% 96%;     /* near-white — primary text */
    --card-foreground:  210 40% 96%;
    --popover-foreground: 210 40% 96%;
    --muted-foreground: 215 20% 55%;     /* zinc-400 — secondary/helper text */
    --accent-foreground: 210 40% 96%;
    --secondary-foreground: 210 40% 96%;

    /* Semantic */
    --destructive:      0 72% 51%;       /* red-600 */
    --destructive-foreground: 0 0% 100%;

    /* Borders & Inputs */
    --border:           215 28% 17%;     /* subtle dark border */
    --input:            215 28% 17%;
    --ring:             239 84% 67%;     /* indigo — focus ring */

    /* Radius */
    --radius: 0.5rem;

    /* App layout */
    --bottom-nav-height: 64px;
    --sidebar-width: 240px;
    --header-height: 56px;
    --content-max-width: 768px;

    /* Status colours (semantic — used by Badge, status dots) */
    --status-active:    142 71% 45%;     /* green-500 */
    --status-pending:   45 93% 47%;      /* yellow-500 */
    --status-inactive:  215 20% 45%;     /* zinc-500 */
    --status-overdue:   0 72% 51%;       /* red-600 */
    --status-lead:      199 89% 48%;     /* sky-500 */
    --status-draft:     215 20% 45%;     /* zinc-500 */
  }

  /* ─── Light Mode Override ─────────────────────────────────────────── */
  .light {
    --background:       0 0% 100%;
    --card:             0 0% 98%;
    --popover:          0 0% 100%;
    --muted:            210 40% 96%;
    --accent:           210 40% 94%;
    --secondary:        210 40% 94%;

    --primary:          239 84% 60%;
    --primary-foreground: 0 0% 100%;

    --foreground:       222 47% 11%;
    --card-foreground:  222 47% 11%;
    --popover-foreground: 222 47% 11%;
    --muted-foreground: 215 16% 47%;
    --accent-foreground: 222 47% 11%;
    --secondary-foreground: 222 47% 11%;

    --destructive:      0 72% 51%;
    --destructive-foreground: 0 0% 100%;

    --border:           214 32% 91%;
    --input:            214 32% 91%;
    --ring:             239 84% 60%;
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

  /* Scrollbar — dark themed */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { @apply bg-transparent; }
  ::-webkit-scrollbar-thumb { @apply bg-border rounded-full; }
  ::-webkit-scrollbar-thumb:hover { @apply bg-muted-foreground/50; }
}

/* ─── Shimmer animation (SkeletonLoader) ──────────────────────────── */
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

/* ─── Status dot (used inline next to status text) ───────────────── */
.status-dot {
  @apply inline-block w-2 h-2 rounded-full;
}
.status-dot-active   { background: hsl(var(--status-active)); }
.status-dot-pending  { background: hsl(var(--status-pending)); }
.status-dot-inactive { background: hsl(var(--status-inactive)); }
.status-dot-overdue  { background: hsl(var(--status-overdue)); }
.status-dot-lead     { background: hsl(var(--status-lead)); }
.status-dot-draft    { background: hsl(var(--status-draft)); }

/* ─── Focus visible global override ──────────────────────────────── */
:focus-visible {
  @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background;
}
```

---

## Semantic Tailwind Classes — Usage Guide

### When to use which background

```svelte
<!-- Page root — darkest layer -->
<div class="min-h-screen bg-background">

<!-- Card / panel — one step lighter -->
<Card.Root class="bg-card border-border/50">

<!-- Hover state on list row -->
<div class="hover:bg-accent/50 transition-colors duration-150">

<!-- Subtle section / empty state area -->
<div class="bg-muted rounded-lg p-6">

<!-- Selected / active item -->
<div class="bg-accent text-accent-foreground">
```

### Status colour usage

```svelte
<!-- Status badge — always use Badge component -->
<Badge class={cn(
  status === 'active'   && 'bg-green-500/10 text-green-400 border-green-500/20',
  status === 'lead'     && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  status === 'inactive' && 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  status === 'overdue'  && 'bg-red-500/10 text-red-400 border-red-500/20',
  status === 'pending'  && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  status === 'draft'    && 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
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
<div class="border border-border/50 rounded-lg">

<!-- Stronger divider -->
<div class="border-t border-border">

<!-- Very subtle inner border (dark surfaces, glassmorphism) -->
<div class="border border-white/5">

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
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
```
