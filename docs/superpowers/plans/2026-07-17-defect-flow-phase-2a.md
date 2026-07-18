# 하자 흐름 2차분A Implementation Plan

> **For agentic workers:** 이 작업은 현재 세션에서 테스트 우선으로 실행한다. 사용자 지시에 따라 git 조작 단계는 없다.

**Goal:** 관리자 책임 확정·세입자 이의제기/채팅 핸드오프와 수동 접수 긴급도 병합을 web↔api↔DB에 연결한다.

**Architecture:** 기존 in-memory Store를 도메인 원장으로 유지하며 PrismaStoreProjector가 새 Ticket 메타를 load/create/update 한다. presenter와 웹 매퍼에서 명시적 표시 모델로 변환하고 mutation은 서버 액션을 통해 API로 전달한다.

**Tech Stack:** NestJS, Next.js App Router/Server Actions, TypeScript, Prisma/PostgreSQL, node:test.

## Global Constraints

- git 명령·브랜치·커밋 금지.
- AI 책임 값은 “가능성”, 확정 값은 “관리자 확정”으로 주체를 표시.
- 권한·enum·필수 사유·범위는 서버에서 검증.
- CSS 색상은 `var(--...)` 토큰만 사용.

---

### Task 1: 서비스 회귀 계약

**Files:**
- Modify/Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

- [ ] 책임 확정이 ticket/analysis 힌트와 확정 메타를 동기화하고 OPEN RESPONSIBILITY 피드백을 REVIEWED로 마감하며 메시지를 생성하는 실패 테스트를 추가한다.
- [ ] AI=3·tenant=2→2, AI=1·tenant=3→1 실패 테스트를 추가한다.
- [ ] transpile-only 단일 테스트를 실행해 새 동작 부재로 실패하는지 확인한다.

### Task 2: API·영속성 구현

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260717130000_ticket_responsibility_decision/migration.sql`
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts`

- [ ] 입력 타입과 Ticket nullable 메타를 추가한다.
- [ ] 책임 확정 서비스 메서드와 presenter 메타를 구현한다.
- [ ] LANDLORD 컨트롤러 엔드포인트와 realtime ticket broadcast를 연결한다.
- [ ] Prisma 컬럼, migration, load/create/update 매핑을 추가한다.
- [ ] urgency 서버 검증·fingerprint·분석 병합을 구현하고 API 테스트를 GREEN으로 만든다.

### Task 3: 공유 타입·웹 배선

**Files:**
- Modify: `packages/types/src/ticket.ts`
- Confirm: `packages/types/src/index.ts`
- Modify: `apps/web/src/lib/defect-mapping.ts`
- Modify: `apps/web/src/lib/manager-mapping.ts`
- Modify: `apps/web/src/lib/defect-api.ts`
- Modify: `apps/web/src/lib/ticket-manager-api.ts`
- Modify/Create: `apps/web/src/app/tenant/defect/11/*`
- Modify/Create: `apps/web/src/app/manager/ticket/dash/01/*`
- Modify: `apps/web/src/app/manager/ticket/_components/ticket-manager-ui.tsx`
- Modify: `apps/web/src/app/tenant/defect/01/page.tsx`
- Modify/Test: `apps/web/src/lib/ticket-manager-responsibility-card.spec.ts`

- [ ] 웹 테스트를 먼저 새 문구·폼·API 경로 계약으로 갱신해 실패를 확인한다.
- [ ] mutation API 함수와 서버 액션을 추가한다.
- [ ] 세입자 확정 표시·이의제기·대화 핸드오프를 구현한다.
- [ ] 관리자 AI 가능성/OPEN 이의제기/확정 폼·상태를 구현한다.
- [ ] 수동 접수 긴급도 4단계와 생성 입력/draft 전달 계약을 추가한다.
- [ ] 웹 단위 테스트를 GREEN으로 만든다.

### Task 4: 생성·통합 검증

- [ ] `node_modules/.bin/prisma generate`를 실행한다.
- [ ] 지정 DATABASE_URL로 migration 상태/적용을 검증한다.
- [ ] `pnpm --filter @roomlog/types build`, API/웹 대상 테스트와 빌드를 실행한다.
- [ ] `bash scripts/verify.sh`를 실행하고 변경 파일을 자체 검토한다.
