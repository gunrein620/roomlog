# Manager Announcement Saved Drafts List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공지 작성 화면 상단에서 임시 저장한 미발송 공지를 확인하고 기존 작성 폼으로 다시 불러온다.

**Architecture:** 초안 상태 필터·정렬과 제목 폴백을 순수 함수로 분리한다. 공지 작성 서버 페이지가 기존 `listAnnouncementDrafts()`를 호출하고, 별도 표시 컴포넌트가 최신순 초안 목록과 `?id=` 불러오기 링크를 작성 폼 위에 렌더링한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-chat`을 유지한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하며 인프라 파일은 변경하지 않는다.
- `status === "draft"`인 미발송 초안만 표시한다.
- 초안은 `updatedAt` 최신순으로 표시한다.
- 제목, 대상 라벨, 마지막 저장 시각, `불러오기` 링크를 표시한다.
- 빈 제목은 `제목 없는 공지`로 표시한다.
- 초안이 없으면 `임시 저장된 공지가 없습니다.`를 표시한다.
- 기존 `listAnnouncementDrafts()`, `getAnnouncementDraft(id)`, `prepareAnnouncementDraftForCompose()`와 `?id=` 수정 흐름을 재사용한다.
- API, 데이터베이스, 초안 삭제, 검색, 페이지네이션, 발송 완료 목록은 변경하지 않는다.
- 기존 미추적 사용자 문서는 수정하거나 스테이징하지 않는다.
- 관련 테스트와 web 빌드가 통과한 경우에만 현재 브랜치에 커밋하고 푸시한다.

---

### Task 1: 저장 초안 필터·정렬 상태 모델

**Files:**
- Create: `apps/web/src/app/manager/messaging/01/saved-drafts-state.ts`
- Test: `apps/web/src/app/manager/messaging/01/saved-drafts-state.spec.ts`

**Interfaces:**
- Consumes: `AnnouncementDraft[]`
- Produces: `selectSavedAnnouncementDrafts(drafts: AnnouncementDraft[]): AnnouncementDraft[]`, `savedAnnouncementDraftTitle(draft: Pick<AnnouncementDraft, "title">): string`

- [x] **Step 1: 필터·정렬·제목 폴백 실패 테스트를 작성한다**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnouncementDraft } from "@roomlog/types";
import {
  savedAnnouncementDraftTitle,
  selectSavedAnnouncementDrafts,
} from "./saved-drafts-state";

function draft(
  id: string,
  status: AnnouncementDraft["status"],
  updatedAt: string,
  title: string,
): AnnouncementDraft {
  return {
    id,
    category: "life",
    scope: "all",
    targetLabel: "전체 2세대",
    targetRoomIds: ["room-1", "room-2"],
    title,
    body: "본문",
    translations: [],
    confirmRequired: false,
    status,
    updatedAt,
  };
}

describe("manager saved announcement drafts", () => {
  it("keeps only unsent drafts and sorts the newest update first", () => {
    const drafts = [
      draft("old", "draft", "2026-07-14T01:00:00.000Z", "이전 초안"),
      draft("sent", "sent", "2026-07-16T03:00:00.000Z", "발송 완료"),
      draft("new", "draft", "2026-07-15T02:00:00.000Z", "최근 초안"),
    ];

    assert.deepEqual(
      selectSavedAnnouncementDrafts(drafts).map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(drafts.map((item) => item.id), ["old", "sent", "new"]);
  });

  it("uses a readable label for a draft without a title", () => {
    assert.equal(savedAnnouncementDraftTitle({ title: "   " }), "제목 없는 공지");
    assert.equal(savedAnnouncementDraftTitle({ title: "  생활 안내  " }), "생활 안내");
  });
});
```

- [x] **Step 2: 단위 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/01/saved-drafts-state.spec.ts
```

Expected: `saved-drafts-state` 모듈이 없어 테스트가 실패한다.

- [x] **Step 3: 최소 상태 모델을 구현한다**

```ts
import type { AnnouncementDraft } from "@roomlog/types";

