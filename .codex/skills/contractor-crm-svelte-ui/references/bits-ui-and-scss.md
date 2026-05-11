# Bits UI & SCSS Patterns

> Read this before using any Bits UI primitive or writing SCSS for this project.

---

## Bits UI Component Patterns

Bits UI exposes state through **data attributes**, not CSS classes.
Never invent class-based state selectors.

### Dialog

```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';
  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    <button class="btn-primary">Open</button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Confirm action</Dialog.Title>
      <Dialog.Description>This cannot be undone.</Dialog.Description>
      <div class="dialog-actions">
        <Dialog.Close><button class="btn-ghost">Cancel</button></Dialog.Close>
        <button class="btn-danger" onclick={handleConfirm}>Delete</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Sheet (mobile side-panel / bottom drawer)

```svelte
<script lang="ts">
  import { Sheet } from 'bits-ui';
  let open = $state(false);
</script>

<Sheet.Root bind:open>
  <Sheet.Trigger><button>Open</button></Sheet.Trigger>
  <Sheet.Portal>
    <Sheet.Overlay />
    <Sheet.Content side="bottom">
      <Sheet.Title>Details</Sheet.Title>
      {@render children?.()}
    </Sheet.Content>
  </Sheet.Portal>
</Sheet.Root>
```

### Tabs

```svelte
<script lang="ts">
  import { Tabs } from 'bits-ui';
  let activeTab = $state('timeline');
</script>

<Tabs.Root bind:value={activeTab}>
  <Tabs.List>
    <Tabs.Trigger value="timeline">Timeline</Tabs.Trigger>
    <Tabs.Trigger value="notes">Notes</Tabs.Trigger>
    <Tabs.Trigger value="addresses">Addresses</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="timeline">...</Tabs.Content>
  <Tabs.Content value="notes">...</Tabs.Content>
  <Tabs.Content value="addresses">...</Tabs.Content>
</Tabs.Root>
```

### Select

```svelte
<script lang="ts">
  import { Select } from 'bits-ui';

  // selected is typed as { value, label } — NEVER just the raw value string
  let selected = $state<{ value: string; label: string } | undefined>(undefined);
</script>

<Select.Root
  selected={selected}
  onSelectedChange={(v) => (selected = v)}
>
  <Select.Trigger>
    <Select.Value placeholder="Select status" />
  </Select.Trigger>
  <Select.Content>
    {#each options as opt}
      <Select.Item value={opt.value} label={opt.label} />
    {/each}
  </Select.Content>
</Select.Root>
```

> Use `onSelectedChange` callback instead of `bind:selected` — behaviour has changed
> across Bits UI minor versions. The callback form is stable.

### Switch

```svelte
<script lang="ts">
  import { Switch } from 'bits-ui';
  let checked = $state(false);
</script>

<Switch.Root
  checked={checked}
  onCheckedChange={(v) => (checked = v)}
>
  <Switch.Thumb />
</Switch.Root>
```

> Same as Select — use `onCheckedChange` callback for version stability.

---

## SCSS Data-Attribute Styling

```scss
// ✅ CORRECT — Bits UI exposes state via data attributes

[data-dialog-overlay] {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--z-overlay);
}

[data-dialog-content] {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-6);

  &[data-state='open'] { animation: dialog-in 150ms ease; }
  &[data-state='closed'] { animation: dialog-out 100ms ease; }
}

[data-menu-item] {
  padding: var(--space-2) var(--space-3);
  cursor: pointer;

  &[data-highlighted] { background: var(--color-accent-subtle); }
  &[data-disabled] { opacity: 0.4; pointer-events: none; }
}

[data-tabs-trigger] {
  padding: var(--space-2) var(--space-4);
  border-bottom: 2px solid transparent;

  &[data-state='active'] {
    border-bottom-color: var(--color-accent);
    color: var(--color-accent);
  }
}

[data-toast] {
  &[data-variant='success'] { border-left: 3px solid var(--color-success); }
  &[data-variant='error']   { border-left: 3px solid var(--color-danger); }
  &[data-variant='warning'] { border-left: 3px solid var(--color-warning); }
}

// ❌ WRONG — Bits UI does NOT add class-based state
.dialog.open {}           // won't work
.menu-item.highlighted {} // won't work
```

---

## CSS Custom Properties (from `_variables.scss`)

Always use these — never hardcode values.

```scss
// Colors
var(--color-background)     // page background
var(--color-surface)        // card / panel background
var(--color-foreground)     // primary text
var(--color-muted)          // secondary text
var(--color-accent)         // brand / interactive
var(--color-accent-subtle)  // hover backgrounds
var(--color-danger)         // errors / destructive
var(--color-success)        // positive states
var(--color-warning)        // caution states
var(--color-border)         // dividers and outlines

// Spacing
var(--space-1)  // 4px
var(--space-2)  // 8px
var(--space-3)  // 12px
var(--space-4)  // 16px
var(--space-6)  // 24px
var(--space-8)  // 32px

// Other
var(--radius-sm) var(--radius-md) var(--radius-lg)
var(--font-family-base)
var(--bottom-nav-height)   // ALWAYS add as padding-bottom on main content
var(--z-overlay) var(--z-modal) var(--z-toast)
```

---

## Mobile-First SCSS

90% of users are on mobile. Base styles are always mobile. Desktop overrides go in
`@media (min-width: 768px)`.

```scss
.page {
  padding: var(--space-4);
  padding-bottom: var(--bottom-nav-height); // never skip — bottom nav covers content
}

.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

// Touch targets — every interactive element
.action-button,
.list-item-action,
.nav-item {
  min-height: 44px; // WCAG AA + thumb target minimum
  display: flex;
  align-items: center;
}

// Always include :focus-visible alongside :hover — never hover-only
.button {
  &:hover,
  &:focus-visible {
    background: var(--color-accent);
  }
}
```
