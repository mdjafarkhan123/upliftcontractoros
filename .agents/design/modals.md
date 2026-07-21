# Modals

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `buttons.md`, `inputs.md`

## Core Specs

### Overlay (Backdrop)
- Fixed, covers full screen
- Z-index: `$z-modal` (60)
- Background: `rgba(0,0,0,0.50)`
- Backdrop filter: blur(2px)

### Content Container
- Background: `var(--neutral-primary)`
- Radius: 8px
- Shadow: `$shadow-xl`
- Max-width: 480px (small) / 640px (default) / 800px (wide) / 1024px (full)
- Margin: auto (centered)
- Max-height: 90vh, overflow-y: auto

## Anatomy

### Header
- Padding: 20px 24px 16px
- Bottom border: 1px `var(--border-default)`
- Title: 18px, semibold, `var(--heading)`
- Subtitle (optional): 14px, `var(--body)`, 4px top margin
- Close button: ghost variant from `buttons.md`, top-right, 8px padding

### Body
- Padding: 24px
- Vertical spacing between elements: 16px
- Text: 14px, 1.6 line-height, `var(--body)`

### Footer
- Padding: 16px 24px 20px
- Top border: 1px `var(--border-default)`
- Layout: flex, justify-end, 8px gap
- Default: Secondary button + Brand button (right-aligned)

## Variants

### Default (Information / Confirmation)
Standard header + body + footer with primary/secondary actions.

### Destructive Confirmation
- Icon: centered danger icon shape (48×48px, danger variant)
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
- Content: `neutral-primary` bg, 8px radius, `$shadow-xl`
- Header/footer: separated by `border-default` borders
- Close button always present and visible
- Accessibility: `role="dialog"`, `aria-modal="true"`, focus trap on open
- Press Escape to close
- Click outside backdrop to close (optional — not on destructive confirms)
- Scroll body, not the whole modal, for long content
