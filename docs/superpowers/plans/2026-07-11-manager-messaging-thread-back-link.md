# Manager Messaging Thread Back Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 채팅 상세 좌상단에 소통 허브로 돌아가는 화살표 링크를 추가한다.

**Architecture:** 기존 서버 컴포넌트 페이지 안에 Next.js `Link`를 직접 배치해 방문 기록과 무관한 고정 경로 탐색을 제공한다. 기존 `ScreenHeader`의 우측 액션에는 삭제만 남기고, 소스 회귀 테스트로 링크·접근성 라벨·중복 허브 버튼 제거를 잠근다.

**Tech Stack:** Next.js 16 App Router, React 19, Node.js test runner

## Global Constraints

- 작업 범위는 관리자 메시징 상세 `/manager/messaging/04`와 해당 웹 회귀 테스트로 제한한다.
- 스타일 값은 기존 CSS 변수만 사용하며 raw hex를 추가하지 않는다.
- 인프라 파일은 수정하지 않는다.

---

### Task 1: 채팅 상세 뒤로가기 링크

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`

**Interfaces:**
- Consumes: `MANAGER_MESSAGING_ROUTES["M-MSG-00"]`
- Produces: `aria-label="소통 허브로 돌아가기"`인 좌상단 링크

- [ ] **Step 1: Write the failing test**

```js
test("manager messaging thread exposes a single top-left link back to the hub", () => {
  assert.match(managerMessagingThreadSource, /aria-label="소통 허브로 돌아가기"/);
  assert.match(managerMessagingThreadSource, /href=\{MANAGER_MESSAGING_ROUTES\["M-MSG-00"\]\}/);
  assert.doesNotMatch(managerMessagingThreadSource, />허브<\/LinkButton>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec node --test --test-name-pattern="manager messaging thread exposes" property-shell.spec.mjs`

Expected: FAIL because the accessible back link is absent.

- [ ] **Step 3: Write minimal implementation**

Import `Link` from `next/link`, render a 44×44 token-styled arrow link immediately before the thread title, and remove the right-side `허브` `LinkButton`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec node --test --test-name-pattern="manager messaging thread exposes" property-shell.spec.mjs`

Expected: PASS.

- [ ] **Step 5: Run feature and repository verification**

Run: `pnpm test:web`

Run: `bash scripts/verify.sh`

Expected: both commands exit 0.

- [ ] **Step 6: Commit and push**

```bash
git add apps/web/property-shell.spec.mjs apps/web/src/app/manager/messaging/04/page.tsx docs/superpowers/specs/2026-07-11-manager-messaging-thread-back-link-design.md docs/superpowers/plans/2026-07-11-manager-messaging-thread-back-link.md
git commit -m "feat(messaging): add thread back link"
git push origin kms-commu
```
