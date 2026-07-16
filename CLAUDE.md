# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

룸로그(Roomlog) — 임차인·관리인(개인 임대인)·수리업체 3역할을 잇는 AI 주거관리 플랫폼. pnpm 모노레포: **Next.js 16 web + NestJS api + 공유 타입/UI 패키지 + 3D 캡처/재구성 파이프라인**. 하자→티켓→수리→정산 E2E 흐름이 축.

**문서 진실의 출처 (읽는 순서)**: `docs/DOMAIN-RECIPE.md`(현재 기준 — 도메인 추가·컨벤션·함정) → `AGENTS.md`(전략·방법론, 단 프로토타입 셸 시절 서술 포함) → `docs/KNOWN-GAPS.md`(미완·서버측 원칙 강제 백로그). 두 문서가 충돌하면 **DOMAIN-RECIPE.md가 최신**이다 (레포가 인메모리 `app/` 셸 → Prisma + `src/app/` + 쿠키세션 인증으로 진화했고 옛 서술이 일부 남음).

## 명령어

표준 개발/테스트 환경은 **docker-compose** (web `:3000` · api `:4000` · postgres `:5433`).

```bash
pnpm docker:up                       # 스택 기동 (= docker compose up --build)
docker compose up -d --build web     # web 코드 변경 반영 (api도 동일)
docker compose logs -f web           # 로그
pnpm docker:down                     # 종료

pnpm dev:web / pnpm dev:api          # 호스트에서 개별 프로세스 (Next :3000 / Nest :4000)

pnpm db:generate                     # prisma generate (스키마 변경 후 필수)
pnpm db:push                         # 스키마 → DB (마이그레이션 히스토리는 db push 베이스라인)
pnpm db:migrate                      # prisma migrate dev — init 마이그레이션 부재로 재생 불가(부채), 신규 도메인엔 db push 사용
```

**검증** — DOMAIN-RECIPE 권장(직접 명령):

```bash
pnpm build:web && pnpm build:api     # 빌드
pnpm test:web && pnpm test:api       # 유닛 (test:api는 DB 의존 spec은 roomlog-postgres 없으면 skip)
node --test apps/web/property-shell.spec.mjs   # 셸 구조 스펙
bash scripts/verify.sh               # 원커맨드 스모크(types/ui typecheck + web/api 빌드 + api health/login)
```

- **단일 테스트**: api는 `node --test`라 `cd apps/api && node --test -r ts-node/register src/<domain>/<file>.spec.ts`. web은 `node --test <file>` 또는 `pnpm --filter web test:unit`.
- **DB 붙는 api 테스트**: `docker compose up -d postgres && pnpm db:test:push`, 그다음 `ROOMLOG_TEST_DATABASE_URL=...roomlog_test... pnpm test:api`.
- **필터명 함정**: web/api 패키지명은 **스코프 없는 `web`/`api`**다. `pnpm --filter @roomlog/web`은 no-op으로 조용히 통과한다. 공유 패키지는 `@roomlog/types`·`@roomlog/ui`.

## 아키텍처

### 프론트 (apps/web) — 단일 앱, 역할별 라우트
- `apps/manager` · `apps/tenant` · `apps/vendor`는 **빈 stale 디렉토리**(node_modules만). 세 역할 전부 `apps/web/src/app/<role>/<domain>/**`에 있다.
- **디바이스 셸**: 임차인/업체 = `PhoneFrame`(390×844), 관리인 데스크탑 = `ManagerShell`. (from `@roomlog/ui`)
- **데이터 화면 = async 서버 컴포넌트**가 `src/lib/<domain>-api.ts`(BFF)를 await.
- **BFF 패턴**: `src/lib/<domain>-api.ts`의 `serverFetch`(`src/lib/server-api.ts`)가 httpOnly 쿠키 토큰(`roomlog_token`)을 `Authorization: Bearer`로 Nest에 forward. **서버 전용**(`next/headers` 의존). 데이터 없음/인증 전/오류 시 `demo-<domain>.ts`로 폴백하되 **경고 로그**를 남긴다(빈 상태·오류를 데모로 은폐 금지).
- **서버/클라 경계 함정**: `serverFetch`/`next/headers` 의존 모듈을 `"use client"` 컴포넌트가 import하면 빌드가 깨진다(클라 번들이 `next/headers`를 끎). 클라에서 API 필요 시 fetch-only 파일로 분리(예: `market-api.ts` vs 서버전용 `api.ts`).

