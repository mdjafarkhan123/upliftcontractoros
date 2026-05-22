# Legacy Component Pattern Notes

> This file was copied from the old Claude skill and still contains shadcn-svelte/Tailwind examples.
> For this repo, `AGENTS.md` is authoritative: use Bits UI primitives, SCSS, CSS custom properties,
> mobile-first layouts, and data-attribute styling. Do not introduce Tailwind classes or shadcn-svelte.
> Treat examples below as legacy interaction/composition notes only, and translate them into Bits UI + SCSS.
> All components live in `$lib/components/ui/*` — never import from `bits-ui` directly.
> Use `cn()` from `$lib/utils` for all conditional/merged class strings.

---

## cn() Utility — Always Use for Class Composition

```typescript
import { cn } from '$lib/utils';

// Merging base + conditional + override classes
<div class={cn(
  'flex items-center gap-2 rounded-md px-3 py-2',
  isActive && 'bg-accent text-accent-foreground',
  isDisabled && 'opacity-50 pointer-events-none',
  className   // always accept + forward a className prop
)} />
```

Never concatenate class strings manually. `cn()` handles Tailwind class conflicts
correctly via `tailwind-merge` under the hood.

---

## Component Patterns

### Button

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
</script>

<Button variant="default">Save</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">View</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="link">Link</Button>

<!-- Size -->
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconTrash /></Button>

