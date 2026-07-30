# Design Skill Reality Alignment — Sessions 4–5 (Cards + Inputs Done; Modals Done)

## Completed

- **Cards (1a–1g):** App was already aligned (commit 72d3114). Updated skill doc radius, mixin, SKILL.md.
- **Inputs (2a–2i):** App was already aligned (commit 72d3114). Updated `input-base` + `focus-ring` mixins.

## Completed (Session 5)

### Modals (3a–3g) — ✅ All applied

| # | Task | Status |
|---|------|--------|
| 3a | Overlay bg → `rgba(0,0,0,0.50)` | ✅ `_dialog.scss` line 6 |
| 3b | Overlay z-index → `$z-modal` | ✅ `_dialog.scss` line 8 |
| 3c | Skill doc radius → `$radius-xl` | ✅ Both `.claude` and `.opencode` skill docs updated |
| 3d | Default max-width → 640px | ✅ `.dialog-content` max-width: 640px; added `--small`(440), `--wide`(800), `--full`(1024) |
| 3e | Destructive variant | ✅ `.dialog-content--destructive` added with centered header/body/footer |
| 3f | Header padding + border | ✅ Uniform `padding: $space-7` removed; header: 20/24/16 + border-bottom; body: 24px; footer: 16/24/20 + border-top |
| 3g | Document 4 sheet directions | ✅ Added right/bottom/top/left to both skill docs |

## In Progress (next session)

### Tables (4a–4i)
See the decisions table below — `_table.scss` needs wrapper, head/row styles, sortable columns, row actions, checkbox selection, empty state, and column alignment.

---

## Decisions by Component Doc

### CARDS (`cards.md` vs `_card.scss`)
| # | Decision | Action | Status |
|---|----------|--------|--------|
| 1a | **Skill correct** — update app | Change `_card.scss`: bg=sunk, add 1px border, shadow=xs | ✅ Done (commit 72d3114) |
| 1b | **Live correct** — update skill | Radius stays `$radius-2xl` (28px). Update skill doc. | ✅ Done — skill doc updated |
| 1c | **Add to app** | Create `.card--featured` (brand bg, white text) | ✅ Done (commit 72d3114) |
| 1d | **Add to app** | Create `.card--dark` (dark bg, white text) | ✅ Done (commit 72d3114) |
| 1e | **Add to app** | Create `.card--section` (full-width, sunk bg, 24px padding) | ✅ Done (commit 72d3114) |
| 1f | **Add to app** | Create `.card--interactive` (hover styles) + `.card--static` (no hover) | ✅ Done (commit 72d3114) |
| 1g | **Add to app** | Add bottom border + 16/20 padding to `.card__header` | ✅ Done (commit 72d3114) |

### INPUTS (`inputs.md` vs `_field.scss`)
| # | Decision | Action | Status |
|---|----------|--------|--------|
| 2a | **Skill correct** — update app | Input bg → `var(--color-bg-surface-sunk)` | ✅ Done (commit 72d3114) |
| 2b | **Add to app** | Add `$shadow-xs` to `.field__input` | ✅ Done (commit 72d3114) |
| 2c | **Skill correct** — update app | Placeholder → `var(--color-text-secondary)` | ✅ Done (commit 72d3114) |
| 2d | **Skill correct** — update app | Label color → `var(--color-text-primary)` | ✅ Done (commit 72d3114) |
| 2e | **Update app** — use hard-coded ring | Replace `var(--shadow-focus)` with `0 0 0 1px var(--color-brand)` | ✅ Done (commit 72d3114) |
| 2f | **Add to app** | Add success state (green border) to `.field__input` | ✅ Done (commit 72d3114) |
| 2g | **Add to app** | Add `.field__prefix` / `.field__suffix` for currency inputs | ✅ Done (commit 72d3114) |
| 2h | **Add to app** | Add global search input pattern (280px, expandable, shortcut badge) | ✅ Done (commit 72d3114) |
| 2i | **Skill correct** — update app | Error hint font → 12px | ✅ Done (commit 72d3114) |
| 2j | **Leave unconstrained** | Input height not in skill spec | — |

### MODALS (`modals.md` vs `_dialog.scss`)
| # | Decision | Action |
|---|----------|--------|
| 3a | **Update app** — use `rgba(0,0,0,0.50)` | Change overlay background |
| 3b | **Update app** — use `$z-modal` | Change overlay z-index |
| 3c | **Live correct** — update skill | Dialog radius stays `$radius-xl`, update skill |
| 3d | **Update app** — use 640px | Change default dialog max-width |
| 3e | **Add to app** | Add destructive confirmation variant |
| 3f | **Add to app** | Add header padding (20/24/16) + bottom border |
| 3g | **Update skill** | Document all 4 sheet directions (right/bottom/top/left) |

