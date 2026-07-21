# Brand

## Identity

- **Design system name:** Contractor CRM
- **Project name:** Contractor CRM *(update with your product name)*
- **Primary color:** #227d53 — Forest Green (`--color-brand`; brightens to #30b070 in dark mode)
- **Deep color:** #13452d — Dark Forest (`--color-brand-strong`)
- **Neon glow accent:** #17f700 (`--color-brand-glow`) — **shadows / gradient stops ONLY**, never fills or text
- **Project logo:** Update `brand.md` with your logo URL once set.

## Brand Voice

Professional, reliable, and efficient. This tool is trusted on the job site. The design reflects clarity over complexity — contractors need answers fast, not decoration.

## Brand Tokens

These mirror `colors.md` (the authoritative token contract) — same token, both themes:

| Token | Light | Dark |
|---|---|---|
| `var(--color-brand)` | #227d53 | #30b070 |
| `var(--color-brand-strong)` | #13452d | #238052 |
| `var(--color-brand-glow)` | #17f700 | #17f700 (shadows / gradient stops only) |

## Logo Usage

- Use the logo in the sidebar header, login/auth screens, empty states, and branded report headers.
- Maintain clear space around the logo equal to the logo height × 0.25.
- Never crop, recolor, rotate, or place on low-contrast backgrounds.
- If no logo is set, use a text mark with "Contractor CRM" in semibold Inter at `var(--color-brand)` color.

## Rules

- Pair the logo with an accessible text label where the mark alone would be ambiguous.
- Never use brand green (#227d53) for long-form body paragraphs.
- Never use brand backgrounds for large layout surfaces (sidebar fill, full-page backgrounds).
- Brand color is for actions, links, active states, and key data highlights only.
- Use `colors.md`, `typography.md`, `layout.md`, and component modules for all visual values.
