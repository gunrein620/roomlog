# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**집우집주(WOOZU)** — 임차인·관리인(개인 임대인)·수리업체 3역할을 잇는 AI 주거관리 플랫폼. pnpm 모노레포: **Next.js 16 web + NestJS api + 공유 타입/UI 패키지 + 3D 캡처/재구성 파이프라인**. 하자→티켓→수리→정산(토스 결제) E2E 흐름이 축.

**이름 이중성 주의**: 사용자 표면 브랜드는 **집우집주/WOOZU**(도메인 woo-zu.com)지만, 코드 식별자는 전부 **roomlog**다 — 레포명·패키지(`@roomlog/*`)·api 코어 디렉토리(`src/roomlog/`)·컨테이너명(`roomlog-*`)·env prefix(`ROOMLOG_*`)·쿠키(`roomlog_token`)·데모 계정(`@roomlog.test`). 사용자 노출 문자열만 집우집주/WOOZU를 쓰고, 코드 식별자는 roomlog를 유지한다.

**문서 진실의 출처**: **이 CLAUDE.md가 현행 정본**이다. `AGENTS.md`(전략·방법론)는 보조 참고이되 프로토타입 셸 시절 서술이 섞여 있어 — 충돌하면 **CLAUDE.md가 우선**이다 (레포가 인메모리 `app/` 셸 → Prisma + `src/app/` + 쿠키세션 인증으로 진화했고 옛 서술이 일부 남음). **함정**: 옛 문서·주석이 가리키는 `docs/DOMAIN-RECIPE.md`(옛 도메인 레시피)와 `docs/KNOWN-GAPS.md`(돈 도메인 하드 원칙·서버측 강제 백로그)는 **현재 레포에 없다** — 참조를 만나면 아래 "도메인 작업 시"·"횡단 원칙" 요약으로 갈음하고, 그 파일들을 찾으려 하지 말 것.

## 명령어

표준 개발/테스트 환경은 **docker-compose** (web `:3000` · api `:4000` · postgres `:5433`).

```bash
pnpm docker:up                       # 스택 기동 (= docker compose up --build)
docker compose up -d --build web     # web 코드 변경 반영 (api도 동일)
docker compose logs -f web           # 로그
pnpm docker:down                     # 종료
pnpm docker:prod                     # 프로덕션 compose (docker-compose.prod.yml, woo-zu.com 배포용)

pnpm dev:web / pnpm dev:api          # 호스트에서 개별 프로세스 (Next :3000 / Nest :4000)

pnpm db:generate                     # prisma generate (스키마 변경 후 필수)
pnpm db:push                         # 스키마 → 로컬 DB 반영 (⚠️ 프로드엔 안 감 — 아래 마이그레이션 필수)
pnpm db:migrate                      # prisma migrate dev — init 마이그레이션 부재로 재생 불가(부채)
bash scripts/check-schema-drift.sh   # schema.prisma ↔ 마이그레이션 드리프트 검사 (CI에서도 강제)
pnpm seed:vendor-credit-demo         # 업체 크레딧 데모 시드
```

**검증** (직접 명령):

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

### 프론트 (apps/web) — 단일 앱, 두 계층의 표면
- `apps/manager` · `apps/tenant` · `apps/vendor`는 **빈 stale 디렉토리**(node_modules만). 모든 화면은 `apps/web/src/app/`에 있다.
- **① 공개 탐색 표면 (비로그인, 반응형 웹)**: 매물 탐색 SPA. 루트 `HomeApp.tsx`(**~120KB 대형 클라이언트 컴포넌트** — 수정 시 주의)가 본체이고, `saved/`(찜) · `sell/`(매물등록) · `inquiry/`(매물 채팅) · `living/`(입주 후 허브) · `map/`(네이버 지도 방찾기) 라우트는 전부 `<HomeApp initialTab="...">` 얇은 래퍼다. `listing/[id]/`(매물 상세), `login/`(통합 WOOZU 로그인, `WoozuLoginScreen`). **PhoneFrame 안 씀.**
- **② 역할별 관리 표면 (로그인 후)**: `src/app/<role>/<domain>/**` (tenant/manager/vendor). **업체 = `PhoneFrame`(390×844) 모바일 셸, 관리인 데스크탑 = `ManagerShell`** (from `@roomlog/ui`). **세입자 본선은 공개 표면의 세입자탭**(`/living` → `my/flows/TenantMyPage.tsx`, 사용자 결정 2026-07-17) — 하자 접수·이력·상세(긴급도/이의제기/확정표시/채팅/완료확인)가 전부 탭 안 시트에서 이루어진다. `src/app/tenant/**` PhoneFrame 화면은 폐기 방향의 잔존 와이어프레임이니 세입자 신규 기능을 거기에 배선하지 말 것.
- **데이터 화면 = async 서버 컴포넌트**가 `src/lib/<domain>-api.ts`(BFF)를 await.
- **BFF 패턴**: `src/lib/<domain>-api.ts`의 `serverFetch`(`src/lib/server-api.ts`)가 httpOnly 쿠키 토큰(`roomlog_token`)을 `Authorization: Bearer`로 Nest에 forward. **서버 전용**(`next/headers` 의존). 데이터 없음/인증 전/오류 시 `demo-<domain>.ts`로 폴백하되 **경고 로그**를 남긴다(빈 상태·오류를 데모로 은폐 금지).
- **서버/클라 경계 함정**: `serverFetch`/`next/headers` 의존 모듈을 `"use client"` 컴포넌트가 import하면 빌드가 깨진다(클라 번들이 `next/headers`를 끎). 클라에서 API 필요 시 fetch-only 파일로 분리(예: `market-api.ts` vs 서버전용 `api.ts`).

