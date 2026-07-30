# Modals

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `buttons.md`, `inputs.md`

## Core Specs

### Overlay (Backdrop)
- Fixed, covers full screen
- Z-index: `$z-modal` (1000)
- Background: `var(--overlay)`
- Backdrop filter: blur(2px)

### Content Container
- Background: `var(--color-bg-surface)`
- Radius: `$radius-xl` (20px)
- Shadow: `$shadow-xl`
- Max-width: 440px (small) / 640px (default) / 800px (wide) / 1024px (full)
- Margin: auto (centered)
- Max-height: 90vh, overflow-y: auto

## Anatomy

### Header
- Padding: `$space-5` (20px) `$space-6` (24px) `$space-4` (16px)
- Bottom border: 1px `var(--color-border)`
- Title: 18px (~`$fs-h3` 20px), semibold, `var(--color-text-primary)`
- Subtitle (optional): 14px, `var(--color-text-secondary)`, `$space-1` (4px) top margin
- Close button: ghost variant from `buttons.md`, top-right, 8px padding

### Body
- Padding: `$space-6` (24px)
- Vertical spacing between elements: `$space-4` (16px)
- Text: `$fs-body`/`var(--text-body)` (14px), 1.6 line-height, `var(--color-text-secondary)`

### Footer
- Padding: `$space-4` (16px) `$space-6` (24px) `$space-5` (20px)
- Top border: 1px `var(--color-border)`
- Layout: flex, justify-end, `$space-2` (8px) gap
- Default: Secondary button + Brand button (right-aligned)

## Variants

### Default (Information / Confirmation)
Standard header + body + footer with primary/secondary actions.

### Destructive Confirmation
- Icon: centered danger icon shape (`$space-12`×`$space-12` (48×48px), danger variant)
- Title: "Are you sure?" style
- Body: consequence description, 14px
- Footer: Secondary (Cancel) + Danger button (Delete / Remove)

### Form Modal
Body contains labeled inputs from `inputs.md`. 16px gap between form fields.
Common CRM forms: Add Project, Add Client, Create Invoice, Add Team Member, Log Time.

### Slide-over (Side Panel)
For complex forms or details that need more space:
- Width: 480px (default) / 640px (wide)
- Height: 100vh
- Position: fixed right 0
- Overlay: same backdrop
- Animation: slide in from right (transform translateX)

#### Sheet directions:
- **Right** (default): `top: 0; right: 0; bottom: 0` — slides from right
- **Bottom**: `bottom: 0; left: 0; right: 0; max-height: 85vh` — slides up from bottom
- **Top**: `top: 0; left: 0; right: 0; max-height: 50vh` — slides down from top
- **Left**: `top: 0; left: 0; bottom: 0; max-width: 300px` — slides from left

## Sizes

| Variant | Max-width |
|---|---|
| Small (confirmation) | 440px |
| Default | 640px |
| Wide (form) | 800px |
| Full (detail view) | 1024px |
| Slide-over | 480px or 640px |

## Rules

- Backdrop: fixed, full screen, `$z-modal`
- Content: `var(--color-bg-surface)` bg, `$radius-xl` radius, `$shadow-xl`
- Header/footer: separated by `var(--color-border)` borders
- Close button always present and visible
- Accessibility: `role="dialog"`, `aria-modal="true"`, focus trap on open
- Press Escape to close
- Click outside backdrop to close (optional — not on destructive confirms)
- Scroll body, not the whole modal, for long content
