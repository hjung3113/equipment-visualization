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
- This GitHub repository **does not yet contain** the full v0.3 generated asset pack; see [M0 issue](https://github.com/hjung3113/equipment-visualization/issues/1).

## Release gates
1. Catalog/layout schema and version control — review semantic representation before mass SVG generation.
2. XML/JSON schema + semantic port adjacency + cross-level and duplicate wafer occupancy checks.
3. Snapshot comparison at realistic zoom/viewport, performance and keyboard access.
4. Replay observational fidelity: missing event/carryover/out-of-order/late update and unknown mapping.
5. Public asset provenance/license checks; do not use company confidential material in examples.
6. Independent Studio build and platform integration both verified before advertising usability.

All claims are about **synthetic conceptual fixtures** unless a verified public reference is explicitly linked.