### 백엔드 (apps/api) — NestJS, 하이브리드 구조
- **Core 도메인**: 단일 `apps/api/src/roomlog/`. 라우트=`roomlog.controller.ts`, 로직=`roomlog.service.ts`(**~13k줄**, 도메인별 서브서비스는 `roomlog/services/*.domain.ts`로 분리 — auth·checklist·contract·copilot·cost·floor-plan·messaging·moveout·report·vendor-* 등 14개), 영속화=`prisma-store-projector.ts`. 서비스는 **인메모리 `Store`를 보유하고 쓰기를 Postgres로 미러링**하는 `StoreProjector` 패턴(`DATABASE_URL` 있으면 활성).
- **주변/독립 도메인**: 별도 Nest 모듈, `app.module.ts` imports에 한 줄 등록 —
  - `market` 부동산 시세/LAWD · `listings` 매물 · `map`(MapSearchModule) 네이버 지도/주소 검색 · `furniture-catalog` 크롤/CSV 임포트 · `trade` 매물 거래·계약↔빌링 브리지 · `realtime` 웹소켓 · `splat-asset` 3D 자산 업로드/큐 · `reconstruction` GPU 재구성 오케스트레이션(인스턴스 기동·원격 잡).
  - **예외**: `credit`(CreditModule — 관리인 크레딧·수리비 결제 오더)은 app.module이 아니라 **`roomlog.module.ts` imports에 등록**되어 있다. `payment/toss-payment.gateway.ts`(토스 게이트웨이)는 credit이 소비.
- **결제 (토스, 이원 구조)**: (a) 관리인 크레딧 선충전 — `POST manager/credits/topup-orders` → confirm/reconcile. (b) 수리비 개별 결제 — 관리인·임차인 각각 `POST {manager|tenant}/vendor-payment-requests/:id/toss-orders` → `/repair-payment-orders/:orderId/confirm|reconcile|cancel|retry`. 프론트는 `src/lib/toss-payments.ts`(Toss v2 SDK 로더) + `tenant/repair-payment/[paymentRequestId]/` 체크아웃. env: `NEXT_PUBLIC_TOSS_CLIENT_KEY`·`TOSS_SECRET_KEY`.
- **인증**: 데모 쿠키세션. `/api/auth/login`이 httpOnly 토큰 심음. 통합 로그인은 multi-role 계정을 파생 roles로 반환. 데모 계정 `tenant|manager|vendor|multi@roomlog.test` / `password123!`. 소셜 로그인 env(NAVER/GOOGLE/KAKAO)도 `.env.example`에 있음.
- **AI**: `OPENAI_API_KEY` 있으면 OpenAI Responses/Realtime 경로, 없으면 로컬 안전 fallback. 계약서 OCR·Roboflow·NVIDIA 키도 `.env.example` 참조.

### 공유 패키지
- `@roomlog/types` (`packages/types`): 도메인 모델. **소스 직접 소비**(`main: ./src/index.ts`) — dist 빌드 불필요, 편집 후 `index.ts` re-export만 하면 api/web이 즉시 봄. re-export 빠뜨리면 안 보임. 신규 타입은 **도메인 접두어**(`Vendor*`, `Moveout*`) — 이름 충돌 방지.
- `@roomlog/ui` (`packages/ui`): `tokens.css`(CSS 변수) + 컴포넌트(Button·Card·Badge·Input·PhoneFrame·ManagerShell). **스타일은 `var(--...)` 토큰만, raw hex 금지.** 코스믹 스킨은 `.theme-cosmic` opt-in 테마.

