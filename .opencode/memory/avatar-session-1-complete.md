# Avatar System Overhaul — Session 1 Complete

## Completed (Session 1)

### 1. `_tokens.scss` — 8-color palette added
- Added 7 new color ramps: sky, purple, orange, teal, pink, indigo, amber (50–900)
- Added `--palette-*` CSS custom properties for light mode (`:root`) and dark mode (`dark-theme-tokens` mixin)
- 8 colors: brand, sky, purple, orange, teal, pink, indigo, amber

### 2. `_avatar.scss` — Full rewrite
- 7-size system: `--xs(18)`, `--sm(24)`, `--base(32)`, `--md(40)`, `--lg(44)`, `--xl(56)`, `--2xl(64)`
- `.avatar--square` variant (`$radius-sm`)
- `.avatar--bordered` variant (2px outline)
- `.avatar__fallback` with `data-palette` attribute for 8-color palette
- `.avatar-indicator` (online/offline dot)
- `.avatar-group` (stacked, -12px overlap, + counter)
- `.avatar-text` (avatar + name/subtitle layout)

### 3. `Avatar.svelte` — New shared component
- Path: `src/lib/components/shared/Avatar.svelte`
- Props: `name`, `src`, `size`, `variant`, `bordered`, `online`, `palette`, `class`
- Image with loading state (skeleton shimmer)
- Initials fallback with proportional font size (height × 0.35)
- Online indicator

## Completed (Session 2)

### 4. `ContactAvatar.svelte` — Refactored to use shared `Avatar.svelte`
- Imports and delegates to `Avatar.svelte`
- Maps status tones → palette: `lead`→`brand`, `customer`→`teal`, `archived`→`amber`
- `fill` prop → `size="md"` + `.contact-avatar-wrap--fill` CSS (100% width/height)
- Status-tint border rings via `.contact-avatar-wrap--lead/--customer/--archived`
- Numeric `size` prop → named sizes (18→xs, 24→sm, 32→base, 40→md, 44→lg, 56→xl, 64→2xl)

### 5. `_contacts.scss` — Replaced `.contact-avatar` with `.contact-avatar-wrap`
- Status-tint border layer only (box-shadow)
- `.contact-avatar-wrap--fill` makes avatar fill parent
- Border-radius/font/display removed (now in shared `.avatar`)

### 6. Early consumers migrated
| File | Migration |
|------|-----------|
| `pipeline/OpportunityCard.svelte` | `<Avatar size="sm" name={assignee_name} />` |
| `team/TeamMemberCard.svelte` | `<Avatar size="md" name={member.full_name} online={member.is_active} palette={role→brand/amber/indigo} />` |
| `jobs/JobClientCard.svelte` | `<Avatar size="md" name={contact_name} />` |
| `shared/RecycleBinList.svelte` | `<Avatar size="sm" name={item.title} />` |

## Remaining — Session 3

### 7. Migrate remaining consumers
| File | Current pattern |
|------|----------------|
| `jobs/JobTasksSection.svelte` | `.job-tasks__avatar` |
| `jobs/JobTimeTrackingSection.svelte` | `.job-timetrack__entry-avatar` |
| `jobs/InvoiceReminderDetailPopover.svelte` | `.card-detail-pop__avatar` |
| `appointments/CardDetailPopover.svelte` | `.card-detail-pop__avatar` |
| `appointments/AppointmentCard.svelte` | `.appt-card__avatar` + `.appt-card__avatar--more` |
| `quotes/ContactPickerSheet.svelte` | `.contact-picker__avatar` |
| `inbox/ConversationRowBody.svelte` | `.convo-row__avatar` |
| `inbox/MessageBubble.svelte` / `EmailMessageCard.svelte` | `.msg__avatar` |

### 8. Final cleanup
- Remove `.contact-avatar` from `_contacts.scss` once all consumers migrated
- Remove unused old avatar mixins/styles

---

## Resume Command
```
Session 2 of avatar overhaul. Read .opencode/memory/avatar-session-1-complete.md. Refactor ContactAvatar.svelte to use shared Avatar.svelte, update _contacts.scss .contact-avatar, and migrate early consumers (OpportunityCard, TeamMemberCard, JobClientCard, RecycleBinList).
```
