---
name: contractor-crm-design
description: Visual design system for this contractor CRM, built with SvelteKit, SCSS (BEM), and Bits UI. Use this whenever creating, styling, or reviewing ANY page, layout, or component in this project — dashboards, job/lead pipelines, client lists, tables, forms, modals, sidebars, cards, badges, buttons — even if the request doesn't mention "design" or "style" explicitly (e.g. "add a clients page," "build the kanban board," "make a settings modal" should all trigger this). Always consult this before writing a .scss file, a Svelte component's scoped style block, or any new UI. The goal is a consistent, premium SaaS look matching two reference screenshots (soft elevated cards, pill-shaped buttons/badges, generous spacing, a deep-to-bright green brand) instead of generic default-looking UI.
---

# Contractor CRM — Design System

## Why this skill exists

Left to its own devices, an LLM generating UI tends toward generic
defaults: 8px radii, harsh 1px borders, cramped padding, Tailwind's stock
gray/blue. None of that is *wrong*, exactly — it's just forgettable, and
this project's whole goal is to avoid forgettable. Two real product
screenshots define what "done well" looks like here, and this skill exists
to translate that look into rules concrete enough to apply consistently
across dozens of components and pages, instead of redriving the aesthetic
from memory (and drifting) every time a new screen gets built.

**Before building anything new, look at the actual references** —
`assets/reference-dashboard.webp` and `assets/reference-pipeline.webp` —
with the `view` tool. The written notes in this skill are a distillation,
not a replacement; when in doubt, the screenshots are ground truth.

## The tech contract

- **Framework:** SvelteKit. Components are `.svelte` files; shared logic in
  `src/lib`.
- **Styling:** SCSS with **BEM** naming (`.block`, `.block__element`,
  `.block--modifier`). No Tailwind, no utility-class soup, no CSS-in-JS.
- **Components:** **Bits UI** for interactive primitives (Dialog, Select,
  Popover, Tabs, Switch, Checkbox, DropdownMenu, etc.). Bits UI is headless
  — it gives you behavior and accessibility, zero default visuals. Every
  pixel of how those primitives look comes from this design system. See
  "Styling Bits UI primitives" below.
- **Tokens:** hex / rgb / rgba **only**. Never `hsl()`, never a Tailwind-
  style opacity slash (`bg-primary/50`). If you need a translucent color,
  write it as `rgba(r, g, b, a)` explicitly — see `references/tokens.scss`
  for the canonical set, which already includes a few pre-mixed rgba values
  (e.g. the focus ring) so you don't have to invent your own.
- **Layout:** primarily a desktop web app, built desktop-first, but every
  page needs to hold together down to tablet and phone widths. See
  `references/layout-patterns.md` for the breakpoint rules.

## The hybrid SCSS architecture

This is the load-bearing structural decision for the whole stylesheet
layer, so get the file layout right early:

```
src/lib/styles/
  _tokens.scss        ← SOURCE OF TRUTH. references/tokens.scss is a hand-synced
                        mirror of THIS file (not the reverse); keep them in sync.
  _mixins.scss         (BEM/responsive/focus-ring helper mixins, if needed)
  _base.scss            resets, base element styles, @font-face
  components/
    _button.scss        .btn block
    _badge.scss          .badge, .trend-chip, .eyebrow
    _card.scss           .card, .stat-card
    _sidebar.scss
    _topbar.scss
    _pipeline.scss        .pipeline*, .pipeline-card*
    _table.scss
    _field.scss
    _dialog.scss
    _avatar.scss
    _progress.scss
  global.scss           @forward/@use everything above; imported ONCE
                         in the root layout
```

**The rule that makes this "hybrid":**
- A pattern that shows up in more than one route (a button, a badge, a
  card, the sidebar) is a **global BEM block** — defined once under
  `components/`, forwarded through `global.scss`, and reused everywhere by
  class name. Never redefine `.btn` inside a page's scoped styles.
