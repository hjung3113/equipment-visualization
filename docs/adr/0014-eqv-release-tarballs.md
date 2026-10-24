---
status: accepted
---

# `@eqv/*`는 dist tarball Release로 내고, analytics-platform은 URL로 고정해 설치한다

결정자: 소유자 — 2026-10-25 (analytics-platform이 `@eqv/platform-adapter`를 EV GitHub Release tarball로 설치한다. EV가 AP SDK를 받는 방식([ADR-0013](0013-platform-sdk-release-tarballs.md))의 거울이다. 서브모듈은 쓰지 않는다). Decided.

[ADR-0012](0012-platform-first-sdk-host.md)와 [ADR-0013](0013-platform-sdk-release-tarballs.md)이 "마운트 PR에서 정함(#187)"으로 남긴 `@eqv/*` 설치 경로를 닫는다. `core`·`renderer`는 이미 `dist` exports이고 `replay`·`ui`·`views`·`platform-adapter`는 소스 exports라, 소비자가 받을 빌드 산출물이 없었다.

**결정.**

- **Release.** `eqv-vX.Y.Z`가 여섯 tarball `eqv-<name>-X.Y.Z.tgz`(`core`, `renderer`, `replay`, `ui`, `views`, `platform-adapter`)와 `SHA256SUMS`를 싣는다. 여섯 개가 SemVer 하나를 공유한다. `@eqv/editor`와 `apps/studio`는 싣지 않는다. 묶음은 `@eqv/platform-adapter`와 그 `dependencies`의 `@eqv/*` 폐포이며, 폐포가 이 여섯이 아니면 pack이 실패한다.
- **저장소 manifest는 그대로.** 저장소 `package.json`은 `version` `0.0.0`과 워크스페이스·소스 exports를 유지한다(Studio와 테스트는 바뀌지 않는다). `core`·`renderer`는 저장소에서도 `dist` exports, 나머지 넷은 소스 exports다.
- **pack 단계가 manifest를 다시 쓴다.** `pnpm eqv:pack --version X.Y.Z --out <dir>`(`tooling/scripts/eqv-pack.mjs`)가 패키지별로 `dist`를 지우고 `pnpm --filter <name> run build`로 빌드한 뒤, 저장소 밖 임시 디렉터리에 `dist`(core는 `schema/`도)와 생성한 `package.json`을 두고 `pnpm pack`한다. 생성 manifest: `./src/` 아래 `.ts`/`.tsx` export는 `dist`의 `{types, import}`로, `.css`는 같은 경로의 `dist`로 바꾸고, core·renderer의 `"."`와 core의 `./schema/*.json` 아홉 개는 그대로 둔다. `@eqv/*` 의존은 릴리스 버전과 정확히 같게, 그 밖의 의존(`zod`, `lucide-react`, `@tanstack/react-virtual`)은 현재 범위 그대로 둔다. `type`, `sideEffects`를 유지하고 `private`, `scripts`, `devDependencies`는 뺀다. `files`는 core `["dist","schema"]`, 나머지 `["dist"]`. 만든 archive에 `src/`, `test/`, `tsconfig*`, `workspace:` 범위, 느슨한 `@eqv/*` 버전이 있거나 exports가 가리키는 파일이 없으면 실패한다. `--out`은 없거나 비어 있어야 하며 아무것도 지우지 않는다.
- **패키지별 빌드.** `replay`·`ui`·`views`·`platform-adapter`에 `tsconfig.build.json`과 `build` 스크립트(`tsc -p tsconfig.build.json && node ../../tooling/scripts/eqv-finalize-dist.mjs`)를 둔다. 형제 패키지는 emit된 선언(`../<name>/dist/index.d.ts`)으로 해석한다. 마무리 스크립트가 `src/**/*.css`를 `dist`에 같은 상대 경로로 복사해, 각 `styles.css`의 `@source "./"`가 emit된 JS를 가리키게 한다.
- **Peer 계약.** 생성 manifest의 `peerDependencies`는 소스 패키지의 peer와 정확히 같다(core·renderer는 `@ap/*`를 얻지 않는다). `@ap/*`는 SDK 버전 정확값(오늘 `0.12.0`, EV가 빌드·검증한 버전), React는 `^19.0.0`이다. 호스트에는 `react`, `react-dom`, `@ap/ui`, `@ap/contracts`가 각각 한 벌이다. analytics-platform 워크스페이스의 `@ap/*`는 `workspace:*`(`0.0.0`)이라 정확값 peer와 어긋나므로, AP는 `peerDependencyRules.allowedVersions`에 `@eqv/*>@ap/*`를 둔다.
- **소비.** AP는 여섯 URL을 모두 의존으로 두고 `pnpm-workspace.yaml` `overrides`로 같은 Release 파일에 고정한다(EV가 `@ap/*`를 고정하는 방식). CSS는 `@import "tailwindcss"`, `@ap/ui/styles.css`, `@eqv/platform-adapter/styles.css` 순서다. 자세한 절차는 [INTEGRATION.md](../INTEGRATION.md).
- **검증.** `pnpm eqv:consumer-check <dir>`가 저장소 밖 임시 프로젝트에 여섯 tarball만 설치해 설치 → `react`·`react-dom`·`@ap/ui`·`@ap/contracts`·`@eqv/core` 단일 복사본 → `tsc`(`eqvManifest`, `eqvScreens` import) → vite build와 CSS 프로브(`ui`·`replay`·`views` 각각, 그 패키지 컴포넌트에서만 쓰는 클래스가 결과 CSS에 있어야 한다)를 확인한다. `@ap/*` URL·`@tiptap/*` 고정·패치는 `pnpm-workspace.yaml`에서, 도구 버전은 `apps/studio/package.json`에서 실행 시점에 읽는다. 이 검사는 **외부 SDK 소비자**를 덮을 뿐 analytics-platform 워크스페이스를 덮지 않는다. CI `Gate`의 `Build` 다음 단계가 pack과 이 검사를 돌린다.
- **태그와 업로드.** `eqv-vX.Y.Z` 태그와 Release는 소유자가 만든다(AGENTS.md: 태그는 사용자 소유). conductor는 `pnpm eqv:pack --version X.Y.Z`로 파일을 만들고, 그 세션에서 소유자가 허락한 경우에만 올린다. 태그로 도는 워크플로는 두지 않는다.

