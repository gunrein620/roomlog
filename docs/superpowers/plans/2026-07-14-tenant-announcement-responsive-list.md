# Tenant Announcement Responsive List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/tenant/messaging/02` with a token-based responsive tenant announcement list and preserve the current announcement actions at `/tenant/messaging/02/[id]`.

**Architecture:** Keep the messaging layout responsible only for tenant authentication, preserve the fixed phone shell explicitly on the legacy inbox/thread/error pages, and give the announcement list/detail their own responsive shell. Put query normalization, filtering, sorting, and URL generation in a pure model so the visible page can remain a server component backed by the existing `listAnnouncements()` demo fallback.

**Tech Stack:** Next.js 16 App Router, React 19 server components and server actions, TypeScript 5.9, CSS Modules, `lucide-react`, Node test runner, `@roomlog/types`, `@roomlog/ui` tokens.

## Global Constraints

- Work only on `kms-venant-notice` and read `.local-agents/local-infra-guard.prompt.md` before implementation.
- Do not change Docker, workflows, AWS, environment, deployment, database, or API files.
- Use only `var(--...)` values from `packages/ui/src/tokens.css`; add no raw hex colors.
- `/tenant/messaging/02?id=<legacyId>` must render the list and ignore `id`.
- Announcement detail must live at `/tenant/messaging/02/[id]` and retain read, confirm, original text, and inquiry actions.
- Run a targeted RED test before production changes, then targeted GREEN and broader web verification.
- Commit and push each passing feature slice to `origin/kms-venant-notice`.

---

## File Structure

- `apps/web/src/app/tenant/messaging/layout.tsx`: tenant authentication only.
- `apps/web/src/app/tenant/messaging/MessagingPhoneFrame.tsx`: preserves the existing phone shell for `/00`, `/01`, and `/e0`.
- `apps/web/src/app/tenant/messaging/02/announcement-list-model.ts`: pure search/filter/sort/link behavior.
- `apps/web/src/app/tenant/messaging/02/announcement-list-model.spec.ts`: behavior tests for the model.
- `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx`: responsive list UI.
- `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css`: responsive token-only styling.
- `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`: source contract for the responsive list, detail route, and preserved phone screens.
- `apps/web/src/app/tenant/messaging/02/page.tsx`: list data loader and query adapter.
- `apps/web/src/app/tenant/messaging/02/[id]/page.tsx`: migrated current detail and server actions.
- `apps/web/src/app/tenant/messaging/02/[id]/AnnouncementDetailPage.module.css`: token-only responsive detail container.
- `apps/web/src/app/tenant/messaging/00/page.tsx`: route announcement rows to the new detail URL.
- `apps/web/src/app/my/flows/TenantMyPage.tsx`: route the latest announcement card to the new detail URL.

### Task 1: Announcement list model

**Files:**
- Create: `apps/web/src/app/tenant/messaging/02/announcement-list-model.spec.ts`
- Create: `apps/web/src/app/tenant/messaging/02/announcement-list-model.ts`

**Interfaces:**
- Consumes: `Announcement` from `@roomlog/types`.
- Produces: `AnnouncementFilter`, `normalizeAnnouncementFilter(value)`, `selectAnnouncements(items, options)`, `tenantAnnouncementListHref(filter, query)`, and `tenantAnnouncementDetailHref(id)`.

- [ ] **Step 1: Write the failing model test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Announcement } from "@roomlog/types";
import {
  normalizeAnnouncementFilter,
  selectAnnouncements,
  tenantAnnouncementDetailHref,
  tenantAnnouncementListHref,
} from "./announcement-list-model";

const notice = (overrides: Partial<Announcement>): Announcement => ({
  id: "notice",
  category: "life",
  scope: "all",
  title: "옥상 정원 이용 안내",
  body: "이용 시간이 변경됩니다.",
  sender: "관리사무소",
  sentAt: "2026-07-10T09:00:00+09:00",
  confirmRequired: false,
  state: "read",
  ...overrides,
});

