# Layout Patterns — Contractor Growth OS

> Read this when building page layouts, the app shell, sidebar nav, or command palette.
> Mobile-first always. Base = 375px. Desktop breakpoint = md (768px).

---

## App Shell — Responsive Layout

The app has **two navigation modes**:
- **Mobile** (< 768px): Fixed bottom nav + full-width content
- **Desktop** (≥ 768px): Sticky left sidebar + content with left margin

```svelte
<!-- src/routes/(app)/+layout.svelte — Shell structure -->
<div class="min-h-screen bg-background">

  <!-- Desktop sidebar (hidden on mobile) -->
  <aside class="
    hidden md:flex
    fixed inset-y-0 left-0 z-50
    w-[var(--sidebar-width)]
    flex-col
    border-r border-border/50 bg-card/50 backdrop-blur-xl
  ">
    <!-- Logo / brand -->
    <div class="flex h-[var(--header-height)] items-center border-b border-border/50 px-5">
      <span class="text-base font-bold tracking-tight text-foreground">
        ContractorOS
      </span>
    </div>

    <!-- Nav links -->
    <nav class="flex-1 overflow-y-auto px-3 py-4">
      <div class="space-y-1">
        <!-- Nav item — see component-aesthetics.md for full nav item pattern -->
        <a href="/dashboard" class="sidebar-nav-item">
          <LayoutDashboard class="h-4 w-4" />
          Dashboard
        </a>
      </div>
    </nav>

    <!-- Bottom: user / org info -->
    <div class="border-t border-border/50 p-3">
      <!-- member avatar + name + settings link -->
    </div>
  </aside>

  <!-- Main content — offset by sidebar on desktop -->
  <main class="
    min-h-screen
    md:ml-[var(--sidebar-width)]
    pb-[var(--bottom-nav-height)]
    md:pb-0
  ">
    {@render children()}
  </main>

  <!-- Mobile bottom nav (hidden on desktop) -->
  <nav class="md:hidden fixed bottom-0 inset-x-0 z-50 ...">
    <!-- see component-aesthetics.md -->
  </nav>
</div>
```

### Sidebar Nav Item

```svelte
<!-- Add this to app.css as a @layer component, or inline in sidebar -->
<a
  href={href}
  class={cn(
    'flex items-center gap-3 rounded-md px-3 py-2',
    'text-sm font-medium',
    'transition-colors duration-150',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  )}
>
  <Icon class="h-4 w-4 shrink-0" />
  {label}
  {#if badge}
    <span class="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      {badge}
    </span>
  {/if}
</a>
```

---

## Page Wrapper — Standard Page Layout

```svelte
<!-- src/lib/components/shared/PageWrapper.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, subtitle, children, actions } = $props<{
    title: string;
    subtitle?: string;
    children: Snippet;
    actions?: Snippet;
  }>();
</script>

<div class="flex flex-col min-h-full">
  <!-- Sticky page header -->
  <header class="
    sticky top-0 z-40
    flex items-center justify-between
    h-[var(--header-height)] px-4
    bg-background/80 backdrop-blur-xl
    border-b border-border/50
  ">
    <div>
      <h1 class="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
      {#if subtitle}
        <p class="text-xs text-muted-foreground">{subtitle}</p>
      {/if}
    </div>
    {#if actions}
      <div class="flex items-center gap-2">
        {@render actions()}
      </div>
    {/if}
  </header>

  <!-- Page content -->
  <div class="flex-1 px-4 py-4">
    {@render children()}
  </div>
</div>
```

---

## Content Grids

```svelte
<!-- Dashboard — 2-col on desktop, 1-col on mobile -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
  <!-- stat cards -->
</div>

<!-- Stat cards row — 2-col mobile, 4-col desktop -->
<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
  <!-- KPI cards -->
</div>

<!-- Detail page — full width list, sidebar on desktop -->
<div class="flex flex-col gap-4 md:flex-row md:items-start">
  <!-- Main content -->
  <div class="flex-1 min-w-0 space-y-4">
    <!-- primary content -->
  </div>
  <!-- Side panel (desktop only) -->
  <aside class="w-full md:w-72 shrink-0 space-y-4">
    <!-- metadata cards -->
  </aside>
</div>
```

