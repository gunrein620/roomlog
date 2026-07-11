# Manager Messaging Reply Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 메시징 티켓의 답장 필요 배지를 `답장`과 `필요`가 균형 잡힌 두 줄로 고정한다.

**Architecture:** `/manager/messaging/00`의 답장 필요 배지에만 전용 span 구조를 적용한다. 공용 Badge는 유지하고, 토큰 기반 inline style과 접근성 라벨로 시각 줄바꿈과 읽기 문구를 분리한다.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner

## Global Constraints

- 현재 브랜치는 `kms-commu`다.
- 공용 Badge와 다른 화면은 수정하지 않는다.
- raw hex와 인프라 파일을 추가하지 않는다.
- 기존 미추적 문서는 stage하거나 수정하지 않는다.
- 테스트·빌드 통과 후 이번 기능만 커밋·푸시하고 로컬 web을 재빌드해 연다.

---

### Task 1: 답장 필요 배지 두 줄 고정

**Files:**
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/00/page.tsx`
- Create: `docs/superpowers/plans/2026-07-11-manager-messaging-reply-badge.md`

**Interfaces:**
- Consumes: 기존 `Badge emphasis`
- Produces: `aria-label="답장 필요"`를 가진 두 줄 전용 span

- [x] **Step 1: 실패 계약 테스트 작성**

목록 페이지 소스 검증에 다음 계약을 추가한다.

```ts
assert.match(listPage, /aria-label="답장 필요"/);
assert.match(listPage, /<span>답장<\/span>/);
assert.match(listPage, /<span>필요<\/span>/);
assert.match(listPage, /whiteSpace: "nowrap"/);
```

- [x] **Step 2: 집중 테스트 RED 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: 두 줄 전용 구조가 없어 source assertion이 실패한다.

- [x] **Step 3: 최소 JSX 구현**

기존 `{needsReply ? <Badge emphasis>답장 필요</Badge> : null}`을 다음 구조로 바꾼다.

```tsx
{needsReply ? (
  <Badge emphasis>
    <span
      aria-label="답장 필요"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1.25,
        whiteSpace: "nowrap",
      }}
    >
      <span>답장</span>
      <span>필요</span>
    </span>
  </Badge>
) : null}
```

- [x] **Step 4: 집중 테스트 GREEN 확인**

Run the Step 2 command.

Expected: 위치 표기와 답장 배지 계약 테스트가 모두 통과한다.

- [x] **Step 5: 전체 검증**

```bash
pnpm --filter web test:unit
bash scripts/verify.sh
git diff --check
```

Expected: web 단위 테스트와 types·ui·web·api 빌드 및 API 스모크가 모두 통과한다.

- [ ] **Step 6: 커밋·푸시 및 로컬 반영**

```bash
git add \
  apps/web/src/lib/messaging-thread-location.spec.ts \
  apps/web/src/app/manager/messaging/00/page.tsx \
  docs/superpowers/plans/2026-07-11-manager-messaging-reply-badge.md
git commit -m "fix(messaging): balance reply badge lines"
git push origin kms-commu
docker compose up -d --build web
open http://localhost:3000/manager/messaging/00
```

Expected: 원격 브랜치와 로컬 서버가 새 배지 구조를 사용한다.
