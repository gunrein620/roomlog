# Manager Announcement Target Prompt Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 공지 작성은 대상이 없는 상태로 시작하고, 유효 대상을 선택하면 안내 박스를 숨기며 대상 결과만 표시한다.

**Architecture:** `AnnouncementComposer`에 신규 작성과 기존 초안을 구분하는 `hasScopeSelection` UI 상태를 추가한다. 기존 `buildAnnouncementTarget` 결과는 유지하되 선택 전에는 렌더링·저장·검증에 빈 대상을 전달하고, 결과와 안내를 상호 배타적으로 렌더한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 인프라 파일은 수정하지 않는다.
- 신규 작성은 대상 radio가 선택되지 않은 상태로 시작한다.
- 기존 저장 초안은 기존 대상 범위와 결과를 유지한다.
- 유효한 `targetRoomIds`가 있을 때만 대상 결과를 표시하고 안내 박스를 숨긴다.
- unit의 마지막 호실을 해제하면 대상 결과를 숨기고 안내를 다시 표시한다.
- `buildAnnouncementTarget`, 저장 payload 형식, 검증 정책과 API는 변경하지 않는다.
- 선택 전 저장·검증에는 빈 `targetRoomIds`와 `targetLabel`을 전달한다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 이번 작업의 관련 테스트와 web 빌드가 통과한 경우에만 커밋하고 푸시한다.

---

### Task 1: 대상 선택 완료 상태와 안내 표시 전환

**Files:**
- Test: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`

**Interfaces:**
- Consumes: `draftId?: string`, `target.targetRoomIds`, 기존 `changeScope`와 `toggleRoom`
- Produces: `hasScopeSelection`, 게이트된 `target`, `hasValidTarget`, 상호 배타적인 `targetBox`/`targetHint` 렌더링

- [x] **Step 1: 신규·기존 초기 상태와 조건부 렌더링 계약을 테스트에 추가한다**

기존의 `targetBox`와 `targetHint`가 동시에 존재한다고 가정하는 단언을 제거하고 다음 단언으로 교체한다.

```js
assert.match(
  managerMessagingComposerSource,
  /const \[hasScopeSelection, setHasScopeSelection\] = useState\(Boolean\(draftId\)\);/,
);
assert.match(
  managerMessagingComposerSource,
  /const calculatedTarget = buildAnnouncementTarget\(/,
);
assert.match(
  managerMessagingComposerSource,
  /const target = hasScopeSelection\s*\? calculatedTarget\s*:\s*\{ targetRoomIds: \[\], targetLabel: "" \};/,
);
assert.match(
  managerMessagingComposerSource,
  /const hasValidTarget = target\.targetRoomIds\.length > 0;/,
);
assert.match(
  managerMessagingComposerSource,
  /checked=\{hasScopeSelection && scope === option\.value\}/,
);
assert.match(managerMessagingComposerSource, /setHasScopeSelection\(true\)/);
assert.match(
  managerMessagingComposerSource,
  /hasScopeSelection && \(scope === "building" \|\| scope === "unit"\)/,
);
assert.match(
  managerMessagingComposerSource,
  /<div className=\{styles\.targetSummary\}>\s*\{hasValidTarget \? \(\s*<div className=\{styles\.targetBox\}>[\s\S]*?\) : \(\s*<div className=\{styles\.targetHint\}>\s*공지 대상을 선택하세요\.\s*<\/div>\s*\)\}\s*<\/div>/,
);
```

기존 대상 계산, `setSelectedRoomIds([])`, 저장·검토 이동 단언은 유지한다.

- [x] **Step 2: 관련 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: `hasScopeSelection`과 `hasValidTarget`이 아직 없어 1 test, 0 pass, 1 fail로 종료한다.

- [x] **Step 3: 선택 시작 상태와 유효 대상 계산을 추가한다**

`AnnouncementComposer` 상태와 파생 값에 다음을 추가한다. 기존 `target` 계산 변수는 `calculatedTarget`으로 변경하고, 실제 소비되는 `target`은 선택 여부로 게이트한다.

```tsx
const [hasScopeSelection, setHasScopeSelection] = useState(Boolean(draftId));

const calculatedTarget = buildAnnouncementTarget(
  managedRooms,
  scope,
  selectedBuilding,
  selectedRoomIds,
);
const target = hasScopeSelection
  ? calculatedTarget
  : { targetRoomIds: [], targetLabel: "" };
const hasValidTarget = target.targetRoomIds.length > 0;
```

`changeScope`는 범위 선택을 기록한다.

```tsx
function changeScope(nextScope: AnnouncementScope) {
  setHasScopeSelection(true);
  setScope(nextScope);
  if (nextScope === "unit") setSelectedRoomIds([]);
}
```

- [x] **Step 4: 초기 radio와 대상 controls를 선택 상태에 연결한다**

범위 radio checked 조건을 다음과 같이 변경한다.

```tsx
checked={hasScopeSelection && scope === option.value}
```

건물 select 노출 조건을 다음과 같이 변경한다.

```tsx
{hasScopeSelection && (scope === "building" || scope === "unit") ? (
```

호실 목록 노출 조건을 다음과 같이 변경한다.

```tsx
{hasScopeSelection && scope === "unit" ? (
```

- [x] **Step 5: 대상 결과와 안내를 상호 배타적으로 렌더한다**

`targetSummary` 내부를 다음 구조로 변경한다.

```tsx
<div className={styles.targetSummary}>
  {hasValidTarget ? (
    <div className={styles.targetBox}>
      <span>{target.targetLabel}</span>
    </div>
  ) : (
    <div className={styles.targetHint}>
      공지 대상을 선택하세요.
    </div>
  )}
</div>
```

- [x] **Step 6: 관련 회귀 테스트를 다시 실행해 GREEN을 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: 1 test, 1 pass, 0 fail.

- [x] **Step 7: web 프로덕션 빌드를 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web build가 exit 0으로 완료된다.

- [x] **Step 8: Docker와 실제 신규·기존 화면을 검증한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
curl -sS -D - -o /dev/null http://localhost:3000/manager/messaging/01
```

브라우저 검증:

- 신규 `/manager/messaging/01`: 대상 radio 미선택, 안내 표시, 대상 결과 미표시
- 신규 화면에서 `전체` 선택 후: 안내 숨김, 전체 대상 결과 표시
- 기존 `/manager/messaging/01?id=draft_urgent_water`: 안내 숨김, 기존 대상 결과 표시
- error overlay와 console error 없음

- [ ] **Step 9: 변경 범위를 검토하고 커밋·푸시한다**

Run:

```bash
git diff --check
git add \
  docs/superpowers/plans/2026-07-16-manager-announcement-target-prompt-visibility.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx
git diff --cached --check
git commit -m "fix: hide announcement target prompt after selection"
git push origin kms-manager-chat
```

Expected: 이번 작업의 계획·테스트·구현 파일만 원격 `kms-manager-chat`에 반영된다.
