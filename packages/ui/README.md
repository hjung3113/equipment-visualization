# @eqv/ui

EV components for UI patterns that FeedbackOps `@fops/ui` does not provide (ADR-0008, amended 2026-10-18).

**The rule:** a screen never restyles such a pattern itself. It gets a component here first, built only from `@fops/ui` primitives and theme utilities (no raw colours, no arbitrary values, no inline styles; the design lint checks `src/**/*.tsx`). Screens use these components without adding colour or typography classes; `core` and `renderer` must not import this package.

The package is consumed as TypeScript source (`exports` → `src/`). The host imports `@eqv/ui/styles.css` after the `@fops/ui` theme so Tailwind scans these components (Studio: `apps/studio/src/studio.css`). `@fops/ui` and `react` are peer dependencies. Words are the consumer's; this package owns none.

## Components

- `DataTable` — dense table (32px minimum row and header height, `4px 12px` cell padding, small uppercase secondary header). Props: `label` (accessible name, also names the scroll region), `columns` (header texts, `<th scope="col">`), `children` (`DataTable.Row`s); other `<table>` attributes (for example `role="grid"`) pass through.
  - `DataTable.Row` — `onActivate?` makes the row focusable and fires on click, Enter and Space; `selected?` sets `aria-selected`. Arrow-key roving focus stays with the consumer (pass `tabIndex` and `onKeyDown`).
  - `DataTable.Cell` — `<td>`, or `<th scope="row">` with `rowHeader`; `colSpan` etc. pass through.
- `EvidenceBadge` — `level: EvidenceLevel` (`observed | derived | illustrative | unknown`) and `children` (the label). The level shows without colour: always its text, plus a distinct border style per level (solid, dashed, dotted + italic, double). `illustrative` never looks like `observed` (ADR-0003). The level is exposed as `data-evidence` on the badge.
- `Legend` — `label` (accessible name of the list) and `items: { swatch: ReactNode; label: ReactNode }[]`; `swatch` is the consumer's (for example an SVG pattern) or `null` for a text-only row.
- `AppFrame` — app shell in AP ADR-0011 structure: brand rail, collapsible sidebar (head with the app name and a collapse toggle, `nav` of items), skip link and a focusable `main#eqv-main`. Props: `appName`, `brand` (rail mark letters, decorative), `items: { key; label; icon; href; current }[]` (`current` → `aria-current="page"`; collapsed items keep their name via `aria-label` and a tooltip), `linkComponent?` (the router link, default `a`), `labels: { nav; skipToContent; collapse; expand }`, `children`. Adds no heading. Collapse state is local; no persistence or shortcut yet.
- `Page` — page head over the padded body. Props: `title?` (the page `h1`; without it only the body renders, for content that owns its heading), `description?`, `actions?` (right side of the head), `children`. Works without `AppFrame`.