### 백엔드 (apps/api) — NestJS, 하이브리드 구조
- **Core 도메인**: 단일 `apps/api/src/roomlog/`. 라우트=`roomlog.controller.ts`, 로직=`roomlog.service.ts`(~11.7k줄, 도메인별 서브서비스는 `roomlog/services/*.domain.ts`로 분리), 영속화=`prisma-store-projector.ts`. 서비스는 **인메모리 `Store`를 보유하고 쓰기를 Postgres로 미러링**하는 `StoreProjector` 패턴(`DATABASE_URL` 있으면 활성).
- **주변/독립 도메인**: 별도 Nest 모듈 — `market`(부동산 시세/LAWD), `listings`, `furniture-catalog`(크롤/CSV 임포트), `splat-asset`(3D), `trade`(계약↔빌링 브리지), `realtime`(웹소켓). `app.module.ts` imports에 한 줄 등록.
- **인증**: 데모 쿠키세션. `/api/auth/login`이 httpOnly 토큰 심음. 통합 로그인은 multi-role 계정을 파생 roles로 반환. 데모 계정 `*@roomlog.test` / `password123!`.
- **AI**: `OPENAI_API_KEY` 있으면 OpenAI Responses/Realtime 경로, 없으면 로컬 안전 fallback.

### 공유 패키지
- `@roomlog/types` (`packages/types`): 도메인 모델. **소스 직접 소비**(`main: ./src/index.ts`) — dist 빌드 불필요, 편집 후 `index.ts` re-export만 하면 api/web이 즉시 봄. re-export 빠뜨리면 안 보임. 신규 타입은 **도메인 접두어**(`Vendor*`, `Moveout*`) — 이름 충돌 방지.
- `@roomlog/ui` (`packages/ui`): `tokens.css`(CSS 변수) + 컴포넌트(Button·Card·Badge·Input·PhoneFrame·ManagerShell). **스타일은 `var(--...)` 토큰만, raw hex 금지.** 코스믹 스킨은 `.theme-cosmic` opt-in 테마.

### 3D 투어 파이프라인 (부수 시스템)
- `apps/capture-ios/`: iOS 캡처 앱(Xcode 프로젝트). Xcode는 ASIF 볼륨에서 실행(개인 셋업).
- `scripts/reconstruct/`: 영상→`.spz` 재구성 **수동 런북**(GPU 박스, nerfstudio Docker: COLMAP SfM → gsplat splatfacto → `.ply` → `.spz`). 뷰어는 `apps/web/public/samples/room.spz`를 로드.
- web `splat-tour`·`floor-plan-3d` 뷰어 + api `splat-asset` 모듈(`SplatAsset` 모델).

## 데이터 모델 (Prisma 7, Postgres 18)
`prisma/schema.prisma` — 80+ 모델(하자·티켓·수리·비용·빌링·계약·이사정산·메시징·리포트·3D). 스키마 변경 후 `pnpm db:generate` 필수, DB엔 `roomlog-postgres` 컨테이너가 떠 있어야 함. 마이그레이션은 db push 베이스라인(migrate dev 재생 불가 — 부채).

## 도메인 작업 시 (요약 — 상세는 docs/DOMAIN-RECIPE.md)
1. **좁은 목 먼저**: `packages/types/src/<domain>.ts` 계약 확정 + `index.ts` re-export.
2. **모델**: `schema.prisma` 추가 → `db push`(또는 migrate) + `db:generate`.
3. **모듈**: core면 `roomlog.controller`/`roomlog.service`(+projector), 독립이면 새 Nest 모듈 → `app.module.ts` 등록. 역할 가드 필수.
4. **화면 배선**: `src/app/<role>/<domain>/**` → `src/lib/<domain>-api.ts` serverFetch.
5. **원칙 게이트**: 클라 disabled 버튼이 아니라 **서버에서 강제**.

### 횡단 원칙 (화면마다 확인 — 이 제품의 정체성)
티켓 상태 ≠ 수리 상태 · AI 책임 확정 금지(가능성만) · 공백 ≠ 책임 추정(D27) · 결제=완료 후 게이트 · 자동 발송/독촉 금지(명시 승인 후, 1:1 독촉 금지) · 존엄/false-agency 금지. 돈 도메인 하드 원칙은 `docs/KNOWN-GAPS.md` 납부 섹션. 스코프는 **개인 임대인(집 1~5채·1인 운영)** — 기업 SaaS 스케일 아님.

### 병렬 작업 (worktree)
도메인별 `git worktree` 격리 후 머지. **자기 도메인 폴더만** 수정, 공유는 읽기만. 머지 충돌 예상 지점 = `packages/types/src/index.ts`(re-export) · `apps/api/src/app.module.ts`(imports) · `apps/api/src/roomlog/*`(core) · `src/lib/*-api.ts`(함수 추가) — 대개 양쪽 다 살리는 append 충돌.