- A layout that's specific to one page — the exact grid for the dashboard,
  the column widths on the pipeline board, a one-off arrangement for a
  client detail page — is a **scoped `<style>` block** inside that
  `+page.svelte`. It composes the global blocks (`<div class="card">…`)
  but owns its own grid/positioning rules locally, so that changing one
  page's layout can never accidentally shift another page's.

When you're not sure which side a new style belongs on, ask: *"if I changed
this, would I expect it to change on every page, or just this one?"* Every
page → global. Just this one → scoped.

## Token usage

Read `references/tokens.scss` for the full set. It's split into two layers
now that the app supports both themes:

- **Sass `$variables`** — compile-time only, identical in both themes:
  spacing, radius, typography, motion, z-index, breakpoints, and the raw
  color ramps the theme tokens are generated from.
- **CSS custom properties on `:root`** (`--color-bg-app`, `--shadow-md`,
  `--success-text`, etc.) — what every component should actually paint
  with for anything color- or shadow-related. These are the tokens that
  flip when dark mode turns on. **If a value needs to change between light
  and dark, write `var(--token-name)`, never `$token-name`** — a Sass
  variable is baked into the compiled CSS forever and can't respond to the
  toggle.

A few things worth internalizing up front, because they're easy to miss
just skimming the file:

- **Reach for semantic aliases, not raw ramp steps**, when styling a real
  component: `var(--color-text-primary)`, not `$slate-900`. The aliases are
  the set of `--color-*`/`--success-*`/etc. names — repoint those if the
  palette ever shifts, instead of grep-ing every component.
- **`--color-brand-glow` (`#17F700`) is a glow color, not a fill color.**
  It's there for accent shadows and gradient stops, the way the reference
  screenshots use a bright highlight sparingly against a dark green
  surface. Setting it as a button background or large text color will look
  like a bug, not a feature.
- **Radius is generous on purpose** — cards round at 20–28px, not the more
  common 8px. This, more than the color, is what makes the reference
  screenshots feel "premium" rather than "default Bootstrap-y." Don't
  tighten it.
- **Elevation comes from shadow, not borders.** The reference UI has
  almost no visible 1px borders between surfaces — cards float on soft,
  large-blur, low-opacity shadows instead. Reach for a `var(--shadow-*)`
  token before reaching for a border.
- **Dark mode isn't just inverted lightness.** Brand greens brighten by a
  step or two so they don't go muddy on near-black; borders become
  translucent white instead of a flat gray; status badges flip from
  pale-bg/dark-text to dark-tint/bright-text. `tokens.scss` already
  encodes all of this in the `dark-theme-tokens` mixin — you don't need to
  re-derive it, just don't bypass it by hardcoding a light-mode-only hex
  somewhere.

## Dark mode

The CRM supports light and dark mode through a `data-theme` attribute on
`<html>`, with the CSS custom properties in `tokens.scss` doing the actual
repainting — no component needs an `if (theme === 'dark')` branch in
Svelte, because the same `var(--color-bg-surface)` already resolves to the
right value either way.

**Three states, in priority order:**
1. User has explicitly chosen a theme in this app → `<html data-theme="dark">`
   (or `"light"`) is set, and that wins regardless of OS setting.
2. User hasn't chosen yet, OS is in dark mode → the `prefers-color-scheme`
   media query in `tokens.scss` applies the dark values automatically.
3. User hasn't chosen yet, OS is in light mode → the plain `:root` light
   values apply (the default, no attribute needed).

**Wiring the toggle** — a small store + effect is enough; the key detail is
persisting the choice and applying the attribute as early as possible so
there's no flash of the wrong theme on load:

```svelte
<!-- src/lib/theme.svelte.ts -->
<script module>
  export function setTheme(theme: 'light' | 'dark' | 'system') {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }
</script>
```

