# Manager Announcement Scope Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manager/messaging/01`의 `전체·건물·호실` 범위 선택을 카테고리와 동일한 pill 버튼 UI로 변경한다.

**Architecture:** 기존 radio input, `name="scope"`, `changeScope` 상태 흐름은 유지한다. 보이는 label을 기존 `categoryPill` 클래스로 교체하고 원형 radio mark 렌더링 및 미사용 CSS만 제거한다.

**Tech Stack:** Next.js 16, React, CSS Modules, Node test runner

## Global Constraints

- 수정 범위는 `/manager/messaging/01` 컴포저 스타일과 관련 web 계약 테스트로 제한한다.
- 기존 건물·호실 선택, 대상 계산, API와 인프라 파일은 변경하지 않는다.
- 스타일 값은 기존 토큰과 `categoryPill` 규칙을 재사용한다.
- 검증 통과 후 `kms-commu`에 커밋하고 푸시한다.

---

### Task 1: 대상 범위 선택을 pill UI로 변경

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`

**Interfaces:**
- Consumes: 기존 `SCOPE_OPTIONS`, `scope`, `changeScope`
- Produces: radio semantics를 유지하는 `categoryPill` 기반 범위 선택 UI

- [x] **Step 1: 실패하는 소스 계약 테스트 작성**

```js
assert.match(
  managerMessagingComposerSource,
  /name="scope"[\s\S]*className=\{styles\.categoryPill\}/,
);
assert.doesNotMatch(managerMessagingComposerSource, /styles\.radioMark/);
```

- [x] **Step 2: 기존 scope label 때문에 실패하는지 확인**

Run: `node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs`

Expected: scope가 `scopeLabel`과 `radioMark`를 사용해 FAIL

- [x] **Step 3: 범위 label을 기존 pill로 교체**

```tsx
<span className={styles.categoryPill}>{option.label}</span>
```

`choiceInput`과 `changeScope(option.value)`는 그대로 유지한다. CSS의 focus selector에서 `scopeLabel`을 제거하고 사용하지 않는 `.scopeLabel`, `.radioMark`, checked radio mark 규칙을 삭제한다.

- [x] **Step 4: 단위·계약·빌드·Docker 브라우저 검증**

Run:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
pnpm test:unit
pnpm build
```

Expected: 모두 PASS. Docker 브라우저에서 전체·건물·호실이 pill로 보이고 선택된 pill 하나만 활성화되며 기존 대상 컨트롤이 전환된다.

- [x] **Step 5: 커밋 및 푸시**

```bash
git add docs/superpowers/plans/2026-07-11-manager-announcement-scope-pill.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git commit -m "style(messaging): render announcement scopes as pills"
git push origin kms-commu
```
