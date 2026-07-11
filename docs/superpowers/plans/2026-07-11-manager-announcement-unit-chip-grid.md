# Manager Announcement Unit Chip Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manager/messaging/01`의 기본 호실 체크박스를 최대 5열의 선택형 호실 칩 그리드로 교체한다.

**Architecture:** checkbox input과 기존 `toggleRoom` 상태 흐름은 유지하고 input만 시각적으로 숨긴다. 인접한 `.unitChip`이 checked/focus 상태를 CSS로 반영하며 카드 전체 label이 클릭 영역이 된다.

**Tech Stack:** Next.js 16, React, CSS Modules, Node test runner

## Global Constraints

- 수정 범위는 `/manager/messaging/01` 컴포저, CSS와 관련 web 계약 테스트로 제한한다.
- 건물 필터, 복수 선택, 대상 계산, API와 인프라는 변경하지 않는다.
- 모든 색상과 간격은 기존 CSS 토큰만 사용한다.
- 검증 통과 후 `kms-commu`에 커밋하고 푸시한다.

---

### Task 1: 호실 선택 칩 그리드

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`

**Interfaces:**
- Consumes: `selectableRooms`, `selectedRoomIds`, `toggleRoom(room.id)`
- Produces: 숨겨진 checkbox와 `.unitChip`으로 구성된 복수 선택 그리드

- [x] **Step 1: 실패하는 소스·CSS 계약 테스트 작성**

```js
assert.match(managerMessagingComposerSource, /className=\{styles\.unitInput\}/);
assert.match(managerMessagingComposerSource, /className=\{styles\.unitChip\}/);
assert.match(managerMessagingComposerSource, /room\.roomNo \?\? roomDisplayLabel\(room\)/);
assert.match(managerMessagingComposerSource, /styles\.unitCheck/);
assert.match(managerMessagingComposeFeatureSource, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(managerMessagingComposeFeatureSource, /\.unitInput:checked \+ \.unitChip/);
```

- [x] **Step 2: 기존 기본 checkbox 구조 때문에 실패하는지 확인**

Run: `node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs`

Expected: `.unitInput`, `.unitChip`, 5열 규칙이 없어 FAIL

- [x] **Step 3: 칩 마크업과 스타일 구현**

```tsx
<label key={room.id} className={styles.unitChoice}>
  <input
    className={styles.unitInput}
    type="checkbox"
    checked={selectedRoomIds.includes(room.id)}
    onChange={() => toggleRoom(room.id)}
  />
  <span className={styles.unitChip}>
    <span>{room.roomNo ?? roomDisplayLabel(room)}</span>
    <span className={styles.unitCheck} aria-hidden="true">✓</span>
  </span>
</label>
```

`.unitList`는 `repeat(5, minmax(0, 1fr))`를 사용하고 좁은 화면에서는 media query로 열 수를 줄인다. `.unitInput`을 접근성 유지 방식으로 숨기고 checked/focus-visible 상태를 `.unitChip`에 표시한다.

- [x] **Step 4: 계약·단위·빌드·Docker 브라우저 검증**

Run:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
pnpm test:unit
pnpm build
```

Expected: 모두 PASS. Docker 브라우저에서 기본 checkbox가 보이지 않고 카드 선택 시 파란색·흰색·체크 표시가 나타나며 두 호실 복수 선택이 가능하다.

- [x] **Step 5: 커밋 및 푸시**

```bash
git add docs/superpowers/plans/2026-07-11-manager-announcement-unit-chip-grid.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git commit -m "style(messaging): render unit selection as chips"
git push origin kms-commu
```
