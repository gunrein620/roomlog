# Manager Messaging Static Actions Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 관리자 메시징 상세 화면에서 동작하지 않는 보조 버튼과 AI 답장 초안 영역을 제거하고, 메시지 본문을 전체 너비로 확장한다.

**Architecture:** 상세 페이지의 오른쪽 `aside` JSX와 2열 grid 래퍼를 삭제한다. 메시지 맥락, 타임라인, 답장 폼, 자동 갱신, 읽음 처리는 그대로 유지하며 API나 공유 타입은 변경하지 않는다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 인프라 파일은 변경하지 않는다.
- 기존 미추적 문서와 사용자 변경은 건드리거나 스테이징하지 않는다.
- raw hex를 추가하지 않고 기존 디자인 토큰 사용을 유지한다.
- 이번 기능의 회귀 테스트와 web 빌드가 통과한 경우에만 커밋하고 푸시한다.

---

### Task 1: 미작동 메시징 액션과 보조 열 제거

**Files:**
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`

**Preserved interfaces:**
- `ManagerThreadReadReceipt`
- `MessageAutoRefresh`
- 메시지 타임라인
- 답장 입력 및 전송 폼

**Step 1: 삭제 및 유지 조건을 회귀 테스트에 먼저 고정한다**

`hides guidance cards while keeping their actions` 테스트를 다음 의도의 테스트로 교체한다.

```ts
test("removes non-working messaging actions and their empty side rail", () => {
  for (const text of [
    "사진 요청",
    "설명 요청",
    "AI 답장 초안",
    "초안 적용",
    "음성 받아쓰기 → 텍스트 확인",
  ]) {
    assert.doesNotMatch(detailPage, new RegExp(text));
  }

  assert.doesNotMatch(detailPage, /StaticButton/);
  assert.doesNotMatch(detailPage, /<aside/);
  assert.doesNotMatch(detailPage, /340px/);
  assert.match(detailPage, /<ManagerThreadReadReceipt threadId=\{thread\.id\} \/>/);
  assert.match(detailPage, /<MessageAutoRefresh intervalMs=\{3000\} \/>/);
  assert.match(detailPage, />메시지 타임라인<\/div>/);
  assert.match(detailPage, /<Input name="body"/);
  assert.match(detailPage, /<Button type="submit">답장 보내기<\/Button>/);
});
```

**Step 2: RED 테스트를 실행한다**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: 현재 상세 페이지에 `사진 요청` 등의 문구와 `StaticButton`, `aside`, `340px`이 남아 있어 새 테스트가 실패한다.

**Step 3: 최소 구현으로 오른쪽 보조 영역을 삭제한다**

`apps/web/src/app/manager/messaging/04/page.tsx`에서 다음만 변경한다.

- `../_components` import에서 `StaticButton` 제거
- `gridTemplateColumns: "minmax(0, 1fr) 340px"`인 바깥 2열 grid 제거
- 기존 주 콘텐츠의 세로 flex 래퍼를 최상위 본문 래퍼로 유지
- `사진 요청`, `설명 요청`, `AI 답장 초안`, `초안 적용`, `음성 받아쓰기 → 텍스트 확인`을 포함한 `<aside>` 전체 삭제

API 호출, 타입, 메시지 렌더링, 답장 폼, 읽음 처리에는 손대지 않는다.

**Step 4: GREEN 테스트와 관련 회귀 테스트를 실행한다**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts src/lib/manager-messaging-unread.spec.ts
```

Expected: 모든 테스트 통과.

**Step 5: web 빌드로 타입과 렌더링 계약을 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web 빌드 성공.

**Step 6: Docker web 이미지를 다시 빌드하고 로컬 응답을 확인한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
curl -I http://localhost:3000/manager/messaging/04
```

Expected: web 컨테이너가 실행 중이고 로컬 라우트가 HTTP 응답을 반환한다. 인증 또는 쿼리 파라미터에 따른 redirect 응답은 허용하되 5xx는 실패로 본다.

**Step 7: diff를 검토한다**

Run:

```bash
git diff --check
git diff -- apps/web/src/lib/messaging-thread-location.spec.ts apps/web/src/app/manager/messaging/04/page.tsx
git status --short
```

Expected: 계획된 두 코드 파일과 이 계획 문서 외에 새 변경이 없고, 기존 미추적 사용자 문서는 그대로 남는다.

**Step 8: 이번 기능만 커밋하고 푸시한다**

Run:

```bash
git add docs/superpowers/plans/2026-07-15-manager-messaging-static-actions-removal.md apps/web/src/lib/messaging-thread-location.spec.ts apps/web/src/app/manager/messaging/04/page.tsx
git commit -m "fix: remove inactive messaging actions"
git push origin kms-manager-chat
```

Expected: `kms-manager-chat` 브랜치에 이번 기능 커밋이 푸시된다.
