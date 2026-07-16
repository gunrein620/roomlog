# Manager Announcement Review Check Button Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 공지 발송 전 검토 화면에서 동작하지 않는 `체크 완료` 버튼만 제거한다.

**Architecture:** 기존 `reviewActions` 컨테이너와 `AnnouncementSendForm`은 유지한다. `page.tsx`에서 정적 `체크 완료` 버튼과 사용하지 않게 되는 `StaticButton` import만 제거해 발송 서버 액션과 수신자 검증에 영향을 주지 않는다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하며 인프라 파일은 변경하지 않는다.
- `승인하고 발송`, `발송 중...`, `수신자 없음` 상태와 서버 액션은 변경하지 않는다.
- 긴급 공지와 일반 공지의 기존 `reviewActions` 표시 위치를 유지한다.
- 수정 버튼, 공지 본문, 수신자 명단, 최종 발송 언어 영역은 변경하지 않는다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 관련 테스트와 web 빌드가 통과한 경우에만 구현 커밋을 원격 `kms-manager-chat`에 푸시한다.

---

### Task 1: 검토 화면의 정적 체크 버튼 제거

**Files:**
- Test: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/02/page.tsx`

**Interfaces:**
- Consumes: 기존 `reviewActions`, `AnnouncementSendForm`, `recipientState.canSend`
- Produces: `AnnouncementSendForm`만 포함하는 기존 위치의 `reviewActions`

- [x] **Step 1: 체크 버튼 부재 계약을 테스트에 추가한다**

`manager announcement review keeps only final delivery actions in the content column` 테스트의 기존 `reviewActions` 단언 옆에 다음 단언을 추가한다.

```js
assert.doesNotMatch(managerMessagingReviewSource, /체크 완료/);
assert.doesNotMatch(managerMessagingReviewSource, /\bStaticButton\b/);
```

기존 `reviewActions`, 긴급·일반 공지 위치, `AnnouncementSendForm` 단언은 유지한다.

- [x] **Step 2: 관련 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement review keeps only final delivery actions in the content column" property-shell.spec.mjs
```

Expected: `page.tsx`에 `체크 완료`와 `StaticButton`이 남아 있어 1 test, 0 pass, 1 fail로 종료한다.

- [x] **Step 3: 정적 체크 버튼과 import를 제거한다**

`apps/web/src/app/manager/messaging/02/page.tsx`의 `../_components` import에서 `StaticButton`을 제거한다.

```tsx
import {
  Badge,
  Card,
  CATEGORY_LABEL,
  LinkButton,
  NoticeCard,
  SCOPE_LABEL,
  ScreenHeader,
  sectionTitleStyle,
} from "../_components";
```

`reviewActions` 내부를 다음과 같이 변경한다.

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
    <div style={{ width: "min(280px, 100%)" }}>
      <AnnouncementSendForm
        draftId={draft.id}
        canSend={recipientState.canSend}
      />
    </div>
  </div>
);
```

- [x] **Step 4: 관련 테스트를 다시 실행해 GREEN을 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement review keeps only final delivery actions in the content column" property-shell.spec.mjs
```

Expected: 1 test, 1 pass, 0 fail.

- [x] **Step 5: web 프로덕션 빌드를 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web build가 exit 0으로 완료된다.

- [x] **Step 6: Docker와 실제 검토 화면을 검증한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
```

브라우저에서 `/manager/messaging/02?id=draft_urgent_water`를 확인한다.

- `체크 완료` 버튼이 표시되지 않는다.
- `승인하고 발송` 버튼이 표시된다.
- 버튼은 최종 발송 언어 카드 아래 오른쪽에 유지된다.
- error overlay와 console error가 없다.

- [ ] **Step 7: 이번 작업 파일만 커밋하고 푸시한다**

Run:

```bash
git diff --check
git add \
  docs/superpowers/plans/2026-07-16-manager-announcement-review-check-button-removal.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/02/page.tsx
git diff --cached --check
git commit -m "fix: remove announcement review check button"
git push origin kms-manager-chat
```

Expected: 계획, 테스트, 검토 화면 구현 파일만 원격 `kms-manager-chat`에 반영된다.
