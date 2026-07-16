# Manager Announcement Target Hint Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 공지 작성 화면의 대상 안내 박스를 대상 결과 오른쪽에 문구 너비로 배치하고, 좁은 화면에서는 대상 아래로 이동시킨다.

**Architecture:** 기존 대상 계산과 선택 controls는 그대로 두고 `targetBox`와 `targetHint`만 `targetSummary` wrapper로 묶는다. CSS Grid로 데스크톱은 `남은 폭 + 내용 폭`, 모바일은 1열 구조를 사용한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 인프라 파일은 수정하지 않는다.
- `공지 대상을 선택하세요.` 문구는 변경하지 않는다.
- 데스크톱에서는 안내 박스를 대상 결과 오른쪽에 문구 너비로 배치한다.
- `640px` 이하에서는 안내 박스를 대상 결과 아래로 이동시키고 콘텐츠 너비를 유지한다.
- 대상 범위·건물·호실 선택과 대상 계산 로직은 변경하지 않는다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 이번 작업의 관련 테스트와 web 빌드가 통과한 경우에만 커밋하고 푸시한다.

---

### Task 1: 대상 요약 행의 반응형 배치

**Files:**
- Test: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`

**Interfaces:**
- Consumes: `managerMessagingComposerSource`, `managerMessagingComposerCssSource`, 기존 `target.targetLabel`
- Produces: `targetSummary` 안에서 함께 렌더되는 대상 결과와 안내 문구

- [ ] **Step 1: 원하는 JSX와 CSS 계약을 회귀 테스트에 추가한다**

`manager announcement compose edits targets and translates each language before review` 테스트의 대상 영역 단언에 다음 검증을 추가한다.

```js
assert.match(
  managerMessagingComposerSource,
  /<div className=\{styles\.targetSummary\}>\s*<div className=\{styles\.targetBox\}>[\s\S]*?<div className=\{styles\.targetHint\}>\s*공지 대상을 선택하세요\.\s*<\/div>\s*<\/div>/,
);
assert.match(
  managerMessagingComposerCssSource,
  /\.targetSummary\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) max-content;/,
);
assert.match(
  managerMessagingComposerCssSource,
  /\.targetHint\s*\{[\s\S]*?width: max-content;[\s\S]*?white-space: nowrap;/,
);
assert.match(
  managerMessagingComposerCssSource,
  /@media \(max-width: 640px\)[\s\S]*?\.targetSummary\s*\{\s*grid-template-columns: 1fr;\s*\}/,
);
```

- [ ] **Step 2: 관련 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: `targetSummary` JSX와 CSS가 아직 없어 1 test, 0 pass, 1 fail로 종료한다.

- [ ] **Step 3: 대상 결과와 안내 문구를 전용 wrapper로 묶는다**

`AnnouncementComposer.tsx`의 기존 두 요소를 다음 구조로 변경한다.

```tsx
<div className={styles.targetSummary}>
  <div className={styles.targetBox}>
    <span>{target.targetLabel}</span>
  </div>
  <div className={styles.targetHint}>
    공지 대상을 선택하세요.
  </div>
</div>
```

- [ ] **Step 4: 데스크톱과 모바일 배치 CSS를 추가한다**

`AnnouncementComposer.module.css`의 대상 controls 영역에 다음 규칙을 추가한다.

```css
.targetSummary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: var(--space-md);
  align-items: stretch;
}

.targetHint {
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  max-width: 100%;
  padding: var(--space-md) var(--space-lg);
  border: 1px dashed var(--outline-variant);
  color: var(--on-surface-variant);
  text-align: center;
  white-space: nowrap;
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
}
```

기존 `.targetHint` 규칙은 위 내용으로 교체해 중복을 만들지 않는다. 기존 `@media (max-width: 640px)` 안에는 다음 규칙을 추가한다.

```css
.targetSummary {
  grid-template-columns: 1fr;
}

.targetHint {
  justify-self: start;
}
```

- [ ] **Step 5: 관련 회귀 테스트를 다시 실행해 GREEN을 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: 1 test, 1 pass, 0 fail.

- [ ] **Step 6: web 프로덕션 빌드를 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web build가 exit 0으로 완료된다.

- [ ] **Step 7: Docker web 이미지를 재빌드하고 로컬 응답을 확인한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
curl -sS -D - -o /dev/null http://localhost:3000/manager/messaging/01
```

Expected: web, api, postgres가 실행 중이고 대상 URL이 5xx 없이 응답한다. 인증 없는 요청의 redirect는 허용한다.

- [ ] **Step 8: 변경 범위를 검토하고 커밋·푸시한다**

Run:

```bash
git diff --check
git add \
  docs/superpowers/plans/2026-07-16-manager-announcement-target-hint-layout.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git diff --cached --check
git commit -m "fix: align announcement target hint"
git push origin kms-manager-chat
```

Expected: 이번 작업의 계획·테스트·구현 파일만 원격 `kms-manager-chat`에 반영된다.
