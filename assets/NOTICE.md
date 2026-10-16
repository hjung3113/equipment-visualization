# Asset provenance and notice

Every asset below originates in `equipment-visualization-design-v0.3.zip`, SHA-256 `9e510a228bfa6da20e3a80749d991c91e5b8ed826bab62f51b127e355730aac2`. All are synthetic/illustrative generic concepts, not OEM drawings, measured dimensions or validated kinematics. Public references provide background only: their URLs do not confer a redistribution licence for manufacturer photographs, diagrams or other material. No such images are included.

Templates are converted v0.4 semantic documents; primitives were restyled in #34 as redrawn generic glyphs from the owner-approved prototype (2026-10-15), with semantic theme tokens. They remain synthetic, not OEM depictions. Primitive references are pack-wide background, not claims about individual symbol geometry. All layout provenance cites the synthetic pack as assumed.

The Korean Endura reference row states an upper bound of nine process chambers; it supplies no complete range. #27 therefore records **assumed** ranges (owner decision, 2026-10-15) for the repeated module Roles of the two cluster templates: `pm` 1–9 (upper bound from the Endura row, lower bound assumed), `ll` 1–2 and `lp` 1–4 (assumed). They are not measured on any specific equipment. Every other Role, and every Role of the other four templates, keeps min = max = its drawn count.

## Conversion rules (one-off converter, not committed)

- #32 restored the v0.3 `bounds.w/h` as Component footprint `size.width/height` in layout units (ADR-0006).
- #33 re-authored positions, rotations and footprints from the owner-approved prototype (2026-10-15): radial cluster PMs on TM facets, LLs between EFEM and TM, robots inside their housing (centred in EFEM/TM), and LPs docked on the EFEM front. Geometry remains generic, synthetic and not OEM-faithful, with `transform` and `size` assumed from `src-v03-pack` and `src-geometry-2026-10`. Ports retain their relative footprint positions; connectivity was not derived from the new geometry.
- Transfer Capabilities come only from v0.3 `transfer-access` edges. Each edge names a hub (or robot) and a module; the serving robot is the robot endpoint or the hub's single robot child. Every pair of distinct modules served by one robot gets one capability per pair of Holding Sites that share a material kind **the robot's blades can hold**, handler = that robot, Certainty `assumed`. This is possibility, not evidence of transfer. A wafer robot therefore links wafer slots (including load port to load port) but never carrier or boat places.
- Edges with no robot endpoint and no robot child are skipped, never given an inferred handler: lithography `edge-03` (STAGE_A→EXPOSE), `edge-04` (STAGE_B→METRO); furnace `edge-02` (STOCK→BOAT1), `edge-03` (STOCK→BOAT2).
- Holding Sites (all `assumed`): process-like modules `station-1`; `ll` `slot-1`, `slot-2`; robots one `blade-*` per v0.3 `bladeCount` (arm count is not a site count); `lp` `carrier` + `slot-1`…`slot-25`; boat `load`; reactor `boat`; stocker one `place-*` per v0.3 port; structural Roles none.

## assets/templates/cluster-dual-hub.template.json

Origin: v0.3 pack `templates/cluster-dual-hub.layout.json` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>

## assets/templates/cluster-single.template.json

Origin: v0.3 pack `templates/cluster-single.layout.json` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>

## assets/templates/lithography-dual-stage.template.json

Origin: v0.3 pack `templates/lithography-dual-stage.layout.json` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://global.canon/en/technology/canon-tech/tech/semicon/>

## assets/templates/track-stacked.template.json

Origin: v0.3 pack `templates/track-stacked.layout.json` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://www.tel.com/product/lithius.html>

## assets/templates/vertical-batch-furnace.template.json

Origin: v0.3 pack `templates/vertical-batch-furnace.layout.json` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>

## assets/templates/wet-linear.template.json

Origin: v0.3 pack `templates/wet-linear.layout.json` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://www.semes.com/en/product/process>

## Primitive restyle (#34)

All 25 primitives below use the owner-approved prototype’s symbol-only glyphs and body frames, generated at `k = 1`. The pack identifies their original archetype lineage; the #34 geometry and palette replace the original shapes and colours. No OEM image, label or validated kinematic claim is included. Robot arm count does not imply blade count. Templates and connectivity are unchanged by this restyle. See [primitive tokens and sizing](primitives/README.md).

## assets/primitives/aligner.svg

Origin: v0.3 pack `primitives/aligner.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/bake.svg

Origin: v0.3 pack `primitives/bake.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/boat.svg

Origin: v0.3 pack `primitives/boat.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/buffer.svg

Origin: v0.3 pack `primitives/buffer.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/cell.svg

Origin: v0.3 pack `primitives/cell.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/coater.svg

Origin: v0.3 pack `primitives/coater.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/developer.svg

Origin: v0.3 pack `primitives/developer.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/dry.svg

Origin: v0.3 pack `primitives/dry.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/efem.svg

Origin: v0.3 pack `primitives/efem.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/exposure.svg

Origin: v0.3 pack `primitives/exposure.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/handler.svg

Origin: v0.3 pack `primitives/handler.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/housing.svg

Origin: v0.3 pack `primitives/housing.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/loadlock.svg

Origin: v0.3 pack `primitives/loadlock.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/lp.svg

Origin: v0.3 pack `primitives/lp.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/metrology.svg

Origin: v0.3 pack `primitives/metrology.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/optics.svg

Origin: v0.3 pack `primitives/optics.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/pm.svg

Origin: v0.3 pack `primitives/pm.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/rail.svg

Origin: v0.3 pack `primitives/rail.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/reactor.svg

Origin: v0.3 pack `primitives/reactor.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/robot-dual.svg

Origin: v0.3 pack `primitives/robot-dual.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/robot-multi.svg

Origin: v0.3 pack `primitives/robot-multi.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/robot-single.svg

Origin: v0.3 pack `primitives/robot-single.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/stage.svg

Origin: v0.3 pack `primitives/stage.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/stocker.svg

Origin: v0.3 pack `primitives/stocker.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/primitives/tm.svg

Origin: v0.3 pack `primitives/tm.svg` (archive SHA-256 above). Synthetic/illustrative; not an OEM drawing.

Background references only:

- <https://global.canon/en/technology/canon-tech/tech/semicon/>
- <https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html>
- <https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html>
- <https://www.asm.com/our-technology-products/vertical-furnace/a400-duo>
- <https://www.asm.com/our-technology-products/vertical-furnace/sonora>
- <https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation>
- <https://www.semes.com/en/product/process>
- <https://www.tel.com/product/lithius.html>

## assets/equipment, assets/observations, assets/onboarding

Synthetic copies of the `fixtures/cluster-single/` fixture (#14), used as read-only Studio seed data for the equipment `eq-synth-01`: `observations/eq-synth-01/occurrence-batch.json` and `alias-metadata.json`, and the `onboarding/{scopes,mappings,bindings}` tree are byte copies; `equipment/eq-synth-01.json` is the equipment record. They contain no OEM, customer or measured data.