### 3D 투어 파이프라인 (부수 시스템)
- `apps/capture-ios/`: iOS 캡처 앱(Xcode 프로젝트). Xcode는 ASIF 볼륨에서 실행(개인 셋업).
- **자동 경로**: web 업로드 → (S3 활성 시 presigned PUT으로 브라우저→S3 직행, 로컬은 기존 멀티파트 폴백 — `docs/splat-direct-upload.md`) → api `splat-asset`(큐잉) → `reconstruction` 모듈이 GPU 인스턴스 기동·`remote/gpu-job.sh` 실행 → `.spz` 산출 (ZIP 기반, PR #84).
- **수동 런북**: `scripts/reconstruct/` (GPU 박스, nerfstudio Docker: COLMAP SfM → gsplat splatfacto → `.ply` → `.spz`). GPU는 AWS g6e.2xlarge(L40S). 뷰어는 `apps/web/public/samples/room.spz`를 로드.
- web `splat-tour`·`floor-plan-3d` 뷰어. 타입은 `packages/types/src/splat-pipeline.ts`.

## 데이터 모델 (Prisma 7, Postgres 18)
`prisma/schema.prisma` — 75+ 모델(하자·티켓·수리·비용·빌링·계약·이사정산·메시징·리포트·크레딧/결제·3D). 스키마 변경 후 `pnpm db:generate` 필수, DB엔 `roomlog-postgres` 컨테이너가 떠 있어야 함. 프로덕션은 `docker-compose.prod.yml`의 `migration` 서비스(`migrate deploy`)가 담당.

**⚠️ 스키마 변경 = 마이그레이션 파일 필수.** 로컬은 `db push`로 즉시 반영되지만 **프로덕션은 `prisma/migrations/`의 파일만 재생**한다 — 파일 없이 schema.prisma만 바꾸면 배포는 초록불로 통과하고 Prisma가 없는 컬럼을 SELECT해서 해당 도메인 API 전체가 500 난다(20260720 · 20260722 두 번 터진 실사고). 규칙: ① schema.prisma 변경 시 같은 변경분의 SQL을 `prisma/migrations/<timestamp>_<name>/migration.sql`로 추가(개발 DB엔 이미 있을 수 있으니 `ADD COLUMN IF NOT EXISTS` 패턴) ② `bash scripts/check-schema-drift.sh`로 검증(CI `schema-drift.yml`이 PR에서도 강제) ③ raw SQL로 인덱스 등을 만들면 schema.prisma에도 `@@index` 선언을 같이 추가. 빈 DB 전체 재생은 동결 베이스라인 픽스처(`pre-vendor-catalog-baseline.sql`)가 처음 12장을 대체하므로 `migrate-database.mjs` 경유로만 가능하다.

## 도메인 작업 시 (요약)
**실배선 레퍼런스 슬라이스**(그대로 따라할 예시): 세입자 하자=`src/app/my/flows/TenantMyPage.tsx`(세입자탭 시트, 클라 fetch → `/api/tenant/*` 프록시), 업체잡=`src/app/vendor/job/**` — Prisma·쿠키인증·데모폴백까지 실제로 돈다.
1. **좁은 목 먼저**: `packages/types/src/<domain>.ts` 계약 확정 + `index.ts` re-export.
2. **모델**: `schema.prisma` 추가 → `db push` + `db:generate` + **`prisma/migrations/` 마이그레이션 파일 작성**(위 ⚠️ 규칙 — 안 쓰면 프로드만 깨진다).
3. **모듈**: core면 `roomlog.controller`/`roomlog.service`(+projector), 독립이면 새 Nest 모듈 → `app.module.ts` 등록. 역할 가드 필수.
4. **화면 배선**: `src/app/<role>/<domain>/**` → `src/lib/<domain>-api.ts` serverFetch. (공개 표면 기능이면 `HomeApp.tsx` 탭 — 대형 파일이니 컴포넌트 분리 검토.)
5. **원칙 게이트**: 클라 disabled 버튼이 아니라 **서버에서 강제**.

### 횡단 원칙 (화면마다 확인 — 이 제품의 정체성)
티켓 상태 ≠ 수리 상태 · AI 책임 확정 금지(가능성만) · 공백 ≠ 책임 추정(D27) · 결제=완료 후 게이트 · 자동 발송/독촉 금지(명시 승인 후, 1:1 독촉 금지) · 존엄/false-agency 금지. 스코프는 **개인 임대인(집 1~5채·1인 운영)** — 기업 SaaS 스케일 아님. 돈 도메인 하드 원칙(미확정 금액 집계 제외·독촉 가드·연체 존엄)의 설계 근거 사례는 `docs/KAN-131-contract.md`.

### 병렬 작업 (worktree)
도메인별 `git worktree` 격리 후 머지. **자기 도메인 폴더만** 수정, 공유는 읽기만. 머지 충돌 예상 지점 = `packages/types/src/index.ts`(re-export) · `apps/api/src/app.module.ts`(imports) · `apps/api/src/roomlog/*`(core) · `src/lib/*-api.ts`(함수 추가) · `HomeApp.tsx`(공개 표면 단일 파일) — 대개 양쪽 다 살리는 append 충돌.
