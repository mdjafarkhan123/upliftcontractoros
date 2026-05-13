# Component Aesthetics — Contractor Growth OS

> Read this for how specific components should look and feel.
> All components use shadcn-svelte from `$lib/components/ui/*`.
> All class composition uses `cn()` from `$lib/utils`.

---

## Surface Hierarchy

Three layers. Every element must sit on one of these:

```
Layer 0 — Page (bg-background)        ← deepest, darkest
Layer 1 — Card / Panel (bg-card)      ← one step lighter, bordered
Layer 2 — Popover / Modal (bg-popover + backdrop-blur)  ← floats above
```

Never put a card inside a card of the same background. If nesting is needed, use `bg-muted` for the inner.

---

## Card Patterns

### Standard List Card (contacts, jobs, invoices)

```svelte
<div class="
  group
  flex items-center gap-4
  rounded-lg border border-border/50 bg-card px-4 py-3
  cursor-pointer
  transition-all duration-150 ease-out
  hover:border-border hover:bg-accent/30 hover:shadow-sm
">
  <!-- Avatar -->
  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
    JS
  </div>

  <!-- Content -->
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium text-foreground">Jane Smith</p>
    <p class="truncate text-xs text-muted-foreground">jane@example.com · +1 555 0100</p>
  </div>

  <!-- Right side: status + chevron -->
  <div class="flex shrink-0 items-center gap-3">
    <Badge class="bg-green-500/10 text-green-400 border-green-500/20">Active</Badge>
    <ChevronRight class="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
  </div>
</div>
```

### Stat Card (dashboard KPIs)

```svelte
<Card.Root class="
  relative overflow-hidden
  border-border/50
  transition-all duration-200 ease-out
  hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 hover:border-border
  cursor-default
">
  <!-- Subtle gradient accent top edge -->
  <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

  <Card.Content class="p-5">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Revenue
        </p>
        <p class="mt-2 text-3xl font-bold tracking-tight text-foreground">
          $24,500
        </p>
        <p class="mt-1 flex items-center gap-1 text-xs text-green-400">
          <TrendingUp class="h-3 w-3" />
          +12.5% from last month
        </p>
      </div>
      <!-- Icon container -->
      <div class="rounded-lg bg-primary/10 p-2.5">
        <DollarSign class="h-5 w-5 text-primary" />
      </div>
    </div>
  </Card.Content>
</Card.Root>
```

### Detail Card (contact detail, job detail)

```svelte
<Card.Root class="border-border/50">
  <Card.Header class="pb-3">
    <div class="flex items-center justify-between">
      <Card.Title class="text-base font-semibold">Contact Details</Card.Title>
      <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground">
        <Pencil class="h-4 w-4" />
      </Button>
    </div>
  </Card.Header>
  <Separator />
  <Card.Content class="pt-4">
    <!-- Field rows -->
    <div class="space-y-3">
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Phone</span>
        <span class="font-medium text-foreground">+1 555 0100</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Email</span>
        <span class="font-medium text-foreground">jane@example.com</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Status</span>
        <Badge class="bg-green-500/10 text-green-400 border-green-500/20 text-xs">Active</Badge>
      </div>
    </div>
  </Card.Content>
</Card.Root>
```

---

## Dialog & Sheet

### Confirm Dialog — Danger variant

```svelte
<Dialog.Content class="
  border-border/50 bg-card
  shadow-xl shadow-black/40
  sm:max-w-[400px]
">
  <Dialog.Header>
    <div class="flex items-center gap-3">
      <!-- Icon badge for danger -->
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle class="h-5 w-5 text-destructive" />
      </div>
      <div>
        <Dialog.Title class="text-base font-semibold">Delete Contact</Dialog.Title>
        <Dialog.Description class="text-sm text-muted-foreground">
          This cannot be undone.
        </Dialog.Description>
      </div>
    </div>
  </Dialog.Header>
  <Dialog.Footer class="mt-2">
    <Dialog.Close>
      <Button variant="outline" class="border-border/50">Cancel</Button>
    </Dialog.Close>
    <Button variant="destructive" onclick={handleDelete}>Delete</Button>
  </Dialog.Footer>
</Dialog.Content>
```

### Bottom Sheet — Mobile action drawer

