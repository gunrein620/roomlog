# Manager Announcement Review Actions Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 공지 검토 화면의 보조 설명 3개를 제거하고 검토·발송 버튼을 최종 발송 정보 우측 하단으로 이동한다.

**Architecture:** 기존 서버 컴포넌트의 조회와 발송 흐름은 유지하고, `page.tsx`의 JSX 배치만 단일 열 구조로 재구성한다. 액션 그룹을 하나의 JSX 변수로 정의해 긴급 공지에서는 최종 발송 언어 카드 안에, 일반 공지에서는 수신자 명단 아래에 조건부로 한 번만 렌더링한다.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner, Docker Compose

## Global Constraints

- 스타일은 기존 CSS 토큰 `var(--...)`만 사용하고 raw hex를 추가하지 않는다.
- 공지 초안 조회, 수신자 산정, 번역 표시, 발송 서버 액션은 변경하지 않는다.
- 기존 미추적 문서와 인프라 파일은 수정하거나 스테이징하지 않는다.
- 기능 테스트와 웹 빌드가 통과한 뒤에만 구현 커밋과 푸시를 진행한다.

---

### Task 1: 공지 검토 액션 레이아웃 재구성

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/02/page.tsx`

**Interfaces:**
- Consumes: `AnnouncementSendForm({ draftId, canSend })`, `StaticButton`, `recipientState.canSend`, `isUrgent`
- Produces: `reviewActions` JSX 그룹과 긴급/일반 공지별 조건부 배치

- [x] **Step 1: 제거 및 배치 요구사항을 잠그는 실패 테스트 작성**

```js
test("manager announcement review keeps only final delivery actions in the content column", () => {
  for (const removedCopy of ["폰 read-only 미리보기", "문구 톤 체크", "확인 게이트"]) {
    assert.doesNotMatch(managerMessagingReviewSource, new RegExp(removedCopy));
  }
  assert.match(managerMessagingReviewSource, /const reviewActions = \(/);
  assert.match(managerMessagingReviewSource, /justifyContent: "flex-end"/);
  assert.match(managerMessagingReviewSource, /\{!isUrgent \? reviewActions : null\}/);
  assert.match(managerMessagingReviewSource, /\{isUrgent \? \([\s\S]*?최종 발송 언어[\s\S]*?\{reviewActions\}[\s\S]*?\) : null\}/);
  assert.doesNotMatch(managerMessagingReviewSource, /<aside/);
});
```

- [x] **Step 2: 테스트를 실행해 기존 레이아웃 때문에 실패하는지 확인**

Run: `cd apps/web && node --test property-shell.spec.mjs`

Expected: 새 테스트가 `폰 read-only 미리보기` 또는 `const reviewActions` 조건에서 실패한다.

- [x] **Step 3: 단일 열과 재사용 액션 그룹으로 최소 구현**

```tsx
const reviewActions = (
  <div
    data-testid="announcement-review-actions"
    style={{
      display: "flex",
      justifyContent: "flex-end",
      gap: "var(--space-sm)",
      flexWrap: "wrap",
      marginTop: "var(--space-md)",
    }}
  >
    <StaticButton>체크 완료</StaticButton>
    <AnnouncementSendForm draftId={draft.id} canSend={recipientState.canSend} />
  </div>
);
```

`page.tsx`에서 기존 2열 래퍼와 `<aside>`를 제거하고 다음 순서로 렌더링한다.

```tsx
<div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
  {/* 공지 본문 카드 */}
  {/* 수신자 명단 카드 */}
  {!isUrgent ? reviewActions : null}
  {isUrgent ? (
    <Card>
      <div style={sectionTitleStyle}>최종 발송 언어</div>
      {/* 기존 최종 언어 미리보기 카드 */}
      {reviewActions}
    </Card>
  ) : null}
</div>
```

- [x] **Step 4: 대상 테스트와 전체 웹 테스트 실행**

Run: `cd apps/web && node --test property-shell.spec.mjs`

Expected: 모든 property shell 테스트가 통과한다.

Run: `pnpm test:web`

Expected: property 및 unit 테스트가 모두 통과한다.

- [x] **Step 5: 프로덕션 빌드와 Docker 화면 검증**

Run: `pnpm --filter web build`

Expected: Next.js 프로덕션 빌드가 종료 코드 0으로 완료된다.

Run: `DOCKER_CONFIG=/tmp/roomlog-docker-anon docker compose --progress plain build web && DOCKER_CONFIG=/tmp/roomlog-docker-anon docker compose up -d web`

Expected: `roomlog-web` 이미지가 빌드되고 web 컨테이너가 실행된다.

브라우저에서 `/manager/messaging/02?id=<existing-draft-id>`를 새로고침해 제거 대상 문구가 없고 액션 버튼이 최종 발송 언어 카드 우측 하단에 표시되는지 확인한다.

- [x] **Step 6: 구현 파일만 커밋하고 브랜치 푸시**

```bash
git add apps/web/property-shell.spec.mjs apps/web/src/app/manager/messaging/02/page.tsx docs/superpowers/plans/2026-07-14-manager-announcement-review-actions-layout.md
git commit -m "fix(messaging): 공지 검토 액션 위치 정리"
git push origin kms-notice
```