---

## Command Palette (Cmd+K)

Add a global command palette using shadcn-svelte's `Command` component.
This is the biggest single UX upgrade for power users.

```svelte
<!-- src/lib/components/shared/CommandPalette.svelte -->
<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import * as Dialog from '$lib/components/ui/dialog';
  import { goto } from '$app/navigation';

  let open = $state(false);

  // Keyboard shortcut
  $effect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open = !open;
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });

  function navigate(href: string) {
    open = false;
    goto(href);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="p-0 shadow-2xl border-border/50 sm:max-w-[550px] overflow-hidden">
    <Command.Root class="rounded-lg bg-card">
      <Command.Input placeholder="Search or jump to..." class="border-0 ring-0 text-base h-14" />
      <Command.List class="max-h-[400px]">
        <Command.Empty class="py-8 text-center text-sm text-muted-foreground">
          No results found.
        </Command.Empty>

        <Command.Group heading="Navigate">
          <Command.Item onselect={() => navigate('/dashboard')}>
            <LayoutDashboard class="mr-2 h-4 w-4" />
            Dashboard
          </Command.Item>
          <Command.Item onselect={() => navigate('/contacts')}>
            <Users class="mr-2 h-4 w-4" />
            Contacts
          </Command.Item>
          <Command.Item onselect={() => navigate('/jobs')}>
            <Briefcase class="mr-2 h-4 w-4" />
            Jobs
          </Command.Item>
        </Command.Group>

        <Command.Separator />

        <Command.Group heading="Create">
          <Command.Item onselect={() => navigate('/contacts/new')}>
            <Plus class="mr-2 h-4 w-4" />
            New Contact
          </Command.Item>
          <Command.Item onselect={() => navigate('/jobs/new')}>
            <Plus class="mr-2 h-4 w-4" />
            New Job
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Dialog.Content>
</Dialog.Root>
```

Mount in `(app)/+layout.svelte`:
```svelte
<CommandPalette />
```

Trigger button in header (desktop):
```svelte
<button
  onclick={() => (commandOpen = true)}
  class="
    hidden md:flex items-center gap-2
    rounded-md border border-border/50 bg-muted
    px-3 py-1.5 text-sm text-muted-foreground
    transition-colors hover:bg-accent hover:text-foreground
  "
>
  <Search class="h-3.5 w-3.5" />
  Search...
  <kbd class="ml-4 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono bg-background">
    ⌘K
  </kbd>
</button>
```

---

## Infinite Scroll / Load More

```svelte
<!-- At the bottom of a list page -->
{#if nextCursor}
  <div class="flex justify-center pt-4 pb-2">
    <Button
      variant="outline"
      size="sm"
      onclick={loadMore}
      disabled={loading}
      class="border-border/50 text-muted-foreground hover:text-foreground"
    >
      {#if loading}
        <svg class="mr-2 h-3.5 w-3.5 animate-spin" ...></svg>
        Loading...
      {:else}
        Load more
      {/if}
    </Button>
  </div>
{/if}
```

---

## Section Dividers with Labels

```svelte
<!-- Labelled section divider -->
<div class="flex items-center gap-3 my-4">
  <div class="h-px flex-1 bg-border/50"></div>
  <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground px-2">
    Today
  </span>
  <div class="h-px flex-1 bg-border/50"></div>
</div>
```

---

## Safe Area (iOS notch / home bar)

```svelte
<!-- Bottom nav — handle iPhone home indicator -->
<nav class="
  fixed bottom-0 inset-x-0
  pb-[env(safe-area-inset-bottom)]
  ...
">

<!-- Page content — avoid overlap with bottom nav -->
<div class="pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]">
```

Ensure `app.css` has:
```css
:root {
  --bottom-nav-height: 64px;
}
```