```svelte
<Sheet.Content side="bottom" class="
  rounded-t-2xl border-border/50 bg-card
  px-0 pb-safe
">
  <!-- Pull handle -->
  <div class="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" />

  <Sheet.Header class="px-6 pt-4 pb-2">
    <Sheet.Title class="text-base font-semibold">More Options</Sheet.Title>
  </Sheet.Header>

  <!-- Action list -->
  <div class="flex flex-col px-2 pb-4">
    <!-- action item pattern -->
    <button class="
      flex items-center gap-3 rounded-lg px-4 py-3
      text-sm text-foreground
      transition-colors duration-150
      hover:bg-accent
    ">
      <Pencil class="h-4 w-4 text-muted-foreground" />
      Edit contact
    </button>

    <!-- Danger action -->
    <button class="
      flex items-center gap-3 rounded-lg px-4 py-3
      text-sm text-destructive
      transition-colors duration-150
      hover:bg-destructive/10
    ">
      <Trash2 class="h-4 w-4" />
      Delete contact
    </button>
  </div>
</Sheet.Content>
```

---

## Badge Variants — Status System

Always use these exact class combinations. Never use shadcn's default Badge variants for status — override with these.

```svelte
<!-- Status badge helper pattern — build a StatusBadge component -->
<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';

  type Status = 'active' | 'lead' | 'inactive' | 'pending' | 'overdue' | 'draft' | 'paid' | 'sent' | 'accepted' | 'declined';

  let { status } = $props<{ status: Status }>();

  const statusConfig: Record<Status, { label: string; classes: string }> = {
    active:   { label: 'Active',   classes: 'bg-green-500/10 text-green-400 border-green-500/20' },
    lead:     { label: 'Lead',     classes: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    inactive: { label: 'Inactive', classes: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
    pending:  { label: 'Pending',  classes: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    overdue:  { label: 'Overdue',  classes: 'bg-red-500/10 text-red-400 border-red-500/20' },
    draft:    { label: 'Draft',    classes: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
    paid:     { label: 'Paid',     classes: 'bg-green-500/10 text-green-400 border-green-500/20' },
    sent:     { label: 'Sent',     classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    accepted: { label: 'Accepted', classes: 'bg-green-500/10 text-green-400 border-green-500/20' },
    declined: { label: 'Declined', classes: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };

  const config = statusConfig[status] ?? { label: status, classes: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' };
</script>

<Badge class={cn('border text-xs font-medium', config.classes)}>
  {config.label}
</Badge>
```

---

## Form Field Aesthetics

```svelte
<!-- Field wrapper -->
<div class="space-y-1.5">
  <Label for="name" class="text-sm font-medium text-foreground">
    Full name <span class="text-destructive">*</span>
  </Label>
  <Input
    id="name"
    type="text"
    placeholder="Jane Smith"
    bind:value={form.full_name}
    class={cn(
      'bg-card border-border/50',
      'focus:border-primary focus:ring-primary/20',
      'placeholder:text-muted-foreground/50',
      errors.full_name && 'border-destructive/50 focus:border-destructive focus:ring-destructive/20'
    )}
  />
  {#if errors.full_name}
    <p class="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle class="h-3 w-3" />
      {errors.full_name}
    </p>
  {/if}
</div>
```

---

## Navigation — Bottom Nav (Mobile)

```svelte
<nav class="
  fixed bottom-0 inset-x-0 z-50
  flex items-center justify-around
  h-[var(--bottom-nav-height)] px-2
  bg-card/95 backdrop-blur-xl
  border-t border-border/50
  safe-area-pb
">
  <!-- Nav item pattern -->
  <a
    href="/dashboard"
    class={cn(
      'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 min-h-[44px] justify-center',
      'text-xs font-medium transition-colors duration-150',
      isActive('/dashboard')
        ? 'text-primary'
        : 'text-muted-foreground hover:text-foreground'
    )}
  >
    <LayoutDashboard class={cn('h-5 w-5', isActive('/dashboard') && 'text-primary')} />
    Dashboard
  </a>
</nav>
```

---

## Empty State — Designed

```svelte
<!-- src/lib/components/shared/EmptyState.svelte -->
<div class="flex flex-col items-center justify-center py-16 px-6 text-center">
  <!-- Icon container -->
  <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
    <Users class="h-7 w-7 text-muted-foreground" />
  </div>

  <h3 class="text-base font-semibold text-foreground">{title}</h3>

  {#if description}
    <p class="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</p>
  {/if}

  {#if actionLabel && onAction}
    <Button onclick={onAction} class="mt-6" size="default">
      {actionLabel}
    </Button>
  {/if}
</div>
```

---

## Page Header Pattern

```svelte
<!-- Sticky header with blur (inside PageWrapper) -->
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

  <!-- Right side actions slot -->
  {@render actions?.()}
</header>
```