**그대로인 것.** ADR-0012·0013의 경계(`core`·`renderer`는 `@ap/*`를 import하지 않고, `@ap/contracts`는 어댑터만 쓴다), 런타임 소스 동작, `pnpm dev`와 기존 테스트.

## Considered Options

- **git 서브모듈:** 거절(소유자, 2026-10-25). EV는 `@ap/*`를 tarball로 고정하는데 AP는 `workspace:*`를 쓰고, AP도 FeedbackOps 서브모듈을 버렸다.
- **레지스트리 게시:** 나중에. 같은 파일을 올리면 되므로 이 결정과 충돌하지 않는다.
- **태그가 여는 워크플로:** 나중에. 릴리스가 잦아지면 다시 연다.
- **(채택) dist tarball Release + URL `overrides`:** 버전과 checksum이 있고 EV가 SDK를 받는 방식과 같다.

## Consequences

- 루트 `build`/`typecheck`/`test`의 선행 `turbo run build --filter=@eqv/studio^...`가 `replay`·`ui`·`views`도 tsc로 빌드한다(`platform-adapter`는 이 필터 밖이라 `eqv:pack`과 CI 단계에서만 빌드된다).
- SDK 버전을 올리는 PR은 `@ap/*` URL뿐 아니라 이 manifest들의 peer 정확값도 함께 바꾼다.
- 릴리스 절차(태그, Release, 업로드)는 소유자 승인 단계로 남는다.
