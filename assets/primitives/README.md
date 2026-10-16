# Equipment primitives

25 synthetic, illustrative symbols redrawn from the owner-approved prototype for #34. Not OEM drawings, measured dimensions or validated robot kinematics. Arms do not specify blade counts or establish kinematics. Labels belong to the consuming renderer.

Geometry is generated from the prototype’s symbol-only primitive-sheet recipe at `k = 1`, using its default sizes and centred origin. The centred viewBox encloses every shape, including transformed robot blades, plus half its stroke width. Coordinates are rounded to two decimals. No labels or element IDs are baked in.

## Theme tokens

The standalone assets read only `--eqv-*` custom properties with the approved light fallback below. The optional platform adapter injects the listed platform token values; the primitives have no platform dependency. Tokens for canvas, overlays and labels are listed for the shared renderer theme even where the primitive symbols do not use them. Robot and material fills are literal approved palette values with no corresponding prototype platform token.

The adapter must inject complete CSS colours. analytics-platform tokens hold RGB channel lists (for example `--chart-blue-stroke: 37 119 204`), so map them as `--eqv-process-stroke: rgb(var(--chart-blue-stroke)); --eqv-process-fill: rgb(var(--icon-blue-soft));`. A defined custom property with the wrong value type is not rescued by the SVG fallback.

| Token | Purpose | Fallback | Platform token mapping |
| --- | --- | --- | --- |
| `--eqv-canvas` | Canvas background | `#f3f7fe` | `--surface-canvas` |
| `--eqv-board` | Equipment board background; housing body | `#fbfdff` | `--surface-card` |
| `--eqv-border` | Board and panel borders | `#cbd6e6` | `--border-subtle` |
| `--eqv-ink` | Primary labels | `#101828` | `--text-primary` |
| `--eqv-secondary` | Secondary labels | `#374151` | `--text-secondary` |
| `--eqv-process-fill` | Process body fill | `#e3efff` | `--icon-blue-soft` |
| `--eqv-process-stroke` | Process outlines and glyphs | `#2577cc` | `--chart-blue-stroke` |
| `--eqv-holding-fill` | Holding body fill | `#dcf8ef` | `--icon-teal-soft` |
| `--eqv-holding-stroke` | Holding outlines and glyphs | `#008090` | `--chart-teal-stroke` |
| `--eqv-robot-fill` | Robot body fill | `#f3eefd` | Literal palette value (no platform token) |
| `--eqv-robot-stroke` | Robot outlines and arms | `#8154ce` | `--chart-purple-stroke` |
| `--eqv-structure-fill` | Structural body fill | `#edf3fb` | `--surface-sunken` |
| `--eqv-structure-stroke` | Structural outlines | `#667083` | `--border-control` |
| `--eqv-interface` | Physical Interface overlay | `#374151` | `--text-secondary` |
| `--eqv-capability` | Transfer Capability overlay | `#8154ce` | `--chart-purple-stroke` |
| `--eqv-selection` | Selection outline | `#1428a0` | `--accent-primary` |
| `--eqv-highlight` | Conflict highlight rings and observed-transfer line | `#b42318` | Literal palette value (no platform token) |
| `--eqv-selection-fill` | Selection fill | `#e4e8f6` | `--accent-primary-soft` |
| `--eqv-detail-fill` | Interior stations, hubs and joints | `#ffffff` | `--surface-field-filled` |
| `--eqv-material-fill` | Material fill | `#f7e4cd` | Literal palette value (no platform token) |
| `--eqv-material-stroke` | Material outline | `#b45309` | `--cat-amber-stroke` |
| `--eqv-assumed-fg` | Assumed certainty foreground | `#8e5500` | `--text-warning-label` |
| `--eqv-assumed-bg` | Assumed certainty background | `#f4ece0` | `--accent-warn-soft` |
| `--eqv-evidence` | Evidence overlay | `#374151` | `--text-secondary` |

## Semantic classes and sizing

- **process (11):** pm, cell, coater, developer, dry, bake, reactor, exposure, metrology, stage, optics.
- **holding (6):** lp, loadlock, buffer, aligner, boat, stocker.
- **robot (4):** robot-single, robot-dual, robot-multi, handler.
- **structure (4):** efem, tm, rail, housing.

Each symbol uses its own class’s fill/stroke and `--eqv-detail-fill`. The housing body uses `--eqv-board` instead of structure fill, as in the approved prototype.

Under ADR-0006, structural primitives (efem, tm, rail, housing) carry `preserveAspectRatio="none"` and stretch to the Component footprint. Module and robot symbols keep the SVG default, preserving aspect ratio and fitting centrally inside the footprint. Every stroked shape carries `vector-effect="non-scaling-stroke"`, so line weights stay at their drawn screen width when a symbol is fitted or stretched (the approved prototype compensated stroke width for scale); this applies when the SVG is inlined, which is how the renderer uses it. Because a screen-width stroke does not shrink with the symbol, the root `<svg>` also carries `overflow="visible"`: at reduced scale the outermost half-stroke may extend past the viewBox edge and must not be clipped; the renderer leaves a few pixels of clearance between neighbouring symbols. Footprint and pose are illustrative geometry, never evidence of connectivity or motion.

The first shape after `<title>` is the body. In the 17 module and holding primitives, every element after the body is wrapped in one `<g data-part="glyph">`. The body bytes and the glyph element bytes are unchanged. That group is the interior symbol the renderer may shrink or offset when a label needs room inside the footprint. Robot and structure primitives have no glyph group.

## Removed #7 tokens

No consumer existed for the removed names: `--eqv-accent-fill`, `--eqv-accent-stroke`, `--eqv-detail-stroke`, `--eqv-handler-fill`, `--eqv-handler-primary`, `--eqv-handler-secondary`, `--eqv-handler-stroke`, `--eqv-module-fill`, `--eqv-module-stroke`. The retained `--eqv-detail-fill`, `--eqv-structure-fill` and `--eqv-structure-stroke` names take the new defaults above.

See [NOTICE](../NOTICE.md) for per-file origin and background references.
