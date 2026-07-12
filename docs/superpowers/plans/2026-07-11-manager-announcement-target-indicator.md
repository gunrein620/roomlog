# Manager Announcement Target Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manager/messaging/01`의 아래 대상 결과 박스에서 오해를 만드는 `⌄` 표시를 제거하고 기존 공지 작성 기능이 유지되는지 검증한다.

**Architecture:** 대상 계산과 API 흐름은 변경하지 않는다. `AnnouncementComposer`의 비대화형 대상 결과 마크업에서 문자형 화살표만 제거하고, 소스 계약 테스트로 결과 박스가 비대화형이며 화살표를 포함하지 않는다는 요구를 고정한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner

## Global Constraints

- 작업 범위는 `/manager/messaging/01`과 해당 소스 계약 테스트로 제한한다.
- 위 건물 `<select>`의 드롭다운 화살표는 유지한다.
- 아래 대상 결과 박스에는 문자형 `V`, `⌄`, 장식용 화살표를 표시하지 않는다.
- 대상 계산, 자동번역, 검수, 저장, 검토 이동 및 인프라 파일은 변경하지 않는다.
- 스타일 변경이 필요하면 `packages/ui/src/tokens.css`의 토큰만 사용한다.

---

### Task 1: Remove the target-result indicator

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`

**Interfaces:**
- Consumes: `target.targetLabel` from `buildAnnouncementTarget(...)`
- Produces: 비대화형 `.targetBox`에 타깃 라벨만 렌더하는 UI

- [ ] **Step 1: Write the failing source contract test**

`manager announcement compose edits targets and translates each language before review` 테스트에 아래 계약을 추가한다.

```js
assert.doesNotMatch(managerMessagingComposeFeatureSource, />⌄</);
assert.match(
  managerMessagingComposeFeatureSource,
  /<div className=\{styles\.targetBox\}>\s*<span>\{target\.targetLabel\}<\/span>\s*<\/div>/,
);
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
cd apps/web
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
```

Expected: FAIL because `AnnouncementComposer.tsx` still contains `<span aria-hidden="true">⌄</span>`.

- [ ] **Step 3: Remove the indicator with minimal production changes**

Change the target result markup to:

```tsx
<div className={styles.targetBox}>
  <span>{target.targetLabel}</span>
</div>
```

Simplify `.targetBox` so it does not reserve layout for a missing trailing control:

```css
.targetBox {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid var(--border);
  font-weight: 800;
}
```

- [ ] **Step 4: Run targeted and unit tests and verify GREEN**

Run:

```bash
cd apps/web
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
cd ../..
pnpm --filter web test:unit
```

Expected: 공지 작성 소스 계약 1개 PASS, 웹 유닛 전체 PASS.

- [ ] **Step 5: Build and browser-verify the route**

Run:

```bash
pnpm --filter web build
```

Docker의 기존 web 이미지를 동일 Dockerfile로 재빌드하고 `/manager/messaging/01`에서 확인한다.

Expected:

- 위 건물 선택 박스에는 드롭다운 화살표가 보인다.
- 아래 대상 결과 박스에는 `V/⌄`가 보이지 않는다.
- 전체·건물·호실 전환 시 대상 라벨이 갱신된다.
- 언어별 번역 버튼과 임시 저장 버튼이 활성 상태다.
- 브라우저 콘솔 오류와 Next 오류 오버레이가 없다.

- [ ] **Step 6: Commit and push the passing slice**

```bash
git add apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git commit -m "fix(messaging): remove target result chevron"
git push origin kms-commu
```
