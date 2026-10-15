# @eqv/renderer

Static read-only SVG Top View for a v0.4 Layout document (issue #12, slice S7, part 12a). Selection, focus, keyboard, pan/zoom, port marks and evidence overlays are 12b and are not in this package.

The picture is derived. Connectivity is only what the layout states: a Physical Interface mark is one explicit `physicalInterfaces` entry, and a Transfer Capability segment is one explicit handler endpoint. Neither is inferred from adjacency, overlap or port coordinates. Footprint and pose are illustrative. A capability segment means a transfer is possible, not that one was observed. An assumed badge is a certainty cue, not evidence.

## Render

`TopView` takes `layout`, `width` and `height` (CSS pixels from the host; there is no ResizeObserver). It sets `pxPerUnit = min(width / viewBox.width, height / viewBox.height)` and calls `buildScene`, which is pure and does not touch the DOM. `k = 1 / pxPerUnit` is one screen pixel in layout units. Fixed-pixel geometry drawn inside a component group uses `kLocal = k / S`, where `S` is the product of that component's scale and its ancestors' scales.

With a footprint, structures stretch to it. A structure body that is a `rect` is redrawn at the footprint with a 12px corner radius; other structure children (rail lines, the `tm` polygon) stretch with the viewBox. Module, holding and robot symbols scale uniformly by `min(w / viewBoxWidth, h / viewBoxHeight)` and stay centred. Without a footprint the natural viewBox is drawn at scale 1. Nothing is parsed at runtime and nothing is injected with `innerHTML`: primitives are compiled to `SvgNode` trees.

Default options: `labels: 'label'`, interfaces on, certainty / holding sites / capabilities off, every level visible.

| Prop | Meaning |
| --- | --- |
| `labels` | `'label'` (default), `'id'`, or `'none'` |
| `layers.interfaces` | One collar per explicit Physical Interface. Default on. |
| `layers.capabilities` | One segment per distinct handler endpoint. Possible, not observed. Default off. |
| `layers.holdingSites` | One count chip per component that declares at least one Holding Site. Not per-site positions, and not a blade count. Default off. |
| `layers.certainty` | An "A" badge on each non-structure component whose provenance has an `assumed` entry. An absent key stays unknown. Default off. |
| `visibleLevelIds` | Levels to draw. A hidden component keeps `data-component-id` and `data-hidden="true"` so the id still appears once, and its visible descendants stay nested. |

Overlay layers, in order: `interfaces`, `capabilities`, `labels`, `badges`, then `chips`. Holding-site chips are a fifth layer; the four named layers do not include them. Labels are upright in world coordinates. `outside` labels and annotations can extend past the Components' extent, so a layout's `viewBox` should leave room for them.

## Caveats

- Port positions are not drawn. Template port pairs are too far apart to be the interface geometry; the collar sits on the two footprints.
- Text width is estimated, not measured. Hangul and CJK count as 1.0px, other uppercase and digits 0.62, lowercase 0.55, space 0.3, and every other character (including punctuation) 0.55. Mono mode, used for id labels, is 0.6 for every character. The font itself stays `inherit`.
- `handler` has no glyph group, so center level-of-detail cannot hide its fork; the fork lives in `rest` and still draws. Arm robots (`robot-single`, `robot-dual`, `robot-multi`) use the four-candidate label placement instead of the module band.
- A hidden component still occupies its footprint when robot labels look for collisions. It does not emit a label, chip or badge.
- Paint is `none` or `var(--eqv-*, #hex)` from the primitive token table. There is no dark palette; a host injects tokens.

`sanitizePrimitive` is the allowlist parser used at codegen. The renderer does not call it on untrusted layout text.

## Demo

`pnpm --filter @eqv/renderer demo` serves `demo/` (not built, not published). `?stress=N` tiles `cluster-dual-hub` until at least N components exist. The first commit records `performance.measure('eqv-render')` and writes the duration into `#eqv-perf`.

## Performance

The conductor measures these in a browser and fills the cells. They are empty in this change.

| N | Duration (ms) |
| --- | --- |
| 1000 | |
| 2000 | |