<!-- Loading state -->
<Button disabled={saving}>
	{#if saving}<Spinner class="mr-2 h-4 w-4 animate-spin" />{/if}
	{saving ? 'Saving…' : 'Save'}
</Button>
```

### Input & Label

```svelte
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
</script>

<div class="flex flex-col gap-1.5">
	<Label for="name">Full name</Label>
	<Input id="name" type="text" placeholder="Jane Smith" bind:value={name} />
</div>
```

### Textarea

```svelte
<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
</script>

<Textarea placeholder="Notes…" bind:value={notes} rows={4} />
```

### Dialog

```svelte
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		<Button variant="outline">Open</Button>
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Confirm action</Dialog.Title>
			<Dialog.Description>This cannot be undone.</Dialog.Description>
		</Dialog.Header>
		<div class="py-4">
			<!-- body content -->
		</div>
		<Dialog.Footer>
			<Dialog.Close>
				<Button variant="outline">Cancel</Button>
			</Dialog.Close>
			<Button variant="destructive" onclick={handleConfirm}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
```

### Sheet (mobile side-panel / bottom drawer)

```svelte
<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';

	let open = $state(false);
</script>

<Sheet.Root bind:open>
	<Sheet.Trigger>
		<Button variant="ghost">Open</Button>
	</Sheet.Trigger>
	<Sheet.Content side="bottom">
		<Sheet.Header>
			<Sheet.Title>Details</Sheet.Title>
			<Sheet.Description>View and edit record.</Sheet.Description>
		</Sheet.Header>
		<div class="px-4 pb-6">
			{@render children?.()}
		</div>
	</Sheet.Content>
</Sheet.Root>
```

> `side` accepts `"top" | "bottom" | "left" | "right"`. Use `"bottom"` for mobile drawers.

### Tabs

```svelte
<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';

	let activeTab = $state('timeline');
</script>

<Tabs.Root bind:value={activeTab}>
	<Tabs.List class="w-full">
		<Tabs.Trigger value="timeline" class="flex-1">Timeline</Tabs.Trigger>
		<Tabs.Trigger value="notes" class="flex-1">Notes</Tabs.Trigger>
		<Tabs.Trigger value="addresses" class="flex-1">Addresses</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="timeline" class="mt-4">...</Tabs.Content>
	<Tabs.Content value="notes" class="mt-4">...</Tabs.Content>
	<Tabs.Content value="addresses" class="mt-4">...</Tabs.Content>
</Tabs.Root>
```

### Select

```svelte
<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	let value = $state('');
</script>

<Select.Root bind:value>
	<Select.Trigger class="w-full">
		<Select.Value placeholder="Select status" />
	</Select.Trigger>
	<Select.Content>
		{#each options as opt}
			<Select.Item value={opt.value}>{opt.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
```

> `bind:value` holds the raw string value — no `{ value, label }` wrapper needed
> (this differs from raw Bits UI — shadcn-svelte normalises this).

### Switch

```svelte
<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';

	let checked = $state(false);
</script>

<div class="flex items-center gap-2">
	<Switch bind:checked id="notifications" />
	<Label for="notifications">Enable notifications</Label>
</div>
```

### Checkbox

```svelte
<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	let checked = $state(false);
</script>

<div class="flex items-center gap-2">
	<Checkbox bind:checked id="agree" />
	<Label for="agree">I agree to the terms</Label>
</div>
```

### Badge

```svelte
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
</script>

<Badge variant="default">Active</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="destructive">Overdue</Badge>
<Badge variant="outline">Draft</Badge>
```

### Card

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Job #1042</Card.Title>
		<Card.Description>Roof replacement — 14 Feb 2025</Card.Description>
	</Card.Header>
	<Card.Content>
		<!-- body -->
	</Card.Content>
	<Card.Footer class="flex justify-end gap-2">
		<Button variant="outline">Edit</Button>
		<Button>View</Button>
	</Card.Footer>
</Card.Root>
```

### Separator

```svelte
import {Separator} from '$lib/components/ui/separator';

<Separator /> // horizontal
<Separator orientation="vertical" /> // vertical
```

### Skeleton (loading placeholder)

```svelte
import {Skeleton} from '$lib/components/ui/skeleton';

<Skeleton class="h-4 w-[200px]" />
<Skeleton class="h-10 w-full rounded-md" />
```

---

## Tailwind Design Tokens

shadcn-svelte maps CSS custom properties → Tailwind semantic classes.
**Always use semantic classes** — never raw hex values or hardcoded colours.

```scss
// Backgrounds
bg-background        // page background
bg-card              // card / panel surface
bg-popover           // dropdown / popover surface
bg-muted             // subtle backgrounds, empty states
bg-accent            // hover / selected state
bg-primary           // brand primary
bg-secondary         // secondary actions
bg-destructive       // danger zone

// Text
text-foreground          // primary text
text-muted-foreground    // secondary / helper text
text-card-foreground     // text on cards
text-primary-foreground  // text on primary bg
text-destructive         // error text
text-accent-foreground   // text on accent bg

// Border & Ring
border-border        // standard dividers
border-input         // form field borders
ring-ring            // focus ring colour

// Radius
rounded-sm  rounded-md  rounded-lg  rounded-xl  rounded-full

// Spacing — use Tailwind's scale
p-1 p-2 p-3 p-4 p-6 p-8   // 4px 8px 12px 16px 24px 32px
gap-1 gap-2 gap-3 gap-4    // same scale for flex/grid gaps
```

---

## Mobile-First Tailwind

90% of users are on mobile. Base styles are always mobile.
Desktop overrides use the `md:` prefix (≥ 768px).

```svelte
<!-- Page wrapper — ALWAYS include bottom padding for nav -->
<div class="p-4 pb-[var(--bottom-nav-height)]">...</div>

<!-- Responsive grid -->
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">...</div>

<!-- Touch targets — every interactive element -->
<button class="flex min-h-[44px] items-center px-4"> Action </button>

<!-- Focus + hover — always both, never hover-only -->
<button
	class="
  bg-background
  hover:bg-accent hover:text-accent-foreground
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
"
>
	Click me
</button>
```

---

## Extending Components with className Prop

shadcn-svelte components accept a `class` prop for one-off overrides.
Always use `cn()` inside the component to merge correctly.

```svelte
<!-- Inside a custom component — accept + forward -->
<script lang="ts">
	import { cn } from '$lib/utils';
	let { class: className, ...rest } = $props();
</script>

<!-- Caller overrides -->
<Button class="w-full mt-4">Full width</Button>
<Card.Root class="border-destructive">Error card</Card.Root>

<div class={cn('base-styles-here', className)} {...rest}>
	{@render children?.()}
</div>
```

---

## ❌ Anti-patterns — Never Do These

```svelte
<!-- ❌ Never import from bits-ui directly -->
import { Dialog } from 'bits-ui';

<!-- ❌ Never use SCSS modules -->
<style lang="scss"> ... </style>

<!-- ❌ Never hardcode colours or spacing -->
<div style="color: #6366f1; padding: 16px;">

<!-- ❌ Never concatenate class strings -->
<div class={'card ' + (active ? 'card--active' : '')}>

<!-- ❌ Never use data-attribute selectors (that was Bits UI's pattern) -->
[data-dialog-content][data-state='open'] { }

<!-- ✅ Instead -->
import * as Dialog from '$lib/components/ui/dialog';
<div class={cn('card', active && 'bg-accent')}>
```
