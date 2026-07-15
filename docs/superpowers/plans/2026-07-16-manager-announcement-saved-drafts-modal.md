# Manager Announcement Saved Drafts Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공지 작성 화면에서만 상단 `임시 저장` 버튼을 표시하고, 클릭 시 미발송 초안 목록을 모달로 열어 기존 작성 폼에 불러온다.

**Architecture:** `ManagerSectionNav`가 작성 경로에서만 `drafts=open` 링크를 추가하고 현재 `id`를 보존한다. 작성 서버 페이지는 기존 초안 목록 조회를 유지하되 큰 목록 카드 대신 URL 열림 상태와 초안 배열을 받는 네이티브 `<dialog>` 클라이언트 컴포넌트를 렌더링한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하며 인프라 파일은 변경하지 않는다.
- `임시 저장` 링크는 `/manager/messaging/01`에서만 `공지 작성` 옆에 표시한다.
- 현재 `id` 쿼리를 유지하고 `drafts=open`으로 모달을 연다.
- 기존 화면 상단의 큰 임시 저장 목록 카드는 제거한다.
- `status === "draft"`인 초안만 최신순으로 표시한다.
- 닫기 버튼, 바깥 영역 클릭, `Esc`를 지원한다.
- 저장 시각은 `Asia/Seoul`로 고정해 서버와 브라우저 hydration 결과를 일치시킨다.
- API, 데이터베이스, 공유 타입, 초안 저장·발송 동작은 변경하지 않는다.
- 스타일 값은 기존 CSS 토큰만 사용하고 raw hex를 추가하지 않는다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 이번 기능 관련 테스트와 web 빌드, Docker 브라우저 검증이 통과한 경우에만 커밋하고 푸시한다.

---

### Task 1: 작성 화면 전용 임시 저장 진입 상태

**Files:**
- Create: `apps/web/src/app/manager/_components/manager-section-nav-state.ts`
- Create: `apps/web/src/app/manager/_components/manager-section-nav-state.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerSectionNav.tsx`

**Interfaces:**
- Consumes: 현재 `pathname: string`, `URLSearchParams`
- Produces: `savedDraftsModalHref(pathname: string, searchParams: Pick<URLSearchParams, "get">): string | null`

- [x] **Step 1: 작성 화면 경로와 현재 초안 ID를 고정하는 실패 테스트를 작성한다**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { savedDraftsModalHref } from "./manager-section-nav-state";

describe("manager section saved drafts action", () => {
  it("shows only on announcement compose and preserves the editing draft id", () => {
    assert.equal(savedDraftsModalHref("/manager/messaging/00", new URLSearchParams()), null);
    assert.equal(
      savedDraftsModalHref(
        "/manager/messaging/01",
        new URLSearchParams("id=draft_1"),
      ),
      "/manager/messaging/01?id=draft_1&drafts=open",
    );
  });
});
```

- [x] **Step 2: 단위 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/_components/manager-section-nav-state.spec.ts
```

Expected: `manager-section-nav-state` 모듈이 없어 실패한다.

- [x] **Step 3: 최소 URL 상태 함수를 구현한다**

```ts
export function savedDraftsModalHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  if (pathname !== "/manager/messaging/01") return null;
  const params = new URLSearchParams();
  const id = searchParams.get("id");
  if (id) params.set("id", id);
  params.set("drafts", "open");
  return `${pathname}?${params.toString()}`;
}
```

- [x] **Step 4: `ManagerSectionNav`에 작성 화면 전용 링크를 추가한다**

```tsx
const savedDraftsHref = savedDraftsModalHref(pathname, searchParams);

{savedDraftsHref ? (
  <Link
    href={savedDraftsHref}
    aria-haspopup="dialog"
    onMouseEnter={(event) => slideGlassTo(event.currentTarget)}
  >
    <span>임시 저장</span>
  </Link>
) : null}
```

- [x] **Step 5: 단위 테스트를 다시 실행해 GREEN을 확인한다**

Run the Step 2 command.

Expected: 1 test, 1 pass, 0 fail.

---

### Task 2: 저장 초안 모달과 작성 페이지 연결

**Files:**
- Create: `apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftModal.tsx`
- Create: `apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftModal.module.css`
- Delete: `apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftList.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/page.tsx`
- Modify: `apps/web/property-shell.spec.mjs`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `drafts: AnnouncementDraft[]`, `open: boolean`, `closeHref: string`
- Produces: `SavedAnnouncementDraftModal({ drafts, open, closeHref }): React.JSX.Element`

- [x] **Step 1: 기존 카드 제거와 모달 계약을 실패 테스트로 작성한다**

`property-shell.spec.mjs`가 새 모달 파일과 메뉴 소스를 읽고 다음 계약을 확인하게 한다.

