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
<script lang="ts">
  function navItemClass(active: boolean): string {
    return cn(
      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150',
      active
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
    );
  }
</script>

<div class="min-h-screen bg-background">

  <!-- Desktop sidebar (hidden on mobile) -->
  <aside class="
    hidden md:flex
    fixed inset-y-0 left-0 z-50
    w-[var(--sidebar-width)]
    flex-col
    border-r border-border/60 bg-sidebar
  ">
    <!-- Logo / brand lockup -->
    <div class="flex h-[var(--header-height)] items-center gap-2.5 border-b border-border/60 px-4">
      <!-- Logo mark — replace with actual SVG logo -->
      <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <span class="text-xs font-bold">C</span>
      </div>
      <span class="text-sm font-semibold tracking-tight text-foreground">ContractorOS</span>
    </div>

    <!-- Nav links — with section groups -->
    <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-4">

      <!-- MAIN MENU group -->
      <div>
        <p class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Main Menu
        </p>
        <div class="space-y-0.5">
          <a href="/dashboard" class={navItemClass(isActive('/dashboard'))}>
            <LayoutDashboard class="h-4 w-4 shrink-0" />
            <span class="flex-1">Dashboard</span>
          </a>
          <a href="/contacts" class={navItemClass(isActive('/contacts'))}>
            <Users class="h-4 w-4 shrink-0" />
            <span class="flex-1">Contacts</span>
          </a>
          <!-- Add all primary nav items here following the same pattern -->
        </div>
      </div>

      <!-- MANAGEMENT group -->
      <div>
        <p class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Management
        </p>
        <div class="space-y-0.5">
          <a href="/jobs" class={navItemClass(isActive('/jobs'))}>
            <Briefcase class="h-4 w-4 shrink-0" />
            <span class="flex-1">Jobs</span>
          </a>
          <a href="/invoices" class={navItemClass(isActive('/invoices'))}>
            <FileText class="h-4 w-4 shrink-0" />
            <span class="flex-1">Invoices</span>
            <!-- Count badge example -->
            {#if unpaidCount > 0}
              <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {unpaidCount}
              </span>
            {/if}
          </a>
        </div>
      </div>

    </nav>

    <!-- Bottom: user profile -->
    <div class="border-t border-border/60 p-3">
      <button class="
        flex w-full items-center gap-3 rounded-lg px-2 py-2
        transition-colors duration-150 hover:bg-accent
        text-left
      ">
        <!-- Avatar with initials fallback -->
        <div class="
          flex h-8 w-8 shrink-0 items-center justify-center
          rounded-full bg-primary/10 text-primary text-xs font-semibold
        ">
          {memberInitials}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-foreground">{memberName}</p>
          <p class="truncate text-xs text-muted-foreground">{orgName}</p>
        </div>
        <Settings class="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  </aside>

  <!-- Main content — offset by sidebar on desktop, white surface -->
  <main class="
    min-h-screen bg-background
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

## Two-Panel Split Layout (Inbox / Detail Pages)

Use this pattern for: Messages & Inbox, Contact detail with activity feed,
any page that has a list on the left and a detail view on the right.

```svelte
<!-- Two-panel split — desktop only. Mobile: list page → detail page (separate route) -->
<div class="flex h-[calc(100vh-var(--header-height))] overflow-hidden">

  <!-- Left panel: list / conversation index -->
  <div class="
    w-80 shrink-0 flex flex-col
    border-r border-border/60 bg-background
    overflow-hidden
  ">
    <!-- Panel header -->
    <div class="flex items-center justify-between border-b border-border/60 px-4 py-3">
      <h2 class="text-sm font-semibold text-foreground">Messages</h2>
      <Button variant="ghost" size="icon" class="h-7 w-7">
        <Plus class="h-4 w-4" />
      </Button>
    </div>

    <!-- Panel search -->
    <div class="border-b border-border/60 px-3 py-2.5">
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search..."
          class="h-8 pl-8 text-sm bg-muted border-0 focus-visible:ring-1"
        />
      </div>
    </div>

    <!-- List of items — scrollable -->
    <div class="flex-1 overflow-y-auto">
      {#each items as item (item.id)}
        <button
          onclick={() => selectedId = item.id}
          class={cn(
            'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/40',
            'transition-colors duration-150',
            selectedId === item.id
              ? 'bg-primary/5 border-l-2 border-l-primary'
              : 'hover:bg-muted/60'
          )}
        >
          <!-- Avatar -->
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
            {item.initials}
          </div>
          <!-- Content -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-foreground truncate">{item.name}</p>
              <span class="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
            </div>
            <p class="text-xs text-muted-foreground">{item.company}</p>
            <p class="mt-0.5 text-xs text-muted-foreground truncate">{item.preview}</p>
          </div>
          <!-- Unread badge -->
          {#if item.unread > 0}
            <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {item.unread}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Right panel: detail / conversation view -->
  <div class="flex flex-1 flex-col overflow-hidden bg-background">

    {#if selectedItem}
      <!-- Detail header -->
      <div class="flex items-center justify-between border-b border-border/60 px-6 py-3">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
            {selectedItem.initials}
          </div>
          <div>
            <p class="text-sm font-semibold text-foreground">{selectedItem.name}</p>
            <p class="text-xs text-muted-foreground">{selectedItem.company}</p>
          </div>
        </div>
        <!-- Action icons -->
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Phone class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Mail class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground">
            <MoreHorizontal class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Scrollable message area -->
      <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <!-- Messages rendered here -->
      </div>

      <!-- Compose area -->
      <div class="border-t border-border/60 px-4 py-3">
        <div class="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Textarea
            placeholder="Type a message..."
            class="min-h-[36px] max-h-32 flex-1 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
          />
          <Button size="icon" class="h-8 w-8 shrink-0 rounded-lg">
            <Send class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

    {:else}
      <!-- No selection empty state -->
      <div class="flex flex-1 items-center justify-center">
        <div class="text-center">
          <div class="mb-3 flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-muted">
            <MessageSquare class="h-6 w-6 text-muted-foreground" />
          </div>
          <p class="text-sm font-medium text-foreground">Select a conversation</p>
          <p class="mt-1 text-xs text-muted-foreground">Choose from the list on the left</p>
        </div>
      </div>
    {/if}

  </div>
</div>
```

**Mobile behavior for two-panel pages**: On mobile (`< md`), show only the list as a full-page route.
Tapping an item navigates to a separate detail route. Never show both panels stacked on mobile.

---

## Data Table Pattern

Use for: Recent Tasks, Contacts list (desktop), Invoices, Jobs.
Always include: sortable column headers, inline status badges, row hover, action menu.

```svelte
<!-- Full data table component structure -->
<div class="table-container">
  <table class="data-table">
    <thead>
      <tr>
        <!-- Checkbox column -->
        <th class="w-10 px-4">
          <Checkbox
            checked={allSelected}
            onchange={toggleAll}
            class="border-border"
          />
        </th>

        <!-- Sortable column header pattern -->
        <th>
          <button
            onclick={() => toggleSort('name')}
            class="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Name
            <ChevronsUpDown class="h-3 w-3" />
          </button>
        </th>

        <th>Status</th>
        <th>Progress</th>
        <th>Due Date</th>
        <th class="w-10"></th> <!-- Actions column -->
      </tr>
    </thead>

    <tbody>
      {#each rows as row (row.id)}
        <tr>
          <!-- Checkbox -->
          <td class="px-4">
            <Checkbox bind:checked={row.selected} />
          </td>

          <!-- Name + subtitle cell -->
          <td>
            <div class="flex items-center gap-2.5">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                {row.initials}
              </div>
              <div>
                <p class="font-medium text-foreground">{row.name}</p>
                <p class="text-xs text-muted-foreground">{row.subtitle}</p>
              </div>
            </div>
          </td>

          <!-- Status badge -->
          <td>
            <StatusBadge status={row.status} />
          </td>

          <!-- Progress bar + percentage -->
          <td>
            {#if row.progress !== null}
              <div class="flex items-center gap-2">
                <div class="progress-bar-track w-24">
                  <div
                    class={cn(
                      'progress-bar-fill',
                      row.progress === 100 ? 'progress-bar-fill-green' : 'progress-bar-fill-blue'
                    )}
                    style="width: {row.progress}%"
                  />
                </div>
                <span class="text-xs text-muted-foreground">{row.progress}%</span>
              </div>
            {:else}
              <span class="text-xs text-muted-foreground">Not started</span>
            {/if}
          </td>

          <!-- Date -->
          <td>
            <span class={cn(
              'text-sm',
              isPast(row.dueDate) ? 'text-destructive' : 'text-foreground'
            )}>
              {formatDate(row.dueDate)}
            </span>
          </td>

          <!-- Row action menu -->
          <td class="px-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal class="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-40">
                <DropdownMenu.Item>Edit</DropdownMenu.Item>
                <DropdownMenu.Item>View</DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item class="text-destructive">Delete</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- Table toolbar (above the table) -->
<div class="mb-3 flex items-center justify-between">
  <h3 class="text-sm font-semibold text-foreground">Recent Tasks</h3>
  <div class="flex items-center gap-2">
    <div class="relative">
      <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input placeholder="Search..." class="h-8 w-48 pl-8 text-sm" />
    </div>
    <Button variant="outline" size="sm" class="h-8 gap-1.5 text-muted-foreground">
      <Filter class="h-3.5 w-3.5" />
      Filter
    </Button>
  </div>
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
