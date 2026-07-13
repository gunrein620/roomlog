# Manager Messaging Thread Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 메시징 목록과 상세 티켓에 실제 건물명과 호실을 함께 표시한다.

**Architecture:** 공유 `Thread`와 API `MessagingThread` 계약에 선택적 `buildingName`을 추가하고, API 응답 투영 시 연결된 방에서 실제 건물명과 호실을 계산한다. web은 순수 위치 포맷터를 통해 목록·상세·접근성 문구에 동일한 라벨을 사용하며, 건물명이 없는 기존 응답은 호실만 표시한다.

**Tech Stack:** TypeScript, NestJS, Next.js 16 App Router, Node test runner, pnpm monorepo

## Global Constraints

- 현재 브랜치는 `kms-commu`다.
- 인프라 파일은 수정하지 않는다.
- Docker Desktop을 임의로 시작하거나 종료하지 않는다.
- 기존 라우팅, 정렬, 답장 필요 계산, 삭제 기능, 공지 탭은 변경하지 않는다.
- 기존 미추적 문서는 stage하거나 수정하지 않는다.
- RED → GREEN → 전체 검증 후 이번 기능 파일만 커밋·푸시한다.

---

### Task 1: 메시징 스레드 실제 위치 계약과 화면 표기

**Files:**
- Modify: `packages/types/src/messaging.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Create: `apps/web/src/lib/messaging-thread-location.ts`
- Create: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/lib/messaging-manager-api.ts`
- Modify: `apps/web/src/app/manager/messaging/00/page.tsx`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`
- Create: `docs/superpowers/plans/2026-07-11-manager-messaging-thread-location.md`

**Interfaces:**
- Consumes: API `Room.buildingName`, `Room.roomNo`, 기존 `Thread.unitId`
- Produces: `Thread.buildingName?: string`, `formatThreadLocation(thread: Pick<Thread, "buildingName" | "unitId">): string`

- [x] **Step 1: API 응답 위치 계약의 실패 테스트 작성**

`apps/api/src/roomlog/roomlog.service.spec.ts`의 메시징 범위 테스트에서 생성·목록 응답이 실제 방 위치를 제공하는지 검증한다.

```ts
assert.equal(ownThread.buildingName, "정글빌라");
assert.equal(ownThread.unitId, "301");

const listedOwnThread = managerThreads.find((thread) => thread.id === ownThread.id);
assert.equal(listedOwnThread?.buildingName, "정글빌라");
assert.equal(listedOwnThread?.unitId, "301");
```

- [x] **Step 2: API 집중 테스트를 실행해 RED 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter api exec node --test --test-name-pattern="scopes messaging threads" -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: `buildingName`이 응답 계약에 없어 컴파일 또는 assertion이 실패한다.

- [x] **Step 3: web 위치 포맷터 실패 테스트 작성**

`apps/web/src/lib/messaging-thread-location.spec.ts`를 추가한다.

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatThreadLocation } from "./messaging-thread-location";

test("formats a messaging thread with its building and unit", () => {
  assert.equal(
    formatThreadLocation({ buildingName: " 테스트 건물1 ", unitId: "101" }),
    "테스트 건물1 · 101호",
  );
});

test("falls back to the unit when a legacy thread has no building", () => {
  assert.equal(formatThreadLocation({ unitId: "102" }), "102호");
});

test("does not duplicate the unit suffix", () => {
  assert.equal(
    formatThreadLocation({ buildingName: "테스트 건물2", unitId: "201호" }),
    "테스트 건물2 · 201호",
  );
});
```

- [x] **Step 4: web 집중 테스트를 실행해 RED 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: `messaging-thread-location` 모듈이 없어 실패한다.

- [x] **Step 5: 공유·API 계약과 실제 방 투영 최소 구현**

공유 `Thread`와 API `MessagingThread`에 선택 필드를 추가한다.

```ts
buildingName?: string;
```

`presentThread`에서 저장된 스레드 값을 그대로 노출하지 않고 연결 방의 현재 위치를 투영한다.

