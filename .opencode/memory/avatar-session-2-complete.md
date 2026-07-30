# Avatar System Overhaul — Session 2 Complete

## Completed (Session 2) — All remaining consumers migrated

### 7. Migrated all remaining consumers

| File | Migration |
|------|-----------|
| `jobs/JobTasksSection.svelte` | `<Avatar size="sm" name={t.assignee_name}>` — removed `initials()` fn + `.job-tasks__avatar` CSS |
| `jobs/JobTimeTrackingSection.svelte` | `<Avatar size="base" name={e.member_name}>` — removed `.job-timetrack__entry-avatar` CSS |
| `jobs/InvoiceReminderDetailPopover.svelte` | `<Avatar size="sm" name={lead.full_name}>` — removed `initials()` fn |
| `appointments/CardDetailPopover.svelte` | `<Avatar size="sm" name={item.assignee_name}>` — removed `initials()` fn |
| `appointments/AppointmentCard.svelte` | `<Avatar size="sm" name={appointment.assignee_name ?? ''}>` — removed `avatarInitials` derived, replaced `.appt-card__avatar`/`.appt-card__avatar--more` with `.appt-card__more` chip |
| `quotes/ContactPickerSheet.svelte` | `<Avatar size="sm" name={c.full_name}>` — replaced `<i class="ri-user-line">` |
| `inbox/ConversationRowBody.svelte` | `<Avatar size="base" name={c.contact_name}>` — removed `initials` prop, removed `.convo-row__avatar` from `_inbox.scss` |
| `inbox/MessageBubble.svelte` + `EmailMessageCard.svelte` | Added `outboundName` prop, `<Avatar size="sm">` for both inbound/outbound, icon fallback class `.msg__avatar-icon` |
| `inbox/InboxThreadView.svelte` | Passes `outboundName={member().full_name}` |

### 8. Global SCSS cleanup

- `_appointments.scss`: Removed `.card-detail-pop__avatar`, replaced `.appt-card__avatar` / `.appt-card__avatar--more` with `.appt-card__more`
- `_inbox.scss`: Removed `.msg__avatar` / `.msg__avatar--in` / `.msg__avatar--out`, replaced with `.msg__avatar-icon`; removed `.convo-row__avatar` / `.convo-row__avatar--unread`

### Consumer pattern
Every consumer now uses `<Avatar size="xs|sm|base|md" name={...} />` from the shared component. Size mapping:
- 18px → xs (JobTasksSection: was 22px, close enough)
- 24px → sm (InvoiceReminderPopover, CardDetailPopover, AppointmentCard, ContactPickerSheet, MessageBubble, EmailMessageCard)
- 32px → base (JobTimeTracking: was 34px; ConversationRowBody: was 36px—card/32px—dense)
- 40px → md (standard detail page)

## Not done
- Remove old `.contact-avatar` from `_contacts.scss` — this was already done in session 1 (only `.contact-avatar-wrap` remains as the `ContactAvatar.svelte` wrapper)
- No unused avatar mixins remain

## Resume Command
```
Session 3 of avatar overhaul. Read .opencode/memory/avatar-session-2-complete.md. All consumers have been migrated to the shared Avatar component; final verify by running npm run check.
```
