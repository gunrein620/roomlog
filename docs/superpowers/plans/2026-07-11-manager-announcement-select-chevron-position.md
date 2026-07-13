# Manager Announcement Select Chevron Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manager/messaging/01`의 건물 선택 화살표를 기존 위치보다 10px 왼쪽으로 이동한다.

**Architecture:** 네이티브 `<select>`와 접근성 계약은 유지하고 브라우저 기본 화살표만 숨긴다. `.selectWrap::after` 장식 요소로 화살표를 그려 위치를 `calc(var(--space-lg) + 10px)`로 제어한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner

## Global Constraints

- 작업 범위는 `/manager/messaging/01`과 해당 소스 계약 테스트로 제한한다.
- 아래 대상 결과 박스는 화살표가 없는 현재 상태를 유지한다.
- 실제 `<select aria-label="공지 대상 건물">`의 선택 및 키보드 동작을 유지한다.
- 대상 계산, 자동번역, 검수, 저장, 검토 이동 및 인프라 파일은 변경하지 않는다.
- 색상은 `packages/ui/src/tokens.css`의 CSS 변수만 사용한다.

---

### Task 1: Position the building select chevron

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`

**Interfaces:**
- Consumes: 기존 `selectedBuilding` 상태 및 `setSelectedBuilding(...)` 변경 핸들러
- Produces: 네이티브 선택 동작을 유지하면서 오른쪽에서 26px 떨어진 장식용 화살표

- [ ] **Step 1: Write the failing source contract test**

CSS 모듈 소스를 `managerMessagingComposeFeatureSource`에 포함하고 아래 계약을 추가한다.

```js
assert.match(managerMessagingComposeFeatureSource, /className=\{styles\.selectWrap\}/);
assert.match(managerMessagingComposeFeatureSource, /appearance: none/);
assert.match(
  managerMessagingComposeFeatureSource,
  /right: calc\(var\(--space-lg\) \+ 10px\)/,
);
assert.match(managerMessagingComposeFeatureSource, /pointer-events: none/);
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
cd apps/web
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
```

Expected: FAIL because `.selectWrap`, `appearance: none`, and the 10px position contract do not exist.

- [ ] **Step 3: Add the select wrapper**

Wrap the existing select without changing its props or options.

```tsx
<div className={styles.selectWrap}>
  <select
    className={styles.select}
    aria-label="공지 대상 건물"
    value={selectedBuilding}
    onChange={(event) => setSelectedBuilding(event.target.value)}
  >
    {buildings.map((building) => (
      <option key={building} value={building}>{building}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 4: Draw and position the custom chevron**

Add the wrapper and pseudo-element rules and update the select appearance.

```css
.selectWrap {
  position: relative;
}

.selectWrap::after {
  content: "";
  position: absolute;
  top: 50%;
  right: calc(var(--space-lg) + 10px);
  width: 8px;
  height: 8px;
  border-right: 1.5px solid var(--on-surface);
  border-bottom: 1.5px solid var(--on-surface);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}

.select {
  appearance: none;
  padding: 0 calc(var(--space-xxl) + 10px) 0 var(--space-lg);
}
```

- [ ] **Step 5: Run targeted and unit tests and verify GREEN**

Run:

```bash
cd apps/web
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
cd ../..
pnpm --filter web test:unit
```

Expected: 공지 작성 소스 계약 1개 PASS, 웹 유닛 전체 PASS.

- [ ] **Step 6: Build and browser-verify**

Run:

```bash
pnpm --filter web build
```

Docker web 이미지를 기존 Dockerfile로 재빌드하고 `/manager/messaging/01`에서 확인한다.

Expected:

- 화살표의 computed `right` 값이 `26px`이다.
- 화살표가 첨부 이미지보다 약 10px 왼쪽에 보인다.
- 건물 선택 후 대상 라벨이 정상 갱신된다.
- 아래 대상 결과 박스에는 화살표가 없다.
- 번역·임시 저장 버튼이 활성 상태이고 콘솔 오류가 없다.

- [ ] **Step 7: Commit and push the passing slice**

```bash
git add apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git commit -m "fix(messaging): inset building select chevron"
git push origin kms-commu
```
