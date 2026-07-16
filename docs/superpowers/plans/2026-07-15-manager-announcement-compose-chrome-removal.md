# Manager Announcement Compose Chrome Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 공지 작성 화면에서만 상단 `허브` 버튼과 우측 발송 안내 박스를 제거한다.

**Architecture:** M-MSG-01 페이지 헤더의 action과 `AnnouncementComposer`의 `primaryInfo` 섹션을 직접 제거한다. 다른 메시징 화면과 공지 작성·저장·검토 동작은 유지하고 기존 소스 계약 테스트로 삭제 범위를 고정한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 인프라 파일은 수정하지 않는다.
- `/manager/messaging/01`에서만 `허브` 버튼과 발송 안내 박스를 제거한다.
- 다른 메시징 화면의 `허브` 링크와 공지 작성·저장·번역·검토 기능은 유지한다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 이번 작업의 관련 테스트와 web 빌드가 통과한 경우에만 커밋하고 푸시한다.

---

### Task 1: 공지 작성 화면의 전용 UI 제거

**Files:**
- Test: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/page.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`

**Interfaces:**
- Consumes: `managerMessagingComposeSource`, `managerMessagingComposerSource`, `managerMessagingComposerCssSource`
- Produces: 헤더 action과 발송 안내 카드가 없는 M-MSG-01 화면, 유지되는 작성·검토 동작

- [ ] **Step 1: 삭제 및 유지 조건을 회귀 테스트에 추가한다**

`manager announcement compose edits targets and translates each language before review` 테스트에 다음 단언을 추가한다.

```js
assert.doesNotMatch(managerMessagingComposeSource, /LinkButton/);
assert.doesNotMatch(managerMessagingComposeSource, />\s*허브\s*</);
assert.doesNotMatch(managerMessagingComposerSource, /발송은 다음 화면에서만/);
assert.doesNotMatch(
  managerMessagingComposerSource,
  /이 화면은 작성과 저장까지만 담당합니다\. 자동 발송 없이 검토 게이트를 거칩니다\./,
);
assert.doesNotMatch(managerMessagingComposerCssSource, /\.primaryInfo/);
assert.match(managerMessagingComposerSource, /▷ 검토하고 발송으로/);
```

- [ ] **Step 2: 관련 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: M-MSG-01에 `LinkButton`, `허브`, 발송 안내 문구와 `primaryInfo` CSS가 남아 있어 새 단언 중 하나 이상이 실패한다.

- [ ] **Step 3: M-MSG-01 헤더 action을 제거한다**

`apps/web/src/app/manager/messaging/01/page.tsx`에서 import와 헤더를 다음 형태로 변경한다.

```tsx
import { ScreenHeader } from "../_components";

<ScreenHeader eyebrow="M-MSG-01" title="공지 작성" />
```

- [ ] **Step 4: 발송 안내 섹션과 전용 CSS를 제거한다**

`AnnouncementComposer.tsx`의 `rightColumn` 시작 부분에서 다음 섹션 전체를 삭제한다.

```tsx
<section className={styles.primaryInfo}>
  <h2>발송은 다음 화면에서만</h2>
  <p>이 화면은 작성과 저장까지만 담당합니다. 자동 발송 없이 검토 게이트를 거칩니다.</p>
</section>
```

`AnnouncementComposer.module.css`에서 `.primaryInfo`, `.primaryInfo h2`, `.primaryInfo p`와 반응형 `.primaryInfo` 규칙만 삭제한다. `.rightColumn` 및 번역 카드 스타일은 유지한다.

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

Expected: web, api, postgres 컨테이너가 실행 중이고 대상 URL이 5xx 없이 응답한다. 인증 없는 요청의 redirect는 허용한다.

- [ ] **Step 8: 변경 범위를 검토하고 커밋·푸시한다**

Run:

```bash
git diff --check
git add \
  docs/superpowers/plans/2026-07-15-manager-announcement-compose-chrome-removal.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/page.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git diff --cached --check
git commit -m "fix: simplify announcement compose screen"
git push origin kms-manager-chat
```

Expected: 이번 작업의 계획·테스트·구현 파일만 커밋되고 원격 `kms-manager-chat`에 반영된다.