describe("tenant announcement list model", () => {
  it("normalizes unsupported filters to all", () => {
    assert.equal(normalizeAnnouncementFilter("maintenance"), "all");
    assert.equal(normalizeAnnouncementFilter("urgent"), "urgent");
  });

  it("sorts urgent notices first and then by newest sent time without mutation", () => {
    const input = [
      notice({ id: "life", sentAt: "2026-07-14T09:00:00+09:00" }),
      notice({ id: "older-urgent", category: "urgent", sentAt: "2026-07-12T09:00:00+09:00" }),
      notice({ id: "newer-urgent", category: "urgent", sentAt: "2026-07-13T09:00:00+09:00" }),
    ];
    assert.deepEqual(selectAnnouncements(input, { filter: "all", query: "" }).map(({ id }) => id), [
      "newer-urgent",
      "older-urgent",
      "life",
    ]);
    assert.deepEqual(input.map(({ id }) => id), ["life", "older-urgent", "newer-urgent"]);
  });

  it("filters building scope and searches title body and sender", () => {
    const input = [
      notice({ id: "building", scope: "building", sender: "우주팀" }),
      notice({ id: "unit", scope: "unit", title: "개별 호실 안내" }),
    ];
    assert.deepEqual(selectAnnouncements(input, { filter: "building", query: "우주" }).map(({ id }) => id), ["building"]);
    assert.deepEqual(selectAnnouncements(input, { filter: "all", query: "호실" }).map(({ id }) => id), ["unit"]);
  });

  it("builds encoded list and detail URLs", () => {
    assert.equal(tenantAnnouncementDetailHref("ann / 1"), "/tenant/messaging/02/ann%20%2F%201");
    assert.equal(tenantAnnouncementListHref("life", "옥상 정원"), "/tenant/messaging/02?filter=life&q=%EC%98%A5%EC%83%81+%EC%A0%95%EC%9B%90");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-list-model.spec.ts
```

Expected: FAIL because `announcement-list-model.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

```ts
import type { Announcement } from "@roomlog/types";

export const ANNOUNCEMENT_FILTERS = ["all", "urgent", "building", "life", "event"] as const;
export type AnnouncementFilter = (typeof ANNOUNCEMENT_FILTERS)[number];

export function normalizeAnnouncementFilter(value: string | undefined): AnnouncementFilter {
  return ANNOUNCEMENT_FILTERS.includes(value as AnnouncementFilter)
    ? (value as AnnouncementFilter)
    : "all";
}

function matchesFilter(item: Announcement, filter: AnnouncementFilter): boolean {
  if (filter === "all") return true;
  if (filter === "building") return item.scope === "building";
  return item.category === filter;
}

export function selectAnnouncements(
  items: readonly Announcement[],
  options: { filter: AnnouncementFilter; query: string },
): Announcement[] {
  const query = options.query.trim().toLocaleLowerCase("ko-KR");
  return items
    .filter((item) => matchesFilter(item, options.filter))
    .filter((item) => !query || [item.title, item.body, item.sender].some((value) => value.toLocaleLowerCase("ko-KR").includes(query)))
    .sort((a, b) => {
      const urgentOrder = Number(b.category === "urgent") - Number(a.category === "urgent");
      return urgentOrder || b.sentAt.localeCompare(a.sentAt);
    });
}

export function tenantAnnouncementDetailHref(id: string): string {
  return `/tenant/messaging/02/${encodeURIComponent(id)}`;
}

export function tenantAnnouncementListHref(filter: AnnouncementFilter, query: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.toString();
  return `/tenant/messaging/02${suffix ? `?${suffix}` : ""}`;
}
```

- [ ] **Step 4: Run targeted GREEN and full web unit tests**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-list-model.spec.ts
pnpm --filter web test:unit
```

Expected: targeted test PASS; the existing web unit suite PASS.

- [ ] **Step 5: Commit and push the passing model slice**

```bash
git add apps/web/src/app/tenant/messaging/02/announcement-list-model.ts apps/web/src/app/tenant/messaging/02/announcement-list-model.spec.ts
git commit -m "feat(messaging): add tenant notice list model"
git push origin kms-venant-notice
git rev-list --left-right --count origin/kms-venant-notice...kms-venant-notice
```

Expected sync output: `0 0`.

### Task 2: Responsive route boundary and preserved detail

**Files:**
- Create: `apps/web/src/app/tenant/messaging/MessagingPhoneFrame.tsx`
- Create: `apps/web/src/app/tenant/messaging/02/[id]/page.tsx`
- Create: `apps/web/src/app/tenant/messaging/02/[id]/AnnouncementDetailPage.module.css`
- Create: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`
- Modify: `apps/web/src/app/tenant/messaging/layout.tsx`
- Modify: `apps/web/src/app/tenant/messaging/00/page.tsx`
- Modify: `apps/web/src/app/tenant/messaging/01/page.tsx`
- Modify: `apps/web/src/app/tenant/messaging/e0/page.tsx`

**Interfaces:**
- Consumes: current `/02/page.tsx` detail source and `PhoneFrame` from `@roomlog/ui`.
- Produces: `MessagingPhoneFrame({ children })` and a dynamic detail route whose server actions redirect back through `tenantAnnouncementDetailHref()`.

- [ ] **Step 1: Write a failing route/shell contract test**

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = __dirname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("tenant announcement route boundary", () => {
  it("keeps auth in the shared layout and moves PhoneFrame to legacy screens", () => {
    assert.doesNotMatch(read("../layout.tsx"), /PhoneFrame/);
    for (const path of ["../00/page.tsx", "../01/page.tsx", "../e0/page.tsx"]) {
      assert.match(read(path), /MessagingPhoneFrame/);
    }
  });

  it("preserves announcement actions in a dynamic detail route", () => {
    assert.equal(existsSync(join(root, "[id]/page.tsx")), true);
    const detail = read("[id]/page.tsx");
    assert.match(detail, /confirmAnnouncement/);
    assert.match(detail, /markAnnouncementRead/);
    assert.match(detail, /createTenantThread/);
    assert.match(detail, /params/);
    const css = read("[id]/AnnouncementDetailPage.module.css");
    assert.match(css, /@media \(min-width: 768px\)/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: FAIL because the detail route and explicit phone wrapper do not exist.

- [ ] **Step 3: Extract the legacy phone shell and narrow the layout**

Create the wrapper:

```tsx
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

export function MessagingPhoneFrame({ children }: { children: ReactNode }) {
  return <PhoneFrame label={<span>사는 집 · 메시지</span>}>{children}</PhoneFrame>;
}
```

Change `layout.tsx` to:

```tsx
import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MessagingLayout({ children }: { children: ReactNode }) {
  await requireUser("TENANT");
  return children;
}
```

Import `MessagingPhoneFrame` into `/00`, `/01`, and `/e0`. In each page, replace the return fragment delimiters exactly:

```tsx
return (
  <MessagingPhoneFrame>
```

and:

```tsx
  </MessagingPhoneFrame>
);
```

- [ ] **Step 4: Move the current detail implementation to `[id]`**

Copy the current detail source into `[id]/page.tsx`, replace `searchParams` with `params: Promise<{ id: string }>`, and use:

```ts
const { id } = await params;
announcement = await getAnnouncement(id);
```

Replace list/detail redirects with:

```ts
redirect(tenantAnnouncementDetailHref(announcementId || DEMO_ANNOUNCEMENT_ID));
```

and replace the back link with:

```tsx
<Link href="/tenant/messaging/02" aria-label="공지 목록으로">←</Link>
```

Replace the detail page's opening `return (<>` with:

```tsx
return (
  <div className={styles.viewport}>
    <main className={styles.detailShell}>
```

Replace its final `</>);` with:

```tsx
    </main>
  </div>
);
```

Create `AnnouncementDetailPage.module.css` with:

```css
.viewport {
  min-height: 100dvh;
  background: var(--surface);
  color: var(--on-surface);
  font-family: var(--font-sans);
}

.detailShell {
  min-height: 100dvh;
  background: var(--surface-container-lowest);
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .viewport { padding: var(--space-xxl); }
  .detailShell {
    max-width: var(--content-readable-max);
    min-height: calc(100dvh - (var(--space-xxl) * 2));
    margin: 0 auto;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-soft);
    overflow: hidden;
  }
}
```

- [ ] **Step 5: Run targeted GREEN and build**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
pnpm --filter web build
```

Expected: contract PASS and Next build PASS while `/02/page.tsx` still temporarily contains the old detail.

- [ ] **Step 6: Commit and push the route-boundary slice**

```bash
git add apps/web/src/app/tenant/messaging/layout.tsx apps/web/src/app/tenant/messaging/MessagingPhoneFrame.tsx apps/web/src/app/tenant/messaging/00/page.tsx apps/web/src/app/tenant/messaging/01/page.tsx apps/web/src/app/tenant/messaging/e0/page.tsx apps/web/src/app/tenant/messaging/02/[id]/page.tsx apps/web/src/app/tenant/messaging/02/[id]/AnnouncementDetailPage.module.css apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts
git commit -m "refactor(messaging): split tenant notice list and detail routes"
git push origin kms-venant-notice
git rev-list --left-right --count origin/kms-venant-notice...kms-venant-notice
```

Expected sync output: `0 0`.

### Task 3: Responsive announcement list UI

**Files:**
- Create: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx`
- Create: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css`
- Modify: `apps/web/src/app/tenant/messaging/02/page.tsx`
- Modify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`

**Interfaces:**
- Consumes: `Announcement[]`, `AnnouncementFilter`, `selectAnnouncements()`, list/detail href helpers.
- Produces: `AnnouncementListPage({ announcements, filter, query })` with header, GET search, chips, card grid, empty state, help banner, and responsive navigation.

- [ ] **Step 1: Extend the contract test for the visible list**

Add assertions that require:

```ts
it("renders a responsive token-only list at /02", () => {
  const page = read("page.tsx");
  const component = read("AnnouncementListPage.tsx");
  const css = read("AnnouncementListPage.module.css");
  assert.match(page, /listAnnouncements/);
  assert.match(page, /AnnouncementListPage/);
  assert.doesNotMatch(page, /getAnnouncement/);
  assert.match(component, /공지사항/);
  assert.match(component, /도움이 필요하신가요/);
  assert.match(component, /tenantAnnouncementDetailHref/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run the direct contract command from Task 2.

Expected: FAIL because `AnnouncementListPage.tsx` and its CSS module do not exist.

- [ ] **Step 3: Replace `/02/page.tsx` with the list data adapter**

```tsx
import { listAnnouncements } from "@/lib/messaging-api";
import { AnnouncementListPage } from "./AnnouncementListPage";
import { normalizeAnnouncementFilter } from "./announcement-list-model";

export const dynamic = "force-dynamic";
type SearchParams = Promise<{ filter?: string; q?: string; id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ filter, q }, announcements] = await Promise.all([searchParams, listAnnouncements()]);
  return (
    <AnnouncementListPage
      announcements={announcements}
      filter={normalizeAnnouncementFilter(filter)}
      query={q ?? ""}
    />
  );
}
```

The destructuring intentionally excludes `id`, so legacy `?id=` links still show the list.

- [ ] **Step 4: Implement `AnnouncementListPage.tsx`**

Use `lucide-react` icons and these exact behavior blocks:

```tsx
const FILTER_LABELS: Record<AnnouncementFilter, string> = {
  all: "전체",
  urgent: "긴급",
  building: "건물",
  life: "생활",
  event: "행사",
};

const visible = selectAnnouncements(announcements, { filter, query });
```

Render a GET form with `name="q"`, a hidden `name="filter"` when the filter is not `all`, filter links generated by `tenantAnnouncementListHref`, and card links generated by `tenantAnnouncementDetailHref`. Put the mobile form inside `<details open={Boolean(query)}>` with a search-icon `<summary aria-label="공지 검색 열기">`; show the same form persistently at desktop width through CSS. Use semantic `<header>`, `<nav aria-label="공지 필터">`, `<section aria-label="공지사항 목록">`, `<article>`, and a second `<nav aria-label="세입자 주요 메뉴">` linked to `/tenant/home/00`, `/tenant/messaging/02`, `/tenant/payment/00`, and `/my`.

Render an empty state only when `visible.length === 0`, with a reset link to `/tenant/messaging/02`. The help banner must link to `/tenant/messaging/00`.

- [ ] **Step 5: Implement responsive token-only CSS**

The CSS module must define mobile-first `.viewport`, `.shell`, `.header`, `.filters`, `.grid`, `.card`, `.help`, and `.bottomNav` rules using only `var(--surface*)`, `var(--on-surface*)`, `var(--primary*)`, spacing, radius, shadow, and sizing tokens. Add:

```css
@media (min-width: 768px) {
  .shell { max-width: 1180px; margin: var(--space-xxl) auto; }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bottomNav { position: static; order: -1; }
}

@media (prefers-reduced-motion: reduce) {
  .card, .filterChip, .helpLink { transition: none; }
}
```

Use line clamping on card body text, `min-height: 100dvh` on the viewport, `overflow-x: auto` on mobile filters, a sticky mobile header, and bottom padding that prevents the fixed navigation from covering content.

- [ ] **Step 6: Run targeted GREEN, web tests, and build**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-list-model.spec.ts src/app/tenant/messaging/02/announcement-page-contract.spec.ts
pnpm test:web
pnpm --filter web build
```

Expected: all commands PASS.

- [ ] **Step 7: Commit and push the responsive list slice**

```bash
git add apps/web/src/app/tenant/messaging/02/page.tsx apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts
git commit -m "feat(messaging): add responsive tenant notice list"
git push origin kms-venant-notice
git rev-list --left-right --count origin/kms-venant-notice...kms-venant-notice
```

Expected sync output: `0 0`.

### Task 4: Update all tenant announcement entry links

**Files:**
- Modify: `apps/web/src/app/tenant/messaging/00/page.tsx`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`

**Interfaces:**
- Consumes: `tenantAnnouncementDetailHref(id)`.
- Produces: every existing tenant announcement card opens `/tenant/messaging/02/[id]`; `/02?id=` remains only a backward-compatible list URL.

- [ ] **Step 1: Add failing source-contract assertions**

```ts
it("routes existing tenant notice entry points to the dynamic detail helper", () => {
  assert.match(read("../00/page.tsx"), /tenantAnnouncementDetailHref\(announcement\.id\)/);
  assert.match(read("../../../my/flows/TenantMyPage.tsx"), /tenantAnnouncementDetailHref\(announcementState\.announcement\.id\)/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run the direct contract command from Task 2.

Expected: FAIL because both sources still create `/02?id=` links.

- [ ] **Step 3: Replace old query-string links**

Import the helper from `@/app/tenant/messaging/02/announcement-list-model` in both files and replace:

```tsx
`${MESSAGING_ROUTES["T-MSG-02"]}?id=${announcement.id}`
```

with:

```tsx
tenantAnnouncementDetailHref(announcement.id)
```

and replace the `TenantMyPage` encoded template string with:

```tsx
tenantAnnouncementDetailHref(announcementState.announcement.id)
```

- [ ] **Step 4: Run targeted GREEN and all web tests**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
pnpm test:web
```

Expected: PASS.

- [ ] **Step 5: Commit and push the link-integration slice**

```bash
git add apps/web/src/app/tenant/messaging/00/page.tsx apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts
git commit -m "fix(messaging): route tenant notices to detail pages"
git push origin kms-venant-notice
git rev-list --left-right --count origin/kms-venant-notice...kms-venant-notice
```

Expected sync output: `0 0`.

### Task 5: Full verification and responsive browser evidence

**Files:**
- Verify only; do not modify infrastructure files.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: test logs, Docker health evidence, mobile/desktop screenshots or observed states, and final branch sync evidence.

- [ ] **Step 1: Run repository verification**

```bash
bash scripts/verify.sh
```

Expected: exit code `0`.

- [ ] **Step 2: Rebuild only the existing web service**

```bash
docker compose up -d --build web
docker compose ps
curl -fsS http://localhost:4000/api/health
```

Expected: existing services healthy and API health request succeeds. If Docker is unavailable, report the daemon limitation without editing tracked compose files.

- [ ] **Step 3: Verify the requested legacy URL at two viewport sizes**

Open:

```text
http://localhost:3000/tenant/messaging/02?id=mann_7b7c0d2087
```

Check at 390×844 and 1440×1000 that the result is the announcement list, the filter row does not overflow the page, card content is readable, the mobile bottom navigation does not cover the help banner, and desktop cards form two columns.

- [ ] **Step 4: Verify a card opens the preserved detail route**

Select one announcement and confirm the URL matches `/tenant/messaging/02/<encoded-id>`, then confirm the read/confirm and inquiry actions remain visible.

- [ ] **Step 5: Confirm clean scoped diff and remote sync**

```bash
git status --short --branch
git diff origin/kms-venant-notice...HEAD --check
git rev-list --left-right --count origin/kms-venant-notice...kms-venant-notice
```

Expected: only pre-existing unrelated untracked documents remain and sync output is `0 0`.