export function selectSavedAnnouncementDrafts(
  drafts: AnnouncementDraft[],
): AnnouncementDraft[] {
  return drafts
    .filter((draft) => draft.status === "draft")
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
}

export function savedAnnouncementDraftTitle(
  draft: Pick<AnnouncementDraft, "title">,
): string {
  return draft.title.trim() || "제목 없는 공지";
}
```

- [x] **Step 4: 단위 테스트를 다시 실행해 GREEN을 확인한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/01/saved-drafts-state.spec.ts
```

Expected: 2 tests, 2 pass, 0 fail.

---

### Task 2: 공지 작성 상단 목록과 불러오기 연결

**Files:**
- Create: `apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftList.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/page.tsx`
- Modify: `apps/web/property-shell.spec.mjs`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `AnnouncementDraft[]`, `selectSavedAnnouncementDrafts()`, `savedAnnouncementDraftTitle()`, `MANAGER_MESSAGING_ROUTES["M-MSG-01"]`
- Produces: `SavedAnnouncementDraftList({ drafts }: { drafts: AnnouncementDraft[] }): React.JSX.Element`

- [x] **Step 1: 페이지 연결과 목록 표시 계약을 테스트에 추가한다**

`property-shell.spec.mjs`에 새 컴포넌트 소스를 안전하게 읽는 바인딩을 추가한다.

```js
const managerMessagingSavedDraftListPath = new URL(
  "./src/app/manager/messaging/01/SavedAnnouncementDraftList.tsx",
  import.meta.url,
);
const managerMessagingSavedDraftListSource = existsSync(managerMessagingSavedDraftListPath)
  ? readFileSync(managerMessagingSavedDraftListPath, "utf8")
  : "";
```

공지 작성 계약 테스트에 다음 단언을 추가한다.

```js
assert.equal(existsSync(managerMessagingSavedDraftListPath), true);
assert.match(managerMessagingComposeSource, /listAnnouncementDrafts/);
assert.match(managerMessagingComposeSource, /<SavedAnnouncementDraftList drafts=\{drafts\} \/>/);
assert.match(managerMessagingComposeSource, /<AnnouncementComposer\s+key=\{id \?\? "new"\}/);
assert.match(managerMessagingSavedDraftListSource, /임시 저장된 공지/);
assert.match(managerMessagingSavedDraftListSource, /임시 저장된 공지가 없습니다\./);
assert.match(managerMessagingSavedDraftListSource, /savedAnnouncementDraftTitle/);
assert.match(managerMessagingSavedDraftListSource, /formatDateTime\(draft\.updatedAt\)/);
assert.match(managerMessagingSavedDraftListSource, />\s*불러오기\s*<\/LinkButton>/);
assert.match(
  managerMessagingSavedDraftListSource,
  /MANAGER_MESSAGING_ROUTES\["M-MSG-01"\][\s\S]*encodeURIComponent\(draft\.id\)/,
);
```

- [x] **Step 2: 관련 계약 테스트를 실행해 RED를 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: `SavedAnnouncementDraftList.tsx`가 없어 1 test, 0 pass, 1 fail로 종료한다.

- [x] **Step 3: 저장 초안 목록 컴포넌트를 구현한다**

