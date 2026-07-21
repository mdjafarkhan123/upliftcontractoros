# Radios, Checkboxes & Toggles

> Dependencies: `colors.md`, `radius.md`

## Checkbox

- Size: 16×16px
- Radius: 4px (`$radius-sm`)
- Border: 1px `var(--border-default-medium)`
- Background: `var(--neutral-secondary-medium)`
- Focus ring: `box-shadow: 0 0 0 2px var(--brand-soft)`
- Checked: `var(--brand)` background, white checkmark icon
- Indeterminate: `var(--brand)` background, white minus icon

### Disabled Checkbox
- Border: `var(--border-light-medium)`
- Background: `var(--disabled)`
- Checked disabled: `var(--neutral-quaternary)` background, `var(--fg-disabled)` icon

## Radio

- Size: 16×16px
- Radius: `$radius-full`
- Border: 1px `var(--border-default-medium)`
- Background: `var(--neutral-secondary-medium)`
- Focus ring: `box-shadow: 0 0 0 2px var(--brand-soft)`
- Checked: `var(--border-brand)` 1px border, 6×6px center dot `var(--brand)` color inside

### Disabled Radio
- Border: `var(--border-light-medium)`
- Text: `var(--fg-disabled)`

Group all radio items under the same `name` attribute.

## Toggle (Switch)

### Track
- Width: 40px, height: 22px
- Radius: `$radius-full`
- Background (off): `var(--neutral-quaternary)`
- Background (on): `var(--brand)`
- Focus-within ring: `box-shadow: 0 0 0 2px var(--brand-soft)`
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
- Track: `var(--neutral-tertiary)` background (on or off)
- Thumb: `var(--gray)`
- Label: `var(--fg-disabled)`
- No hover/focus interaction

## Label + Control Layout

- Flex row, align-start, 10px gap
- Label: 14px, `var(--heading)`, medium
- Helper text: 12px, `var(--body-subtle)`, 2px below label

## Checkbox Group (CRM Filter Panel)

- Vertical flex, 12px gap between items
- Group label: 12px, uppercase, `var(--body-subtle)`, 0.5px letter-spacing
- Divider between groups: 16px margin, 1px `var(--border-default)`

## Rules

- All selection inputs must have `id` matching label `htmlFor`
- Focus states use brand token for each control
- Disabled states: no hover/focus interaction
- Indeterminate checkbox used for "select all" partial state
