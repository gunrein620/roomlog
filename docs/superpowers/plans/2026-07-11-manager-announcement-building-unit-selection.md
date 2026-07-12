# Manager Announcement Building Unit Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manager/messaging/01`의 호실 발송 범위에서 건물을 먼저 고른 뒤 해당 건물의 호실만 복수 선택할 수 있게 한다.

**Architecture:** `announcement-compose-state.ts`에 선택 건물별 호실 필터를 순수 함수로 추가한다. `AnnouncementComposer`는 이 결과만 렌더링하며 건물 변경 핸들러에서 기존 호실 선택을 초기화해 숨은 발송 대상이 남지 않게 한다.

**Tech Stack:** Next.js 16, React, TypeScript, Node test runner

## Global Constraints

- 수정 범위는 `/manager/messaging/01`과 관련 web 테스트로 제한한다.
- `/manager/messaging/00`, `/02`, API 계약과 인프라 파일은 수정하지 않는다.
- `.local-agents/local-infra-guard.prompt.md`를 준수한다.
- 테스트와 Docker 브라우저 검증 통과 후 `kms-commu`에 커밋하고 푸시한다.

---

### Task 1: 건물별 호실 목록과 선택 초기화

**Files:**
- Modify: `apps/web/src/lib/announcement-compose-state.ts`
- Modify: `apps/web/src/lib/announcement-compose-state.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `AnnouncementManagedRoom[]`, 선택 건물명
- Produces: `roomsForBuilding(rooms, buildingName): AnnouncementManagedRoom[]`

- [x] **Step 1: 실패하는 필터 테스트 작성**

```ts
assert.deepEqual(
  roomsForBuilding(rooms, "A동").map((room) => room.id),
  ["room-a-101", "room-a-102"],
);
assert.deepEqual(roomsForBuilding(rooms, "없는 건물"), []);
assert.deepEqual(roomsForBuilding(rooms, ""), []);
```

- [x] **Step 2: 테스트가 누락된 export로 실패하는지 확인**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/announcement-compose-state.spec.ts`

Expected: `roomsForBuilding` export가 없어 FAIL

- [x] **Step 3: 최소 필터 함수 구현**

```ts
export function roomsForBuilding(
  rooms: AnnouncementManagedRoom[],
  buildingName: string,
): AnnouncementManagedRoom[] {
  if (!buildingName) return [];
  return rooms.filter((room) => room.buildingName === buildingName);
}
```

- [x] **Step 4: 호실 범위 UI를 건물 선택 후 필터 목록으로 변경**

```tsx
const selectableRooms = roomsForBuilding(managedRooms, selectedBuilding);

function changeSelectedBuilding(buildingName: string) {
  setSelectedBuilding(buildingName);
  setSelectedRoomIds([]);
}
```

`scope === "unit"`일 때 `공지 대상 호실 건물` select를 먼저 렌더링하고 `selectableRooms`만 체크박스로 렌더링한다. 목록이 비면 `선택 가능한 호실이 없습니다.`를 표시한다. `property-shell.spec.mjs`에 필터 함수 사용과 호실 건물 select 계약을 추가한다.

- [x] **Step 5: 단위·계약·빌드·Docker 브라우저 검증**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/announcement-compose-state.spec.ts
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
pnpm test:unit
pnpm build
```

Expected: 모두 PASS. Docker 브라우저에서 호실 선택 시 건물 select가 보이고 선택 건물의 호실만 나타나며 건물 변경 후 체크 선택이 초기화된다.

- [x] **Step 6: 커밋 및 푸시**

```bash
git add docs/superpowers/plans/2026-07-11-manager-announcement-building-unit-selection.md \
  apps/web/src/lib/announcement-compose-state.ts \
  apps/web/src/lib/announcement-compose-state.spec.ts \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/property-shell.spec.mjs
git commit -m "feat(messaging): select announcement units by building"
git push origin kms-commu
```