```tsx
import type { AnnouncementDraft } from "@roomlog/types";
import { Card } from "@roomlog/ui";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { LinkButton, formatDateTime } from "../_components";
import {
  savedAnnouncementDraftTitle,
  selectSavedAnnouncementDrafts,
} from "./saved-drafts-state";

export function SavedAnnouncementDraftList({
  drafts,
}: {
  drafts: AnnouncementDraft[];
}) {
  const savedDrafts = selectSavedAnnouncementDrafts(drafts);

  return (
    <Card
      style={{
        marginBottom: "var(--space-lg)",
        display: "grid",
        gap: "var(--space-md)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "var(--fs-subtitle)" }}>
        임시 저장된 공지
      </h2>

      {savedDrafts.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {savedDrafts.map((draft) => (
            <div
              key={draft.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: "var(--space-md)",
                padding: "var(--space-sm) 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>
                  {savedAnnouncementDraftTitle(draft)}
                </div>
                <div
                  style={{
                    marginTop: "var(--space-xs)",
                    color: "var(--on-surface-variant)",
                    fontSize: "var(--fs-caption)",
                  }}
                >
                  {draft.targetLabel} · 마지막 저장 {formatDateTime(draft.updatedAt)}
                </div>
              </div>
              <LinkButton
                href={`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(draft.id)}`}
                variant="secondary"
              >
                불러오기
              </LinkButton>
            </div>
          ))}
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
          }}
        >
          임시 저장된 공지가 없습니다.
        </p>
      )}
    </Card>
  );
}
```

- [x] **Step 4: 공지 작성 페이지에서 목록을 조회하고 폼 위에 렌더링한다**

`page.tsx`에서 `listAnnouncementDrafts`와 컴포넌트를 import하고 기존 병렬 조회에 초안 목록을 추가한다.

```tsx
import {
  DEMO_MANAGER_DRAFTS,
  getAnnouncementDraft,
  listAnnouncementDrafts,
} from "@/lib/messaging-manager-api";
import { SavedAnnouncementDraftList } from "./SavedAnnouncementDraftList";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ id }, user, drafts] = await Promise.all([
    searchParams,
    requireUser("LANDLORD"),
    listAnnouncementDrafts(),
  ]);
  const draft = id ? await getAnnouncementDraft(id) : DEMO_MANAGER_DRAFTS[0];
  const initialDraft = prepareAnnouncementDraftForCompose(draft, Boolean(id));

  return (
    <>
      <ScreenHeader eyebrow="M-MSG-01" title="공지 작성" />
      <SavedAnnouncementDraftList drafts={drafts} />
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

- [x] **Step 5: 계약 테스트를 다시 실행해 GREEN을 확인한다**

Run:

```bash
cd apps/web
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: 1 test, 1 pass, 0 fail.

- [x] **Step 6: 기능 관련 테스트를 함께 실행한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/01/saved-drafts-state.spec.ts
node --test --test-name-pattern="manager announcement compose edits targets and translates each language before review" property-shell.spec.mjs
```

Expected: 단위 테스트 2개와 계약 테스트 1개가 모두 통과한다.

- [x] **Step 7: web 프로덕션 빌드를 검증한다**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js web build가 exit 0으로 완료된다.

- [x] **Step 8: Docker와 실제 작성 화면을 검증한다**

Run:

```bash
docker compose up -d --build web
docker compose ps
```

브라우저에서 `/manager/messaging/01`을 확인한다.

- 작성 폼 위에 `임시 저장된 공지` 카드가 표시된다.
- 발송 완료 항목은 없고 초안이 최신 수정 순으로 표시된다.
- 각 초안에 제목, 대상, 마지막 저장 시각, `불러오기`가 표시된다.
- `불러오기`를 누르면 같은 화면의 `?id=<draftId>`로 이동하고 저장 내용을 폼에 표시한다.
- error overlay와 console error가 없다.

- [ ] **Step 9: 이번 작업 파일만 커밋하고 푸시한다**

Run:

```bash
git diff --check
git add \
  docs/superpowers/plans/2026-07-16-manager-announcement-saved-drafts-list.md \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/page.tsx \
  apps/web/src/app/manager/messaging/01/SavedAnnouncementDraftList.tsx \
  apps/web/src/app/manager/messaging/01/saved-drafts-state.ts \
  apps/web/src/app/manager/messaging/01/saved-drafts-state.spec.ts
git diff --cached --check
git commit -m "feat: show saved announcement drafts"
git push origin kms-manager-chat
```

Expected: 계획, 테스트, 상태 모델, 목록 컴포넌트, 작성 페이지 연결만 원격 `kms-manager-chat`에 반영된다.
