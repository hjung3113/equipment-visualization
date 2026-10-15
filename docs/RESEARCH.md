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

## v0.3 공개자료 리서치 매트릭스 (한국어 원본)

**원칙:** 제조사 공식 공개 페이지는 제품 기능/구성 종류의 출처로 사용한다. 공개 사진이나 특허 도면의 픽셀/도형을 그대로 SVG에 복제하여 재배포하지 않는다. 특허 '실시예'를 제품의 확정 구조라고 단정하지 않는다.

| 분야 | 공식/공개 출처 | 신뢰 가능한 결론 | SVG 설계로 번역 | 알 수 없는 것 |
|---|---|---|---|---|
| Cluster | AMAT Endura PVD: https://www.appliedmaterials.com/us/en/product-library/endura-pvd.html | 최대 9개 process chamber 구성 가능 | variable N chamber + module family + transfer nodes | 개별 장비 실측 좌표/로봇의 실제 경로 |
| Cluster | AMAT Centura platform: https://www.appliedmaterials.com/us/en/blog/blog-posts/a-new-equipment-platform-for-a-new-era-of-chipmaking.html | 챔버 크기/장착 facet을 고려한 modular platform | radial TM, 다양한 PM 외곽/포트 | 사용자 장비의 구성 |
| Etch | Lam tool/vendor 특허 예 https://patents.google.com/patent/US6305565B1/en | 다양한 진공 모듈/robot arrangement가 존재 | dual-arm 혹은 특수 cluster 템플릿의 변형 가능성 | 특허예 == 판매모델 보증 아님 |
| Clean/Photo | SEMES 제품군: https://www.semes.com/en/product/process; https://semes.com/en/company/corporate-overview | Clean, Photo, Etch 등 공정군 및 모델 제품군 존재 | clean wet / track / etch 별도 archetype | 실제 LOTUS 특정 내부 배치 |
| Track | TEL LITHIUS: https://www.tel.com/product/lithius.html | Coater/Developer, integrated transfer/align, 다양한 시스템 변형 | track module group + level stacking | 개별 tower module 좌표/개수 |
| Scanner | ASML twin stage: https://www.asml.com/en/company/stories/2021/twinscan-20-years-innovation | 두 wafer table 교대로 노광/계측 + 교환 | dual stage / two work locations / stage swap event | motion trajectory / 장비 정확한 footprint |
| Scanner | Canon: https://global.canon/en/technology/canon-tech/tech/semicon/ | illuminator/reticle stage/optics/wafer stage/alignment scope | optics, reticle, wafer, alignment separate compartments | 실제 Top View 정확한 형상 |
| Furnace | ASM A400 DUO: https://www.asm.com/our-technology-products/vertical-furnace/a400-duo | dual reactor / dual boat / stocker 구성, 일부 순차 배치 | boat as material group, 2 reactors, stocker/elevator | reactor의 정확한 평면 위치 |
| Furnace | ASM SONORA: https://www.asm.com/our-technology-products/vertical-furnace/sonora | 300mm dual reactor/boat, batch processing | batch capacity + multilevel side view | 정확한 상용 layout 치수 |
| Robot | RORZE RR757: https://www.rorze.com/en/products/rr757l15/ | atmospheric SCARA dual arm, optional X axis | arm / blade / X-track/kinematic property separation | vendor별 arm independent semantics |
| Software standards | SEMI: https://www.semi.org/en/products-services/standards/information_and_control | E87 carriers, E90 substrate, E40 processing, E94 control jobs | 별도 Material/Carrier/Process/Job identities | 사내 Raw Data 가용 컬럼 |
| Open source editor | React Flow: https://github.com/xyflow/xyflow | Node-edge handle 편집 적합, MIT | topology editor 후보 | precise editable semantic SVG 주 렌더로 맞는지 PoC 필요 |
| SVG transform | SVG.js: https://github.com/svgdotjs/svg.js | Native SVG 조작/애니메이션, MIT | SVG editor select/resize 후보 | React state 소유권 경계 설계 필요 |
| Asset library | draw.io docs: https://www.drawio.com/docs/manual/advanced/custom-shape-libraries/ | custom library xml 편집/공유 지원 | 참조/초안 제작, batch export | 정규 JSON 의미 계약 자동 보증 불가 |