```js
assert.match(managerSectionNavSource, /savedDraftsModalHref/);
assert.match(managerSectionNavSource, /aria-haspopup="dialog"/);
assert.match(managerSectionNavSource, />\s*<span>임시 저장<\/span>/);
assert.match(managerMessagingComposeSource, /drafts\?: string/);
assert.match(managerMessagingComposeSource, /<SavedAnnouncementDraftModal/);
assert.doesNotMatch(managerMessagingComposeSource, /<SavedAnnouncementDraftList/);
assert.match(managerMessagingSavedDraftModalSource, /<dialog/);
assert.match(managerMessagingSavedDraftModalSource, /showModal\(\)/);
assert.match(managerMessagingSavedDraftModalSource, /aria-labelledby="manager-saved-drafts-title"/);
assert.match(managerMessagingSavedDraftModalSource, /임시 저장된 공지가 없습니다\./);
assert.match(managerMessagingSavedDraftModalSource, />\s*불러오기\s*<\/Link>/);
```

- [x] **Step 2: 관련 계약 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: 새 모달 파일과 연결이 없어 1 test, 0 pass, 1 fail이다.

- [x] **Step 3: 네이티브 dialog 모달을 최소 구현한다**

```tsx
"use client";

import type { AnnouncementDraft } from "@roomlog/types";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { formatDateTime } from "../_components";
import {
  savedAnnouncementDraftTitle,
  selectSavedAnnouncementDrafts,
} from "./saved-drafts-state";
import styles from "./SavedAnnouncementDraftModal.module.css";

export function SavedAnnouncementDraftModal({
  drafts,
  open,
  closeHref,
}: {
  drafts: AnnouncementDraft[];
  open: boolean;
  closeHref: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const savedDrafts = selectSavedAnnouncementDrafts(drafts);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeModal() {
    router.replace(closeHref, { scroll: false });
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeModal();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="manager-saved-drafts-title"
      onClick={closeOnBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        closeModal();
      }}
    >
      <section className={styles.surface} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2 id="manager-saved-drafts-title">임시 저장된 공지</h2>
          <button type="button" aria-label="임시 저장 목록 닫기" onClick={closeModal}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.list}>
          {savedDrafts.length > 0 ? savedDrafts.map((draft) => (
            <article key={draft.id} className={styles.row}>
              <div>
                <h3>{savedAnnouncementDraftTitle(draft)}</h3>
                <p>{draft.targetLabel} · 마지막 저장 {formatDateTime(draft.updatedAt)}</p>
              </div>
              <Link href={`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(draft.id)}`}>
                불러오기
              </Link>
            </article>
          )) : <p className={styles.empty}>임시 저장된 공지가 없습니다.</p>}
        </div>
      </section>
    </dialog>
  );
}
```

- [x] **Step 4: 토큰 기반 모달 스타일을 추가한다**

