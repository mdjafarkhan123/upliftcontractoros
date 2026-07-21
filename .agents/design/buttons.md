# Buttons

> Dependencies: `colors.md`, `radius.md`, `shadows.md`
> SCSS mixin: `@include button-glint` from `scss/_mixins.scss`

## Core Specs (every button except ghost and disabled)

- **Radius:** 8px (base) or `$radius-full` for pills
- **Border:** 1px solid
- **Shadow + Glint:** All non-ghost, non-disabled buttons get:
  ```scss
  box-shadow:
    $shadow-xs,
    inset var(--color-1-400) 0 6px 0px -5px,
    var(--color-1-700) 0 4px 10px -5px;
  ```
  Use `@include button-glint` mixin.
- **Font weight:** 500 (medium)
- **Font:** Inter (inherited)
- **Cursor:** pointer
- **Display:** inline-flex, align-items center, gap 8px
- **Transition:** colors 150ms ease

## Sizes

| Size | Font size | Horizontal padding | Vertical padding |
|---|---|---|---|
| Extra small | 12px | 10px | 5px |
| Small | 14px | 12px | 8px |
| Base (default) | 14px | 16px | 10px |
| Large | 15px | 20px | 12px |
| Extra large | 16px | 24px | 14px |

## Variants

### Brand (Primary)
- **Background:** `var(--brand)` → `#227d53` light / `#5fbd92` dark
- **Border:** transparent
- **Text:** white
- **Hover:** `var(--brand-strong)` background
- **Focus ring:** 4px, `var(--brand-medium)` color
- **Glint:** yes

### Secondary
- **Background:** `var(--neutral-secondary-medium)`
- **Border:** `var(--border-default-medium)`
- **Text:** `var(--body)`
- **Hover:** `var(--neutral-tertiary-medium)` background, `var(--heading)` text
- **Focus ring:** 4px, `var(--neutral-tertiary)` color
- **Glint:** yes

### Tertiary (Outlined)
- **Background:** `var(--neutral-primary-soft)`
- **Border:** `var(--border-default)`
- **Text:** `var(--body)`
- **Hover:** `var(--neutral-secondary-medium)` background, `var(--heading)` text
- **Focus ring:** 4px, `var(--neutral-tertiary-soft)` color
- **Glint:** yes

### Success
- **Background:** `var(--success)`
- **Border:** transparent
- **Text:** white
- **Hover:** `var(--success-strong)` background
- **Focus ring:** 4px, `var(--success-medium)` color
- **Glint:** yes

### Danger
- **Background:** `var(--danger)`
- **Border:** transparent
- **Text:** white
- **Hover:** `var(--danger-strong)` background
- **Focus ring:** 4px, `var(--danger-medium)` color
- **Glint:** yes

### Warning
- **Background:** `var(--warning)`
- **Border:** transparent
- **Text:** white
- **Hover:** `var(--warning-strong)` background
- **Focus ring:** 4px, `var(--warning-medium)` color
- **Glint:** yes

### Info
- **Background:** `var(--info)`
- **Border:** transparent
- **Text:** white
- **Hover:** `var(--info-strong)` background
- **Focus ring:** 4px, `var(--info-medium)` color
- **Glint:** yes

### Dark
- **Background:** `var(--dark)`
- **Border:** transparent
- **Text:** white
- **Hover:** `var(--dark-strong)` background
- **Focus ring:** 4px, `var(--neutral-tertiary)` color
- **Glint:** yes

### Ghost (NO shadow, NO glint)
- **Background:** transparent
- **Border:** transparent
- **Text:** `var(--heading)`
- **Hover:** `var(--neutral-secondary-medium)` background
- **Focus ring:** 4px, `var(--neutral-tertiary)` color
- **No shadow, no glint**

### Disabled (NO shadow, NO glint)
- **Background:** `var(--disabled)`
- **Border:** `var(--border-default-medium)`
- **Text:** `var(--fg-disabled)`
- **Cursor:** not-allowed
- **No hover, no focus, no shadow, no glint**

## Icons in Buttons

- Icon size: 16×16px
- Gap: 8px between icon and label
- Layout: inline-flex, vertically centered
- Icon-only button: equal padding on all sides; min 36×36px touch target

## Pill Variant

Add `border-radius: $radius-full` to any variant for pill style.
Commonly used for: primary CTA, quick-add buttons, badge actions.