```ts
private presentThread(thread: MessagingThread, includeMessages = false): MessagingThread {
  const room = this.findRoom(thread.roomId);
  return {
    ...thread,
    buildingName: room.buildingName,
    unitId: this.displayUnitId(room),
    messages: includeMessages ? /* 기존 메시지 투영 */ : undefined,
  };
}
```

- [x] **Step 6: 공용 위치 포맷터와 데모 데이터를 최소 구현**

`apps/web/src/lib/messaging-thread-location.ts`를 추가한다.

```ts
import type { Thread } from "@roomlog/types";

export function formatThreadLocation(
  thread: Pick<Thread, "buildingName" | "unitId">,
): string {
  const buildingName = thread.buildingName?.trim();
  const unit = thread.unitId.trim().replace(/호$/, "");
  const unitLabel = `${unit}호`;
  return buildingName ? `${buildingName} · ${unitLabel}` : unitLabel;
}
```

`DEMO_MANAGER_THREADS`의 각 항목에는 해당 테스트 건물명을 추가한다.

```ts
buildingName: "테스트 건물1",
```

- [x] **Step 7: 목록과 상세에 공용 위치 라벨 적용**

두 페이지에서 `formatThreadLocation`을 import한다. 목록 `ThreadCard`와 상세 페이지에서 한 번 계산해 다음 위치에 사용한다.

```tsx
const locationLabel = formatThreadLocation(thread);
```

- 목록 위치 배지: `<Badge emphasis={needsReply}>{locationLabel}</Badge>`
- 목록 삭제 문구: ``aria-label={`${locationLabel} ${thread.contextLabel ?? "일반 문의"} 대화 삭제`}``
- 상세 제목: ``title={`${locationLabel} 채팅 스레드`}``
- 상세 위치 배지: `<Badge emphasis>{locationLabel}</Badge>`
- 상세 삭제 문구: ``aria-label={`${locationLabel} ${thread.contextLabel ?? "일반 문의"} 대화 삭제`}``

- [x] **Step 8: 집중 테스트 GREEN 확인**

Run:

```bash
pnpm --filter @roomlog/types typecheck
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter api exec node --test --test-name-pattern="scopes messaging threads" -r ts-node/register src/roomlog/roomlog.service.spec.ts
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: API 위치 계약과 web 포맷터 테스트가 모두 통과한다.

- [x] **Step 9: 전체 회귀 검증**

Run:

```bash
pnpm test:api
pnpm test:web
bash scripts/verify.sh
git diff --check
```

Expected: API·web 테스트와 types·ui·web·api 빌드 및 API 스모크가 모두 통과한다.

- [x] **Step 10: 실행 중인 로컬 서버 확인**

Docker Desktop과 컨테이너를 재시작하지 않고 상태만 확인한다.

```bash
docker compose ps
curl -fsS http://localhost:4000/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/manager/messaging/00
```

Expected: 실행 중이라면 DB/API가 정상이고 web은 인증 정책에 따라 200 또는 3xx를 반환한다. Docker 데몬이 꺼져 있으면 재시작하지 않고 사용자에게 보고한다.

Execution note: Docker 데몬이 꺼져 있어 이미지 재빌드와 로컬 화면 확인은 수행하지 않았으며, Docker Desktop은 사용자 요청에 따라 자동 재시작하지 않았다.

- [ ] **Step 11: 이번 기능만 커밋하고 푸시**

```bash
git add \
  packages/types/src/messaging.ts \
  apps/api/src/roomlog/roomlog.types.ts \
  apps/api/src/roomlog/services/roomlog-messaging.domain.ts \
  apps/api/src/roomlog/roomlog.service.spec.ts \
  apps/web/src/lib/messaging-thread-location.ts \
  apps/web/src/lib/messaging-thread-location.spec.ts \
  apps/web/src/lib/messaging-manager-api.ts \
  apps/web/src/app/manager/messaging/00/page.tsx \
  apps/web/src/app/manager/messaging/04/page.tsx \
  docs/superpowers/plans/2026-07-11-manager-messaging-thread-location.md
git commit -m "feat(messaging): show building and unit on threads"
git push origin kms-commu
```

Expected: `origin/kms-commu`가 새 기능 커밋을 가리키고 기존 미추적 문서는 그대로 남는다.