```css
.dialog {
  width: min(680px, calc(100vw - (var(--space-xl) * 2)));
  max-height: min(720px, calc(100dvh - (var(--space-xl) * 2)));
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--on-surface);
  background: var(--surface-container-lowest);
  box-shadow: var(--shadow);
}

.dialog::backdrop {
  background: color-mix(in srgb, var(--on-surface) 48%, transparent);
}

.surface {
  max-height: inherit;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-xl);
  border-bottom: 1px solid var(--border);
}

.header h2,
.row h3,
.row p,
.empty {
  margin: 0;
}

.header button {
  width: var(--touch-target);
  height: var(--touch-target);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--on-surface-variant);
  background: transparent;
  cursor: pointer;
}

.list {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-sm);
  padding: var(--space-xl);
  overflow-y: auto;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: var(--surface-container-low);
}

.row h3 {
  overflow-wrap: anywhere;
  font-size: var(--fs-body);
}

.row p,
.empty {
  margin-top: var(--space-xs);
  color: var(--on-surface-variant);
  font-size: var(--fs-caption);
}

.row a {
  min-height: var(--touch-target);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-lg);
  border: 1px solid var(--primary);
  border-radius: var(--radius-btn);
  color: var(--primary);
  text-decoration: none;
  font-weight: 700;
}

@media (max-width: 560px) {
  .dialog {
    width: calc(100vw - (var(--space-lg) * 2));
  }

  .row {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [x] **Step 5: 작성 페이지를 URL 모달 상태에 연결한다**

```tsx
type SearchParams = Promise<{ id?: string; drafts?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ id, drafts: draftsState }, user, drafts] = await Promise.all([
    searchParams,
    requireUser("LANDLORD"),
    listAnnouncementDrafts(),
  ]);
  const draft = id ? await getAnnouncementDraft(id) : DEMO_MANAGER_DRAFTS[0];
  const initialDraft = prepareAnnouncementDraftForCompose(draft, Boolean(id));
  const closeHref = id
    ? `${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(id)}`
    : MANAGER_MESSAGING_ROUTES["M-MSG-01"];

  return (
    <>
      <ScreenHeader eyebrow="M-MSG-01" title="공지 작성" />
      <SavedAnnouncementDraftModal
        drafts={drafts}
        open={draftsState === "open"}
        closeHref={closeHref}
      />
      <AnnouncementComposer
        key={id ?? "new"}
        initialDraft={initialDraft}
        draftId={id}
        managedRooms={user.managedRooms ?? []}
      />
    </>
  );
}
```

- [x] **Step 6: 계약 테스트를 다시 실행해 GREEN을 확인한다**

Run the Step 2 command.

Expected: 1 test, 1 pass, 0 fail.

- [x] **Step 7: 기능 관련 단위·계약 테스트를 함께 실행한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/_components/manager-section-nav-state.spec.ts \
  src/app/manager/messaging/01/saved-drafts-state.spec.ts
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: 새 URL 상태 테스트, 기존 초안 상태 테스트 2개, 작성 화면 계약 테스트가 모두 통과한다.

---

### Task 3: 서버·브라우저 날짜 포맷 일치

**Files:**
- Create: `apps/web/src/app/manager/messaging/messaging-date-time.ts`
- Create: `apps/web/src/app/manager/messaging/messaging-date-time.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/_components.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftModal.tsx`

**Interfaces:**
- Consumes: ISO 8601 날짜 문자열
- Produces: `formatDateTime(iso: string): string`의 `Asia/Seoul` 고정 출력

- [x] **Step 1: UTC 서버에서도 한국 시각 11:13을 출력하는 실패 테스트를 작성한다**

```ts
assert.match(formatDateTime("2026-07-14T02:13:00.000Z"), /11:13/);
```

- [x] **Step 2: 테스트를 실행해 모듈 부재 RED를 확인한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/messaging-date-time.spec.ts
```

Expected: `messaging-date-time` 모듈 부재로 실패한다.

- [x] **Step 3: `Intl.DateTimeFormat`에 `timeZone: "Asia/Seoul"`을 지정한다**

```ts
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
```

- [x] **Step 4: 기존 `_components.tsx` export와 모달 import를 순수 함수에 연결한다**

`_components.tsx`는 `export { formatDateTime } from "./messaging-date-time";`로 기존 소비자 계약을 유지하고, 모달은 `../messaging-date-time`에서 직접 import한다.

- [x] **Step 5: 날짜 단위 테스트와 작성 화면 계약 테스트를 다시 실행해 GREEN을 확인한다**

Expected: 한국 시각 단위 테스트와 작성 화면 계약 테스트가 모두 통과한다.

---

### Task 4: 빌드, Docker 브라우저 검증과 배포

- [x] **Step 8: web 프로덕션 빌드를 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web build가 exit 0으로 완료된다.

- [x] **Step 9: Docker web 이미지와 브라우저 동작을 검증한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
```

브라우저에서 `/manager/messaging/01`을 확인한다.

- 상단 `공지 작성` 옆에 `임시 저장`이 표시된다.
- 기존 큰 임시 저장 카드가 표시되지 않는다.
- `임시 저장`을 누르면 모달이 열리고 초안 목록이 최신순으로 표시된다.
- 닫기, 바깥 영역, `Esc`가 모달을 닫는다.
- `불러오기`가 선택한 초안을 작성 폼에 표시한다.
- 소통 허브에서는 `임시 저장` 링크가 표시되지 않는다.
- error overlay와 console error가 없다.

- [ ] **Step 10: 이번 기능 파일만 커밋하고 푸시한다**

Run:

```bash
git diff --check
git add \
  docs/superpowers/specs/2026-07-16-manager-announcement-saved-drafts-modal-design.md \
  docs/superpowers/plans/2026-07-16-manager-announcement-saved-drafts-modal.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/_components/ManagerSectionNav.tsx \
  apps/web/src/app/manager/_components/manager-section-nav-state.ts \
  apps/web/src/app/manager/_components/manager-section-nav-state.spec.ts \
  apps/web/src/app/manager/messaging/01/page.tsx \
  apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftModal.tsx \
  apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftModal.module.css \
  apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftList.tsx \
  apps/web/src/app/manager/messaging/_components.tsx \
  apps/web/src/app/manager/messaging/messaging-date-time.ts \
  apps/web/src/app/manager/messaging/messaging-date-time.spec.ts
git diff --cached --check
git commit -m "feat: open saved announcements in modal"
git push origin kms-manager-chat
```

Expected: 이번 기능 문서, 테스트, 메뉴 상태, 모달, 작성 페이지 변경만 원격 `kms-manager-chat`에 반영된다.
