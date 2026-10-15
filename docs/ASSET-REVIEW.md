# Asset review — v0.3 design verification

## Existing design evolution
- **v0.1:** fixed SVG assets and layout demonstration; initially static icon art; not full robotic topology.
- **v0.2:** exposed lack of separate Arm/Blade/Joint model and missing layer/port semantics; requested deeper OEM structural review.
- **v0.3:** six generalized archetypes, 25 primitives, semantic IDs, normalized layout/observation JSON and pure structural tests in an offline design pack.

## Claims supported by local v0.3 design pack
- Static validation report: 594 checks / 0 reported issues.
- Static checks cover JSON Schema, XML, unique semantic IDs and expected internal references.
- Six abstract template families: single cluster; dual hub; linear wet; stacked track; dual stage; vertical furnace.

## Claims NOT supported yet
- No manufacturing drawing fidelity or equipment-specific dimensions.
- No validated robot kinematics/collision-free travel.
- No tested browser editing round-trip or actual draw.io import.
- No actual parser raw data, real system integration or replay execution.
- No verified Web UI/E2E, WCAG conformance, scale performance.
- Converted v0.4 templates (6) and themed primitives (25) are in `assets/`; see [asset provenance](../assets/NOTICE.md). Template SVG/PNG, the original Python generators/validator and v0.3 fixtures are intentionally excluded. Remaining gaps: no measured OEM dimensions, validated kinematics, browser editing round-trip or real-data integration; four handler-ambiguous transfer edges are omitted.

## v0.3 pack provenance
- Source archive: `equipment-visualization-design-v0.3.zip`, sha256 `9e510a228bfa6da20e3a80749d991c91e5b8ed826bab62f51b127e355730aac2` (61 files, kept outside the repository).
- Generated in an earlier design session from public references only; every layout carries `illustrative` evidence and `verified:false` ports.
- Import plan and v0.3 → v0.4 conversion rules: [DESIGN-v0.4 §12](DESIGN-v0.4.md#12-v03-팩-이관-결정). Original-pack gaps addressed by conversion: explicit Holding Sites, module↔module capabilities with a robot handler, separate Role/assetRef, Role-based Component IDs, theme colours and standalone primitive symbols. The two lithography stage edges and two furnace stocker edges without a unique immediate handler remain omitted; no connectivity is inferred from geometry.

## Release gates
1. Catalog/layout schema and version control — review semantic representation before mass SVG generation.
2. XML/JSON schema + semantic port adjacency + cross-level and duplicate wafer occupancy checks.
3. Snapshot comparison at realistic zoom/viewport, performance and keyboard access.
4. Replay observational fidelity: missing event/carryover/out-of-order/late update and unknown mapping.
5. Public asset provenance/license checks; do not use company confidential material in examples.
6. Independent Studio build and platform integration both verified before advertising usability.

All claims are about **synthetic conceptual fixtures** unless a verified public reference is explicitly linked.
