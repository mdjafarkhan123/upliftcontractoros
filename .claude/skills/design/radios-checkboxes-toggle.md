# Radios, Checkboxes & Toggles

> Dependencies: `colors.md`, `radius.md`

## Checkbox

- Size: 16×16px
- Radius: `$radius-xs` (4px)
- Border: 1px `var(--color-border-strong)`
- Background: `var(--color-bg-surface-sunk)`
- Focus ring: `box-shadow: 0 0 0 2px var(--state-active-tint)`
- Checked: `var(--color-brand)` background, white checkmark icon
- Indeterminate: `var(--color-brand)` background, white minus icon

### Disabled Checkbox
- Border: `var(--color-border-strong)`
- Background: `var(--color-text-muted)`
- Checked disabled: `var(--color-border-strong)` background, `var(--color-text-muted)` icon

## Radio

- Size: 16×16px
- Radius: `$radius-full`
- Border: 1px `var(--color-border-strong)`
- Background: `var(--color-bg-surface-sunk)`
- Focus ring: `box-shadow: 0 0 0 2px var(--state-active-tint)`
- Checked: `var(--color-brand)` 1px border, 6×6px center dot `var(--color-brand)` color inside

### Disabled Radio
- Border: `var(--color-border-strong)`
- Text: `var(--color-text-muted)`

Group all radio items under the same `name` attribute.

## Toggle (Switch)

### Track
- Width: 40px, height: 22px
- Radius: `$radius-full`
- Background (off): `var(--color-border-strong)`
- Background (on): `var(--color-brand)`
- Focus-within ring: `box-shadow: 0 0 0 2px var(--state-active-tint)`
- Transition: background 150ms ease

### Thumb
- Size: 16×16px, `$radius-full`
- Background: white
- Box-shadow: `$shadow-xs`
- Transform: translateX(2px) when off → translateX(20px) when on
- Transition: transform 150ms ease

### Toggle Sizes
| Size | Track | Thumb |
|---|---|---|
| Small | 32×18px | 12×12px, offset 18px |
| Default | 40×22px | 16×16px, offset 20px |
| Large | 48×26px | 20×20px, offset 24px |

### Disabled Toggle
- Track: `var(--color-bg-surface-sunk)` background (on or off)
- Thumb: `var(--color-text-muted)`
- Label: `var(--color-text-muted)`
- No hover/focus interaction

## Label + Control Layout

- Flex row, align-start, `$space-2` (10px) gap
- Label: 14px, `var(--color-text-primary)`, medium
- Helper text: 12px, `var(--color-text-muted)`, 2px below label

## Checkbox Group (CRM Filter Panel)

- Vertical flex, `$space-3` (12px) gap between items
- Group label: 12px, uppercase, `var(--color-text-muted)`, 0.5px letter-spacing
- Divider between groups: `$space-4` (16px) margin, 1px `var(--color-border)`

## Rules

- All selection inputs must have `id` matching label `htmlFor`
- Focus states use brand token for each control
- Disabled states: no hover/focus interaction
- Indeterminate checkbox used for "select all" partial state
