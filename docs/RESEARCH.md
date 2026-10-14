# Public reference research — v0.3

**Status:** conceptual reference matrix. Public marketing photography/patent illustrations must **not** be treated as validated production top views or as freely reusable artwork. Each imported third-party asset needs its own license/attribution check.

| Structural family | Public reference examples | What to learn | What remains uncertain |
|---|---|---|---|
| Radial / single-hub cluster | [Applied Materials Sym3Z](https://www.appliedmaterials.com/us/en/product-library/sym3z-etch.html); [Lam transfer patent](https://patents.google.com/patent/US6305565B1/en) | TM/PM and load-lock topology, arm reach and chamber ports | OEM dimensions and detailed actuator geometry |
| Multi-hub cluster | [AMAT transfer patents](https://patents.google.com/patent/US6074443/en) | multiple transfer zones, arm configuration, intermediate buffer | exact production layout for any particular configuration |
| Linear wet clean | [SEMES patent US20250069908A1](https://patents.google.com/patent/US20250069908A1/en) | Index module, rail, multiple treatment cells | whether patent drawings correspond to specific current SEMES products |
| Stacked photo track | [TEL CLEAN TRACK ACT series](https://www.tel.com/product/) | linear module banks, multiple Z levels for coating/development/bake | dimensions and precise grouping |
| Dual-stage lithography | [ASML TWINSCAN technology](https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation), [Canon semiconductor technology](https://global.canon/en/technology/canon-tech/tech/semicon/) | two stages, handler/reticle/stage/optics relationship | process-specific 3D internals not resolvable from top view |
| Batch vertical furnace | [ASM A400 DUO](https://www.asm.com/our-technology-products/vertical-furnace/a400-duo) | reactor/boat/stocker/loader, vertical handling | level geometry; boat/wafer carrier kinematics |
| Multi-arm/multi-blade robots | [RORZE robot products](https://www.rorze.com/en/), [AMAT transfer patent](https://patents.google.com/patent/US6074443/en) | arm count ≠ blade count, Z stack, independence | model-specific wrist linkage and motion limits |

## Design conclusions
- Manufacturer/process names are **tags**, not top-level class discriminants. Encode topology, movement, occupancy and levels independently.
- `RobotAssembly` should model mounting, base, arm count, end-effectors, holding sites, degrees-of-freedom (known or unknown).
- `Module` needs capacity/occupancy; a chamber may hold more than one substrate.
- `Connection` distinguishes physical contact, possible transfer path, optical/process relation; do not infer by proximity.
- `View` supports top/side/layer projections; one top SVG does not show every physical dimension.
- Generalized concepts can be built independently of published OEM artwork; reference pages are background evidence, not redistribution licenses.

## Open research work
- Trace each conceptual template to **at least one credible visual reference and one independent mechanism source** where possible.
- Verify licenses separately for draw.io shape libraries, SVG-Edit, VTracer, Inkscape and each third-party symbol pack; code license is not a blanket license for manufacturer's product images.
- Compare alternative robot configurations: same-base independent dual arm vs dual end-effector vs stacked/coaxial arrangements.
- Add horizontal furnace, track rail+vertical stack, and batch cassette/boat transfer as adversarial model tests.
