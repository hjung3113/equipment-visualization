# @eqv/renderer

SVG Top View for a v0.4 Layout document (issue #12, slice S7). `TopView` is the static read-only picture. `TopViewer` adds selection, keyboard focus, pan/zoom and selection-scoped Transfer Capability segments. Port marks are not in this package.

The picture is derived. Connectivity is only what the layout states: a Physical Interface mark is one explicit `physicalInterfaces` entry, and a Transfer Capability segment is one explicit handler endpoint. Neither is inferred from adjacency, overlap or port coordinates. Footprint and pose are illustrative. A capability segment means a transfer is possible, not that one was observed. An assumed badge is a certainty cue, not evidence.

## Render

`TopView` takes `layout`, `width` and `height` (CSS pixels from the host; there is no ResizeObserver). It sets `pxPerUnit = min(width / viewBox.width, height / viewBox.height)` and calls `buildScene`, which is pure and does not touch the DOM. `k = 1 / pxPerUnit` is one screen pixel in layout units. Fixed-pixel geometry drawn inside a component group uses `kLocal = k / S`, where `S` is the product of that component's scale and its ancestors' scales.

With a footprint, structures stretch to it. A structure body that is a `rect` is redrawn at the footprint with a 12px corner radius; other structure children (rail lines, the `tm` polygon) stretch with the viewBox. Module, holding and robot symbols scale uniformly by `min(w / viewBoxWidth, h / viewBoxHeight)` and stay centred. Without a footprint the natural viewBox is drawn at scale 1. Nothing is parsed at runtime and nothing is injected with `innerHTML`: primitives are compiled to `SvgNode` trees.

### Unknown and generic assets

An unknown `assetRef` draws a centred neutral rectangle with no glyph, using the Component's role for its class and its `size` when present (otherwise an 8×8 local-unit footprint). Its dashed outline, `data-asset-unknown="true"`, SVG title and interactive `aria-label` mark it as unknown. `generic-box` draws the same rectangle without the unknown markers.

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

## TopViewer

`TopViewer` takes every `TopView` prop, plus `selectedId`, `onSelectedChange`, `highlight`, `replay` and `renderControls`. Omit `selectedId` and the selection stays inside the viewer, starting empty. Pass `selectedId`, including `null`, to control it. `onSelectedChange` runs when a user changes the selection, in either mode. `replay` is optional; absent or `null` draws no replay layer. A new `layout` object resets the camera, the internal selection, hover and keyboard focus. `width` and `height` keep the zoom and the centre, then clamp the centre into the layout viewBox. `labels`, `layers` and `visibleLevelIds` keep the camera and the selection and rebuild at the current `pxPerUnit`. A `selectedId` that names nothing, or a hidden component, draws no highlight and is not cleared.

Zoom is a multiple of the meet-fit scale, from 1 to 8. While it is changing, the last scene stays put and only the `viewBox` moves, so labels and fixed-px marks are briefly the wrong size. 150 ms after the last zoom change the scene rebuilds at the new `pxPerUnit`. Selection, hover and pan avoid a scene build as long as the host keeps `layout`, `layers` and `visibleLevelIds` referentially stable (memoise them); a fresh object or array rebuilds the scene.

| Input | Effect |
| --- | --- |
| 확대 / 축소 / 맞춤 slot | `renderControls(controls)` replaces the three buttons below with the host's own: `controls` has `zoomIn()`, `zoomOut()`, `fit()` and `canZoomIn`, `canZoomOut`, `canFit`. The buttons below are the default and render only when the host passes no `renderControls`. Keyboard and wheel zoom are unchanged. |
| Wheel | Zoom toward the cursor: `zoom * exp(-deltaY * 0.002)`. A line delta counts as 16 px; a page delta counts as the view height. At a limit the page may scroll. |
| Drag | Pan after the pointer moves at least 4 px. A shorter press is a click. |
| 확대 | Zoom ×1.25 about the centre. Disabled at ×8. |
| 축소 | Zoom ÷1.25. Disabled at ×1, whatever the centre. |
| 맞춤 | Zoom 1 and centre on the layout. Disabled only when the view is already there. |
| `+` `=` / `-` / `0` | Zoom in, zoom out, and fit. |
| Arrow keys | Pan by 10% of the view. `Ctrl`, `Meta` and `Alt` are left to the browser. |
| Click | Toggle the component under the pointer. A click on the board clears the selection. |
| Enter / Space | Toggle the focused component. Space does not scroll the page. |
| Escape | Clear the selection. |

Focus rings are drawn only while the keyboard is what last moved the view. A click returns to pointer focus and hides them.

With a visible selection, capability segments are only that selection's, whatever `layers.capabilities` says. A handler shows one segment to each component it serves. Any other component shows the handler that serves it, and that handler's partner on the other end of each capability. A component with no capability draws none, even when the toggle is on and even when it touches another component. Segments come only from explicit `transferCapabilities`, and only through the handler: never from adjacency, and never from one component straight to another. A segment means a transfer is possible, not that one was observed. With no visible selection, the capabilities toggle draws every pair, as `TopView` does.

`TopViewer` does not paint the scene's own capability layer. Its order is the board, the component tree, the interaction marks (only when there is no highlight), `interfaces`, the selection's capability segments, the replay layer (only when `replay` is set), the highlight (only when set), the interaction marks again (when a highlight is present), `labels`, `badges`, then `chips`.

## Caveats

- Port positions are not drawn. Template port pairs are too far apart to be the interface geometry; the collar sits on the two footprints.
- Text width is estimated, not measured. Hangul and CJK count as 1.0px, other uppercase and digits 0.62, lowercase 0.55, space 0.3, and every other character (including punctuation) 0.55. Mono mode, used for id labels, is 0.6 for every character. The font itself stays `inherit`.
- `handler` has no glyph group, so center level-of-detail cannot hide its fork; the fork lives in `rest` and still draws. Arm robots (`robot-single`, `robot-dual`, `robot-multi`) use the four-candidate label placement instead of the module band.
- A hidden component still occupies its footprint when robot labels look for collisions. It does not emit a label, chip or badge.
- Paint is `none` or `var(--eqv-*, #hex)` from the primitive token table. There is no dark palette; a host injects tokens.

`sanitizePrimitive` is the allowlist parser used at codegen. The renderer does not call it on untrusted layout text.

## Demo

`pnpm --filter @eqv/renderer demo` serves `demo/` (not built, not published). It mounts `TopViewer` with an internal selection and mirrors that selection, id and label, into `#eqv-selection`. `?stress=N` tiles `cluster-dual-hub` until at least N components exist. The first commit records `performance.measure('eqv-render')` and writes the duration into `#eqv-perf`.

## Performance

First render of the demo's `?stress=N` layout (tiled `cluster-dual-hub`), measured as `performance.measure('eqv-render')` from just before `createRoot().render` to the root's first `useLayoutEffect`. Median of 5 page loads, all layers at their defaults. Chromium (Ego Lite), Apple-silicon Mac, `vite` dev server, so this is the React development build; a production build is faster. Measured 2026-10-16 on `feature/12-static-viewer`.

| N requested | Components | SVG elements | Median (ms) | Range (ms) |
| --- | --- | --- | --- | --- |
| 1000 | 1003 | 7204 | 122 | 112–138 |
| 2000 | 2006 | 14166 | 342 | 331–349 |

Doubling the Components almost triples the time, so part of `buildScene` grows faster than linearly in the Component count. The label and annotation collision checks are the likely cause. It hasn't been tuned, because the static scene is built once per picture. With referentially stable `layout`, `layers` and `visibleLevelIds` (memoise them), selection, hover and pan avoid another scene build; a fresh object or array rebuilds it. A wheel zoom rebuilds once after it settles.

Interaction cost on `?stress=2000` (2006 Components, about 14,900 SVG elements), same browser and dev build, measured 2026-10-16 on `feature/12-interactive-viewer`. Each input was dispatched after the view had settled, and main-thread long tasks (over 50 ms) were recorded for the next 120 ms. Frame-to-frame timings were not usable: in a background browser window `requestAnimationFrame` is throttled to about 1 s.

| Action | Samples | Main-thread long tasks | Notes |
| --- | --- | --- | --- |
| select (Enter on a Component) | 3 | none | selection only updates `aria-pressed` and the overlay |
| arrow-key pan | 3 | none | pans only move the `viewBox` |
| wheel zoom step | 3 | none | the `viewBox` moves; labels are briefly off-size |
| settled relayout after a zoom | 3 | one task, 283–314 ms (median 304) | the one scene rebuild, 150 ms after the last zoom change |
