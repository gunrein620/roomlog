# 도메인 슬라이스 추가 레시피

룸로그는 **도메인 단위 수직 슬라이스**로 자란다. 하나의 도메인 = 백엔드(Prisma 모델 + API) + 프론트 표면(역할×화면) + 공유 타입 + 서버측 원칙 강제. **하자(defect/ticket)와 수리업체(vendor) 슬라이스가 실배선된 레퍼런스**다 — Prisma·쿠키인증·데모폴백까지 실제로 돌아간다.

> 주의: 이 레포는 프로토타입 셸(인메모리·`app/` 경로)에서 **Prisma + `src/app/` + 쿠키 세션 인증**으로 진화했다. 옛 문서·프로토타입 코드를 참고할 땐 이 차이를 감안하라.

## 레퍼런스 (이걸 그대로 따라해)
- **프론트**: `apps/web/src/app/<role>/<domain>/**` — `@roomlog/ui` 컴포넌트 + 토큰(`var(--...)`)만, raw hex 금지. 데이터 화면은 **async 서버 컴포넌트**가 `src/lib/<domain>-api.ts`를 await. 예: `apps/web/src/app/tenant/defect/**`, `apps/web/src/app/vendor/job/**`.
- **데이터 클라이언트(BFF)**: `apps/web/src/lib/<domain>-api.ts` — `serverFetch`(`src/lib/server-api.ts`)가 httpOnly 쿠키 토큰을 `Authorization: Bearer`로 Nest에 forward. **서버 전용**(`next/headers` 의존). 데이터 없음/인증 전/오류 시 데모로 폴백하되 **경고 로그**를 남긴다(관측성). 예: `src/lib/api.ts`(defect), `src/lib/vendor-api.ts`, `src/lib/home-api.ts`.
- **백엔드**: core 도메인은 단일 `apps/api/src/roomlog/`에 상주 — 라우트는 `roomlog.controller.ts`, 로직은 `roomlog.service.ts`, 영속화는 `prisma-store-projector.ts`(Prisma ↔ 스토어). 주변/독립 도메인은 **별도 NestJS 모듈**(예: `apps/api/src/market/`, `furniture-catalog/`)로 만들고 `app.module.ts` imports에 한 줄 등록.
- **계약(타입)**: `packages/types/src/<domain>.ts` — 도메인 모델. `src/index.ts`에서 re-export. `@roomlog/types`는 **소스 직접 소비**(`main: ./src/index.ts`)라 **dist 빌드 불필요** — 편집·re-export만 하면 api/web이 즉시 본다.
- **데모 데이터**: `src/lib/demo-<domain>.ts`(프론트 폴백 시드). api 인메모리/시드와 프론트 데모는 **같은 값**을 유지.
- **인증**: 쿠키 세션 BFF. `/api/auth/login`이 httpOnly `roomlog_token`을 심고, 역할 게이트가 안 맞으면 `/<role>/login`으로 리다이렉트(예: vendor 토큰 없이 `/vendor/*` → 로그인). 데모: `vendor@roomlog.test` / `password123!`.

## 새 도메인 추가 절차 (4단계)
1. **모델**: `prisma/schema.prisma`에 테이블 추가 → `pnpm db:migrate`(= `prisma migrate dev`) + `pnpm db:generate`. Postgres는 docker `roomlog-postgres`가 떠 있어야 함(`pnpm docker:up` 또는 compose). 하드코딩/데모 대신 진짜 DB로.
2. **모듈**: 그 테이블을 읽고 쓰는 API + 권한. core면 `roomlog.controller.ts`/`roomlog.service.ts`에 라우트·로직 추가(+`prisma-store-projector.ts` 반영), 독립 도메인이면 새 모듈 만들어 `app.module.ts` imports에 등록. 역할 가드 필수.
3. **화면 배선**: `apps/web/src/app/<role>/<domain>/**` 화면(지금은 데모 껍데기)을 `src/lib/<domain>-api.ts`의 `serverFetch` 함수로 실 API에 연결.
4. **원칙 게이트**: 그 도메인 원칙을 **서버에서 강제**(클라 disabled 버튼만으로 두지 말 것) + 검토. `KNOWN-GAPS.md`의 "C버킷: 서버측 강제" 참고. **돈이 얽힌 도메인(비용·업체 등)은 `KNOWN-GAPS.md`의 납부 하드 원칙(집계 제외·독촉 가드·연체 존엄 등)을 그대로 준수.**

계약(타입) 작성은 1번과 함께: `packages/types/src/<domain>.ts` + `index.ts` re-export.

## 병렬 규칙 (worktree)
- 도메인마다 `git worktree add ../roomlog-<domain> -b domain/<domain>`, 각 worktree에서 `pnpm install`.
- **자기 도메인 폴더만** 수정. 공유(`@roomlog/ui`·`nav`·`layout`·타 도메인·`roomlog.service` core 로직)는 읽기만.
- 새 공유 UI 컴포넌트가 필요하면 **만들기 전에 오너(메인)에게 확인** — 두 세션이 같은 걸 발명하면 충돌.
- 머지 시 충돌 예상 지점 = `packages/types/src/index.ts`(re-export 줄), `apps/api/src/app.module.ts`(imports 줄, 독립 모듈), `apps/api/src/roomlog/*`(core 공유), `src/lib/*-api.ts`(함수 추가). 대개 **양쪽 다 살리면 되는** append 충돌.

## 함정
- **서버/클라 경계**: `serverFetch`·`next/headers`에 의존하는 서버 전용 모듈을 `"use client"` 컴포넌트가 import하면 빌드가 깨진다(클라 번들이 `next/headers`를 끌어옴). 클라이언트에서 API가 필요하면 **클라 안전 파일로 분리**하라 — 예: `src/lib/market-api.ts`(fetch만, 서버 전용 import 없음)를 `src/lib/api.ts`(defect, 서버 전용)와 별도로 둠.
- **타입은 소스 소비**: dist 빌드 불필요(옛 footgun 소멸). 단 `index.ts` re-export를 빠뜨리면 안 보임.
- **Prisma 마이그레이션**엔 `roomlog-postgres`가 떠 있어야 함. `prisma generate`는 스키마 변경 후 필수.
- **데이터 정직성**: 실데이터 없을 때만 데모 폴백(경고 로그). 빈 상태를 데모로 채워 "데이터 없음"·API 오류를 은폐하지 말 것(적대검토 반복 지적).

## 원칙 (횡단 — 화면마다 확인)
티켓 상태 ≠ 수리 상태 · AI 책임 확정 금지(가능성만) · 공백 ≠ 책임 추정(D27) · 결제=완료 후 · 자동 발송/독촉 금지(명시 승인 후) · 존엄/false agency 금지. 돈 도메인 원칙은 `KNOWN-GAPS.md` 납부 섹션, 도메인별 D항목은 스펙 카드 상단 참고.

## 검증
- `node --test apps/web/property-shell.spec.mjs` (셸 구조 스펙, 현재 57 pass 기준) + `pnpm test:web`·`pnpm test:api`.
- 빌드: `pnpm build:web`·`pnpm build:api`.
- 라이브: dev 서버(`pnpm dev:web`, 필요 시 `pnpm dev:api`) 띄우고 로그인 쿠키로 화면 실동작 확인.
- (`scripts/verify.sh`는 프로토타입 셸 기준이라 그대로 안 돎 — 필터명 `@roomlog/web`/`@roomlog/api`가 루트 패키지명 `web`/`api`와 불일치, api 스모크 엔드포인트도 옛것. 위 명령으로 대체하거나 갱신 후 사용.)