**Avoiding the flash-of-wrong-theme on load** — by the time Svelte
hydrates, the page has already painted once with no `data-theme` set,
which is visible as a flash if the stored preference differs from the OS
default. Fix this with a tiny inline script in `src/app.html`, *before* any
stylesheet or app JS loads, so the attribute is correct on the very first
paint:

```html
<script>
  (function () {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  })();
</script>
```

**Building or reviewing any component:** mentally render it twice — once
assuming `:root` light values, once assuming the dark mixin — using the
table in `references/visual-reference.md` and the dark-mode notes inline in
`references/components.md` as a guide for anything that isn't a flat
lighter/darker swap (the hero card gradient, status badges, avatar
fallbacks, and the two sidebar variants all call this out explicitly where
it applies).


## Component & layout references

- **`references/components.md`** — buttons, badges/pills, cards (including
  the dark "hero" accent card), sidebar nav, top bar, the kanban/pipeline
  board + card, data tables, form inputs, dialogs, avatars, and progress/
  gauge shapes. Each has a BEM skeleton and working SCSS using the tokens
  above. Start here for anything that resembles a known UI piece.
- **`references/layout-patterns.md`** — the app shell (sidebar + topbar +
  content), the dashboard grid, the pipeline board page, the table/list
  page, and the responsive collapse rules for each (sidebar → compact rail
  → drawer; table → stacked cards; pipeline columns → swipeable).
- **`references/visual-reference.md`** — an annotated element-by-element
  index into the two screenshots, mapping specific things you can see
  (a tag, a chart, a divider line) to the token/class that reproduces it.
  Most useful when extrapolating to something not explicitly specced yet.
- **`references/ui-primitives.md`** — the **UI Primitives Registry** (which
  built component to use for date/time/select/dropdown/icons + what's banned)
  and **The Styling Law** (a BEM class shared by 2+ components MUST be global,
  never in a scoped `<style>`). Read this before adding any input/picker or
  before deciding where a shared class's styles go — it's the enforcement of
  Rule 2 + Rule 4.

## Styling Bits UI primitives

Bits UI components render real DOM elements with `data-*` state attributes
(`data-state`, `data-disabled`, `data-highlighted`, etc.) but no classes or
inline styles of their own. The pattern is: pass your BEM class via the
`class` prop, then write state variants as attribute selectors scoped under
that class, the same way you'd handle `:hover` —

```svelte
<Dialog.Content class="dialog-content">…</Dialog.Content>
```
```scss
.dialog-content {
  // base styles…
  &[data-state="open"] { animation: dialog-in $duration-base $ease-standard; }
}
```

This keeps Bits UI's accessibility/behavior layer fully intact while giving
every primitive the same look as everything else in `components.md` — a
`Select.Trigger` should end up indistinguishable from `.field__input`, a
`Switch.Root` should use brand green for its "on" state the same way a
`.badge--success` does.

## Before calling a component "done"

1. Every color and shadow value is a `var(--token)`, not a `$token` or a
   raw hex — spacing/radius/font can stay as `$variables` since those don't
   change between themes, but anything that paints with color must be
   able to repaint when the theme flips.
2. Cards use generous radius (`$radius-xl`/`$radius-2xl`) and a shadow, not
   a border, for separation.
3. Any button, badge, or pill is fully rounded (`$radius-full`).
4. At most one `.card--hero` dark accent surface is visible on screen at a
   time.
5. The component is global SCSS if reused across routes, scoped if it's a
   one-page layout decision — not a mix of both for the same rule.
6. Bits UI primitives are styled via `data-*` attribute selectors on your
   own BEM class, not left in their unstyled default state.
7. There's a sane behavior down to `$bp-tablet` and `$bp-mobile`, even on a
   desktop-first feature — see `references/layout-patterns.md` for the
   established collapse pattern before inventing a new one.
8. Toggle `data-theme` on `<html>` (devtools is fine for a quick check) and
   confirm the component still looks intentional — especially anything
   with a gradient, a soft-tint badge, or a hardcoded light-only hex that
   snuck in.
