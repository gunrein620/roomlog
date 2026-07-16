# Manager Announcement Dunning Hint Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 공지 작성 화면에서 연체·독촉 별도 채널 안내 문장만 제거한다.

**Architecture:** 기존 `AnnouncementComposer`의 대상 안내 JSX에서 요청된 문장과 줄바꿈만 삭제한다. 공지 대상 계산, 저장·검토 흐름, API 정책은 변경하지 않고 기존 고수준 소스 계약 테스트로 삭제 및 유지 범위를 검증한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 인프라 파일은 수정하지 않는다.
- `미납 세대 옵션은 없습니다. 연체·독촉은 별도 채널에서 처리합니다.`만 제거한다.
- `공지 대상을 선택하세요.`와 `전체`, `건물`, `호실` 대상 기능은 유지한다.
- 서버의 공지 채널 연체·독촉 차단 정책과 청구 채널은 변경하지 않는다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 이번 작업 테스트와 web 빌드가 통과한 경우에만 커밋하고 푸시한다.

---

### Task 1: 공지 대상 안내 문구 제거

**Files:**
- Test: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`

**Interfaces:**
- Consumes: `managerMessagingComposerSource`, 기존 `AnnouncementComposer` JSX
- Produces: 요청된 연체·독촉 안내가 없고 일반 대상 안내는 유지되는 공지 작성 화면

- [ ] **Step 1: 삭제 및 유지 조건을 고수준 회귀 테스트에 추가한다**

`manager announcement compose edits targets and translates each language before review` 테스트의 대상 선택 검증에 다음 단언을 추가한다.

```js
assert.match(managerMessagingComposerSource, /공지 대상을 선택하세요\./);
assert.doesNotMatch(
  managerMessagingComposerSource,
  /미납 세대 옵션은 없습니다\. 연체·독촉은 별도 채널에서 처리합니다\./,
);
assert.match(managerMessagingComposerSource, /\{ value: "all", label: "전체" \}/);
assert.match(managerMessagingComposerSource, /\{ value: "building", label: "건물" \}/);
assert.match(managerMessagingComposerSource, /\{ value: "unit", label: "호실" \}/);
```

- [ ] **Step 2: 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web && node --test property-shell.spec.mjs
```

Expected: `미납 세대 옵션은 없습니다...` 문장이 아직 소스에 있어 해당 `doesNotMatch` 단언이 실패한다.

- [ ] **Step 3: 요청된 문장과 불필요해진 줄바꿈만 삭제한다**

`AnnouncementComposer.tsx`의 대상 안내를 다음과 같이 변경한다.

```tsx
<div className={styles.targetHint}>
  공지 대상을 선택하세요.
</div>
```

다른 대상 선택 JSX와 저장 로직은 변경하지 않는다.

- [ ] **Step 4: 관련 회귀 테스트를 다시 실행해 GREEN을 확인한다**

Run:

```bash
cd apps/web && node --test property-shell.spec.mjs
```

Expected: 모든 `property-shell.spec.mjs` 테스트가 통과한다.

- [ ] **Step 5: web 프로덕션 빌드를 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web 빌드가 exit 0으로 완료된다.

- [ ] **Step 6: Docker web 이미지를 다시 빌드하고 로컬 응답을 확인한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
curl -sS -D - -o /dev/null http://localhost:3000/manager/messaging/01
```

Expected: web, api, postgres 컨테이너가 실행 중이고 공지 작성 URL이 5xx 없이 응답한다. 인증이 없는 요청의 redirect는 허용한다.

- [ ] **Step 7: 변경 범위를 검토한다**

Run:

```bash
git diff --check
git diff -- apps/web/property-shell.spec.mjs apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx
git status --short
```

Expected: 두 코드 파일만 변경되고 기존 미추적 사용자 문서는 그대로 남는다.

- [ ] **Step 8: 구현을 커밋하고 현재 브랜치에 푸시한다**

Run:

```bash
git add docs/superpowers/plans/2026-07-15-manager-announcement-dunning-hint-removal.md apps/web/property-shell.spec.mjs apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx
git commit -m "fix: remove announcement dunning hint"
git push origin kms-manager-chat
```

Expected: 구현 커밋이 원격 `kms-manager-chat`에 반영된다.