### TABLES (`tables.md` vs `_table.scss`)
| # | Decision | Action |
|---|----------|--------|
| 4a | **Add to app** | Create table wrapper class (scroll, sunk bg, border, shadow) |
| 4b | **Update app** — match skill | Head bg=`var(--color-bg-app)`, text=`var(--color-text-secondary)` |
| 4c | **Update app** — match skill | Row hover=`var(--color-bg-app)` |
| 4d | **Update app** — match skill | Body text=`var(--color-text-secondary)` |
| 4e | **Add to app** | Add sortable columns (chevron) |
| 4f | **Add to app** | Add row actions (hover reveal) |
| 4g | **Add to app** | Add checkbox selection + bulk bar |
| 4h | **Add to app** | Add empty state |
| 4i | **Add to app** | Add column type alignment (right-align currency/numbers) |

### BADGES (`badges.md` vs `_badge.scss` + `badge.svelte`)
| # | Decision | Action |
|---|----------|--------|
| 5a | **Add to app** | Add brand + dark variants to SCSS + component |
| 5b | **Add to app** | Add `.badge--lg` size variant |
| 5c | **Drop from skill** | Badges stay borderless |
| 5d | **Add to app** | Add icon badges, dismissible badges, dot/notification badges, number badges |

### AVATARS (`avatars.md` vs `_avatar.scss`)
| # | Decision | Action |
|---|----------|--------|
| 6a | **Use skill sizes** — update app | Adopt 7-size system: XS(18), SM(24), Base(32), MD(40), LG(44), XL(56), 2XL(64) |
| 6b | **Skill correct** — update app | Fallback: `var(--state-active-tint)` bg, `var(--color-brand)` text |
| 6c | **Add to app** | Add bordered avatar, online indicator, avatar+text layout, stacked counter |
| 6d | **Update app** — use `-$space-3` | Stacked avatar overlap → 12px |

### ALERTS (`alerts.md` vs `_ui-primitives.scss` + `alert.svelte`)
| # | Decision | Action |
|---|----------|--------|
| 7a | **Full skill spec** — add to app | 5 variants (brand/success/danger/warning/info) |
| 7b | **Full skill spec** — add to app | Flex row layout w/ icon + heading + body + close |

### REMAINING DOCS (batch)
| Doc | Decision |
|-----|----------|
| DROPDOWN | Add all features to app (bg, radius, item style, header/icons/scrollable) |
| TABS | Add underline + full-width variants, update active state |
| TOOLTIPS & POPOVERS | Add tooltip SCSS, add popover header/body anatomy |
| LISTS | Create global list SCSS |
| PAGINATION | Create pagination SCSS |
| RADIOS/CHECKBOXES/TOGGLE | Add checkbox/radio SCSS, add 3 toggle sizes |
| ICON-SHAPES | Create icon container SCSS (6 color variants, 5 sizes) |
| BUTTON GROUP | Create button group SCSS |
| STATS CARDS | Add featured/compact/mini variants + trend indicators |
| DATA DISPLAY | Add chart/widget SCSS as components are built |
| STATUS INDICATORS | Add job/invoice/priority/pipeline/timer SCSS |
| CONTENT/GRID | Add global grid classes as needed |
| ACCORDION | Create accordion SCSS |

---

## Implementation Plan (future sessions)

1. ~~**Cards rewrite** — update `_card.scss` to match skill model + add featured/dark/section/interactive/static variants~~ ✅ Done (commit 72d3114)
2. ~~**Inputs update** — update `_field.scss` with skill-correct tokens + add success state + prefix/suffix + search~~ ✅ Done (commit 72d3114)
3. ~~**Modals update** — update `_dialog.scss` overlay/radius/sizes + add destructive variant + header border~~ ✅ Session 5
4. **Tables update** — update `_table.scss` + add wrapper/features
5. **Badges update** — add brand/dark variants, size, sub-components
6. **Avatars update** — resize system, add features
7. **Alerts update** — rebuild with full skill spec
8. Remaining 13 docs — batch implement as individual sessions

---

## Resume Command

> Continue design skill reality alignment. Read `.opencode/memory/design-skill-reality-alignment.md` and implement Tables (4a–4i).
