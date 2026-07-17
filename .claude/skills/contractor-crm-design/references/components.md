# Component Specs

Detailed, build-ready specs for the recurring pieces of UI in this CRM. Each
section names the BEM block, shows the structural skeleton, and gives the
SCSS using tokens from `tokens.scss`. These are reusable components, so they
belong in global SCSS (`src/lib/styles/components/_*.scss`), one file per
block, forwarded from `global.scss`.

Treat the property values here as defaults, not laws — if a real layout needs
a card to be 24px instead of 28px, that's fine. What should NOT drift is which
_token_ you reach for. Always a token, never a raw hex/px typed inline.

Jump to: [Buttons](#buttons) · [Badges & pills](#badges--pills) · [Cards](#cards) ·
[Sidebar nav](#sidebar-nav) · [Top bar](#top-bar) · [Kanban / pipeline](#kanban--pipeline-board) ·
[Data table](#data-table) · [Forms](#form-inputs) · [Dialog/Modal](#dialog--modal-bits-ui) ·
[Avatar](#avatar) · [Progress & gauges](#progress--gauges)

---

## Buttons

Reference: the "Add Project" / "Start Meeting" solid pill buttons and the
outlined "Import Data" pill in the dashboard screenshot. Buttons here are
never sharp-cornered — `$radius-full` always.

**Variants:** `primary` (solid brand-deep→brand-primary), `secondary`
(white, bordered), `ghost` (no fill, no border — table row actions), `icon`
(circular, fixed width = height).

**Sizes:** `md` (default, 40px tall) and `sm` (32px tall, dense toolbars).

```scss
.btn {
	display: inline-flex;
	align-items: center;
	gap: $space-2;
	height: 40px;
	padding: 0 $space-6;
	border-radius: $radius-full;
	font: $weight-semibold #{$text-body-md}/#{$leading-body-md} $font-body;
	border: none;
	cursor: pointer;
	transition:
		background-color $duration-fast $ease-standard,
		box-shadow $duration-fast $ease-standard,
		transform $duration-fast $ease-standard;

	&:active {
		transform: scale(0.98);
	}
	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	&:focus-visible {
		box-shadow: var(--shadow-focus);
		outline: none;
	}

	&--sm {
		height: 32px;
		padding: 0 $space-4;
		font-size: $text-body-sm;
	}

	&--primary {
		background: var(--color-brand-strong);
		color: var(--color-text-on-brand);
		&:hover {
			background: var(--color-brand);
		}
	}

	&--secondary {
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border-strong);
		&:hover {
			background: var(--color-bg-surface-sunk);
		}
	}

	&--ghost {
		background: transparent;
		color: var(--color-text-secondary);
		&:hover {
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-primary);
		}
	}

	&--icon {
		width: 40px;
		padding: 0;
		justify-content: center;
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-secondary);
		&:hover {
			background: var(--color-border);
			color: var(--color-text-primary);
		}
	}
}
```

Icons inside a button are 18px, centered, `gap: $space-2` from the label —
see the "+" before "Add Project" and the camera icon before "Start Meeting."

---

## Badges & Pills

Reference: "Completed" / "In Progress" / "Pending" tags on Team Collaboration
rows; "New" / "Followed" tags on pipeline cards; the small up/down trend
chips ("5↑ Increased from last month").

```scss
.badge {
	display: inline-flex;
	align-items: center;
	gap: $space-1;
	height: 24px;
	padding: 0 $space-3;
	border-radius: $radius-full;
	font-size: $text-body-sm;
	font-weight: $weight-medium;
	white-space: nowrap;

	&--success {
		background: var(--success-bg);
		color: var(--success-text);
	}
	&--warning {
		background: var(--warning-bg);
		color: var(--warning-text);
	}
	&--danger {
		background: var(--danger-bg);
		color: var(--danger-text);
	}
	&--info {
		background: var(--info-bg);
		color: var(--info-text);
	}
	&--neutral {
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-secondary);
	}

	// solid variant — used for the blue "Followed" tag, which reads as more
	// committed/permanent than the soft "New" tag
	&--solid {
		color: var(--color-text-on-brand);
		&.badge--info {
			background: var(--info-solid);
		}
		&.badge--success {
			background: var(--success-solid);
		}
	}
}

// the tiny circular trend indicator before "Increased from last month"
.trend-chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border-radius: $radius-full;
	background: var(--success-bg);
	color: var(--success-text);
	font-size: 11px;
	font-weight: $weight-semibold;
}
```

**Eyebrow / micro-label** — the small uppercase tracked labels used for
sidebar section headers ("MENU", "GENERAL") and pipeline column stats
("REJECTED", "TOTAL"). Not a pill — just type treatment:

```scss
.eyebrow {
	font-size: $text-label;
	line-height: $leading-label;
	font-weight: $weight-semibold;
	letter-spacing: $tracking-label;
	text-transform: uppercase;
	color: var(--color-text-muted);
}
```

---

## Cards

Two card species appear in the references: the plain white card (most of the
dashboard) and the hero/accent dark card (Total Projects, Time Tracker). Both
share the same radius scale; the hero card adds brand-deep fill + glow shadow.

```scss
.card {
	background: var(--color-bg-surface);
	border-radius: $radius-2xl;
	padding: $space-7 $space-6;
	box-shadow: var(--shadow-md);
	// deliberately no border — elevation comes from the shadow alone

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: $space-5;
	}

	&__title {
		font: $weight-semibold #{$text-heading-md}/#{$leading-heading-md} $font-display;
		color: var(--color-text-primary);
	}

	// the dark accent variant — use for exactly one "hero" tile per view,
	// never for a whole grid of cards, or the glow effect loses its impact
	&--hero {
		background: linear-gradient(160deg, var(--surface-hero-from) 0%, var(--surface-hero-to) 100%);
		color: var(--color-text-on-brand);
		box-shadow: var(--shadow-glow);

		.card__title {
			color: var(--color-text-on-brand);
		}
	}
}

// a stat tile (the "24 / Total Projects" pattern) — composes .card
.stat-card {
	@extend .card;

	&__value {
		font: $weight-bold #{$text-stat}/#{$leading-stat} $font-display;
	}

	&__action {
		// the small circular ↗ button in the card's top-right corner
		width: 32px;
		height: 32px;
		border-radius: $radius-full;
		background: rgba(255, 255, 255, 0.15); // on hero card
		display: flex;
		align-items: center;
		justify-content: center;
	}
}
```

---

## Sidebar Nav

Reference: the dashboard's full sidebar (logo, "MENU" section, nav items with
icon + label, active item gets a thick brand-colored left bar + bold text,
"GENERAL" section below, promo card pinned at the bottom).

```scss
.sidebar {
	width: 280px;
	background: var(--color-bg-surface);
	padding: $space-6 $space-5;
	display: flex;
	flex-direction: column;
	gap: $space-8;

	&__nav-item {
		display: flex;
		align-items: center;
		gap: $space-3;
		height: 44px;
		padding: 0 $space-4;
		border-radius: $radius-md;
		color: var(--color-text-secondary);
		font-weight: $weight-medium;
		position: relative;
		transition: background-color $duration-fast $ease-standard;

		&:hover {
			background: var(--color-bg-surface-sunk);
		}

		// active state: left indicator bar + filled text, not a full bg fill —
		// this is what separates this nav style from a generic "highlighted row"
		&--active {
			color: var(--color-text-primary);
			font-weight: $weight-semibold;
			background: var(--state-active-tint);

			&::before {
				content: '';
				position: absolute;
				left: -$space-5; // bleeds to the sidebar's outer edge
				top: 50%;
				transform: translateY(-50%);
				width: 4px;
				height: 24px;
				border-radius: 0 $radius-sm $radius-sm 0;
				background: var(--color-brand);
			}
		}
	}
}
```

**Responsive collapse of the primary sidebar** — at tablet width the main
nav narrows to icon-only but stays bound to the same surface tokens as the
full sidebar, so it still flips correctly with light/dark mode (see
`layout-patterns.md` for exactly which breakpoint triggers this):

```scss
.sidebar--icon-only {
	width: 72px;
	align-items: center;
	padding: $space-5 0;

	.sidebar__nav-item {
		width: 44px;
		justify-content: center;
		// visually hide the label but keep it for screen readers, and give the
		// icon a tooltip on hover/focus so sighted users aren't left guessing
		.sidebar__nav-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
		}
	}
}
```

**Compact dark rail variant** — a second, _intentionally_ always-dark rail
style lifted straight from the F·H·R pipeline screenshot (icon-only, navy
background, active item gets a rounded highlight square). This is NOT the
responsive state of the primary sidebar above — it's a distinct visual
identity for a secondary rail (e.g. a settings/admin app-switcher sitting
next to the main sidebar). Because the F·H·R reference rail is dark
regardless of the rest of that product's theme, this variant deliberately
does **not** bind to the `--color-bg-surface` tokens — it stays the same
dark navy in both light and dark mode. Only reach for it if the CRM
genuinely needs a second, permanently-dark rail; don't use it as a stand-in
for collapsing the main sidebar.

```scss
.sidebar--compact {
	width: 72px;
	background: $slate-900; // intentionally NOT var(--color-bg-surface) — always dark
	align-items: center;
	padding: $space-5 0;

	.sidebar__nav-item {
		width: 44px;
		height: 44px;
		justify-content: center;
		color: $slate-400; // intentionally NOT var(--color-text-secondary), same reason
		border-radius: $radius-lg;

		&--active {
			background: rgba(255, 255, 255, 0.1);
			color: $slate-0;
			&::before {
				display: none;
			} // no left-bar in the compact rail
		}
	}
}
```

---

## Top Bar

Reference: rounded search field with a `⌘F` shortcut hint pill, circular
icon buttons (mail, notifications — with a small unread dot), and the
profile cluster (avatar + name + email) on the right.

```scss
.topbar {
	display: flex;
	align-items: center;
	gap: $space-4;
	height: 72px;

	&__search {
		flex: 1;
		max-width: 420px;
		display: flex;
		align-items: center;
		gap: $space-2;
		height: 44px;
		padding: 0 $space-4;
		border-radius: $radius-full;
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-muted);
	}

	&__search-kbd {
		margin-left: auto;
		padding: $space-1 $space-2;
		border-radius: $radius-sm;
		background: var(--color-bg-surface);
		font-size: $text-body-sm;
		color: var(--color-text-muted);
	}

	&__icon-btn {
		@extend .btn, .btn--icon;
		position: relative;
	}

	&__icon-btn-dot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 8px;
		height: 8px;
		border-radius: $radius-full;
		background: var(--danger-solid);
		border: 2px solid var(--color-bg-surface);
	}

	&__profile {
		display: flex;
		align-items: center;
		gap: $space-3;
	}

	&__profile-email {
		font-size: $text-body-sm;
		color: var(--color-text-muted);
	}
}
```

---

## Kanban / Pipeline Board

Reference: the F·H·R recruitment pipeline — this maps directly onto a
contractor CRM's deal/job pipeline (Lead → Quoted → Scheduled → Won, or
similar). Column header shows a checkbox, title, sort icon, then a
"X REJECTED Y TOTAL" stat row, then a thin colored divider whose color
cycles per column to help the eye track stage-to-stage at a glance.

```scss
.pipeline {
	display: flex;
	gap: $space-5;
	overflow-x: auto;
	padding-bottom: $space-4;
}

.pipeline-column {
	flex: 0 0 320px;
	display: flex;
	flex-direction: column;
	gap: $space-4;

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	&__title {
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	&__stats {
		display: flex;
		justify-content: space-between;
		font-size: $text-body-sm;
		color: var(--color-text-muted);
	}

	&__stats-value {
		font: $weight-bold #{$text-heading-lg}/ 1 $font-display;
		color: var(--color-text-primary);
	}

	&__divider {
		height: 3px;
		border-radius: $radius-full;
		background: var(--color-border);

		// assign per stage so each column reads as a distinct step
		&--applied {
			background: var(--info-solid);
		}
		&--shortlisted {
			background: var(--success-solid);
		}
		&--interview {
			background: var(--danger-solid);
		}
		&--evaluation {
			background: var(--warning-solid);
		}
	}

	&__list {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		overflow-y: auto;
	}
}

.pipeline-card {
	display: flex;
	align-items: center;
	gap: $space-3;
	padding: $space-4;
	border-radius: $radius-md;
	background: var(--color-bg-surface);
	box-shadow: var(--shadow-sm);
	cursor: grab;
	transition: box-shadow $duration-fast $ease-standard;

	&:hover {
		box-shadow: var(--shadow-md);
	}

	&__avatar {
		flex-shrink: 0;
	}

	&__body {
		flex: 1;
		min-width: 0;
	}

	&__name {
		display: flex;
		align-items: center;
		gap: $space-2;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	&__meta {
		font-size: $text-body-sm;
		color: var(--color-text-muted);
	}

	&__footer {
		display: flex;
		align-items: center;
		gap: $space-2;
		margin-top: $space-1;
		font-size: $text-body-sm;
		color: var(--color-text-secondary);
	}
}
```

---

## Data Table

Not pictured directly, but follows from the same surface language: rows are
quiet until hovered, status lives in a `.badge`, and the header row uses the
`.eyebrow` treatment instead of bold body text.

```scss
.data-table {
	width: 100%;
	border-collapse: separate;
	border-spacing: 0;

	thead th {
		@extend .eyebrow;
		text-align: left;
		padding: $space-3 $space-4;
		border-bottom: 1px solid var(--color-border);
	}

	tbody tr {
		transition: background-color $duration-fast $ease-standard;
		&:hover {
			background: var(--color-bg-surface-sunk);
		}
	}

	tbody td {
		padding: $space-4;
		border-bottom: 1px solid var(--color-border);
		font-size: $text-body-md;
		color: var(--color-text-primary);
	}
}
```

---

## Form Inputs

Bits UI ships these unstyled — apply this block to the elements it renders
(see the Bits UI integration note in SKILL.md for how to target its
`data-*` attributes for state).

```scss
.field {
	display: flex;
	flex-direction: column;
	gap: $space-2;

	&__label {
		font-size: $text-body-sm;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
	}

	&__input {
		height: 44px;
		padding: 0 $space-4;
		border-radius: $radius-md;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-surface);
		font-size: $text-body-md;
		color: var(--color-text-primary);
		transition:
			border-color $duration-fast $ease-standard,
			box-shadow $duration-fast $ease-standard;

		&::placeholder {
			color: var(--color-text-muted);
		}
		&:focus {
			outline: none;
			border-color: var(--color-brand);
			box-shadow: var(--shadow-focus);
		}
		&[data-disabled] {
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-muted);
		}
	}

	&__hint {
		font-size: $text-body-sm;
		color: var(--color-text-muted);
	}
	&__error {
		font-size: $text-body-sm;
		color: var(--danger-text);
	}
}
```

---

## Dialog / Modal (Bits UI)

```scss
.dialog-overlay {
	position: fixed;
	inset: 0;
	background: rgba(19, 21, 27, 0.4);
	backdrop-filter: blur(2px);
	z-index: $z-overlay;
}

.dialog-content {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 100%;
	max-width: 480px;
	background: var(--color-bg-surface);
	border-radius: $radius-xl;
	box-shadow: var(--shadow-xl);
	padding: $space-7;
	z-index: $z-modal;

	&[data-state='open'] {
		animation: dialog-in $duration-base $ease-standard;
	}
}

@keyframes dialog-in {
	from {
		opacity: 0;
		transform: translate(-50%, -48%) scale(0.98);
	}
	to {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}
}
```

---

## Avatar

```scss
.avatar {
	border-radius: $radius-full;
	object-fit: cover;
	flex-shrink: 0;

	&--sm {
		width: 32px;
		height: 32px;
	}
	&--md {
		width: 40px;
		height: 40px;
	}
	&--lg {
		width: 56px;
		height: 56px;
	}

	// fallback when there's no photo — initials on a tinted brand background
	&--fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--avatar-fallback-bg);
		color: var(--avatar-fallback-text);
		font-weight: $weight-semibold;
	}
}
```

---

## Progress & Gauges

Three shapes recur: a capsule bar chart (weekly activity), a circular arc
gauge (the "41% Project Ended" donut), and a plain linear bar (per-row
completion). All share fully-rounded ends — square-ended progress bars will
look out of place in this system.

```scss
.progress-bar {
	height: 8px;
	border-radius: $radius-full;
	background: var(--color-bg-surface-sunk);
	overflow: hidden;

	&__fill {
		height: 100%;
		border-radius: $radius-full;
		background: var(--color-brand);
		transition: width $duration-slow $ease-standard;
	}
}

// the capsule/pill bar used for "S M T W T F S" weekly charts — each bar is
// an independent rounded capsule, not a shared-baseline rectangle
.capsule-bar {
	width: 36px;
	border-radius: $radius-full;
	background: var(--color-bg-surface-sunk);

	&--filled {
		background: var(--color-brand);
	}
	&--peak {
		background: var(--color-brand-strong);
	} // the tallest/active day
}
```

For the circular gauge, build it as an SVG `<circle>` with
`stroke-dasharray`/`stroke-dashoffset` driven by the percentage, stroke
`var(--color-brand)`, track stroke `var(--color-bg-surface-sunk)`, `stroke-linecap:
round` — the rounded cap is what gives it that soft, friendly arc-end seen
in the reference instead of a sharp cut-off.
