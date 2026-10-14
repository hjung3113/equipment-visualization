---
status: accepted
---

# 레이아웃 연결은 세 개의 분리된 graph다

레이아웃의 연결 정보는 **Physical Interface**(포트 간 물리 접점, `kind`로 gate/slit/docking/optical 등 구분), **Transfer Capability**(어떤 Handler로 두 Holding Site 사이 이송이 가능한가), **Process Route**(설명용 대표 공정 흐름 순서) 세 graph로 따로 저장하며, 어느 것도 시각적 인접성에서 추론하지 않는다. 물리 접점이 있어도 이송이 불가능할 수 있고(service port), 이송이 가능해도 공정 흐름에 안 쓰일 수 있으며, 하나의 graph로 합치면 "가능"과 "실제로 있었음"이 화면에서 구분되지 않는다. 로그상 실제 이송은 레이아웃이 아니라 Replay 런타임 데이터(Occurrence)이므로 어느 graph에도 넣지 않는다. Process Route는 Replay 근거로 쓰지 않는다.
