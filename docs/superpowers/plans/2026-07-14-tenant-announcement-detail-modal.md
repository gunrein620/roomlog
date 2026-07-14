# Tenant Announcement Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open each tenant announcement in an accessible, responsive modal on the list page without changing the list URL.

**Architecture:** Convert the announcement list surface to a client component that owns the selected announcement and trigger focus. Add a focused native-dialog component that renders the existing announcement projection, calls the authenticated tenant BFF for read/confirm and inquiry actions, and returns updated announcement state to the list.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, CSS Modules, Node.js test runner, Docker Compose

## Global Constraints

- Work on `kms-venant-notice` and preserve unrelated untracked documents.
- Follow `.local-agents/local-infra-guard.prompt.md`; do not modify tracked infrastructure.
- Use CSS variables from the shared token system and add no raw hex values.
- Keep `/tenant/messaging/02/[id]` available for direct access compatibility.
- Keep the modal URL at `/tenant/messaging/02`.

---

### Task 1: Lock the modal contract

**Files:**
- Modify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`
- Create: `apps/web/src/app/tenant/messaging/02/AnnouncementDetailDialog.tsx`
- Test: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`

**Interfaces:**
- Consumes: `AnnouncementListPage.tsx` and `AnnouncementListPage.module.css` source text.
- Produces: a source contract requiring a client list, button card trigger, native dialog, authenticated mutations, close semantics, focus restoration, and responsive token-only styles.

- [ ] **Step 1: Write the failing contract**

Require the list to contain `"use client"`, `useState`, `AnnouncementDetailDialog`, `type="button"`, and no `tenantAnnouncementDetailHref`. Require the dialog source to contain `<dialog`, `showModal()`, `onCancel`, `/api/tenant/messaging/announcements/`, `/api/tenant/messaging/threads`, and the visible labels `상세 내용`, `확인`, `읽음`, `이 공지 문의`. Require CSS selectors for `.announcementDialog`, its backdrop, responsive media rule, and no raw colors.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: FAIL because the list still links to the dynamic detail route and the dialog component does not exist.

### Task 2: Implement the list-owned modal

**Files:**
- Modify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx`
- Create: `apps/web/src/app/tenant/messaging/02/AnnouncementDetailDialog.tsx`
- Modify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css`
- Test: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`

**Interfaces:**
- `AnnouncementDetailDialog` consumes `announcement: Announcement | null`, `onClose: () => void`, and `onAnnouncementChange: (announcement: Announcement) => void`.
- The list replaces the matching announcement by `id` after a successful read/confirm response.
- Inquiry creation returns a `Thread` and navigates to `/tenant/messaging/01?id=<encoded id>`.

- [ ] **Step 1: Convert the card link to a modal trigger**

Add client state for the announcement collection and selected announcement id. Store the clicked button in a ref, open the selected announcement in `AnnouncementDetailDialog`, update the matching row after mutations, and restore focus with `requestAnimationFrame` when the modal closes.

- [ ] **Step 2: Implement the native dialog**

Use `useEffect` and `dialog.showModal()` when an announcement is selected. Close on the explicit close button, Escape via `onCancel`, and backdrop clicks where `event.target === event.currentTarget`. Render category/scope badges, title, sender, timestamp, full pre-wrapped body, optional original body, urgent guidance, mutation error, and action buttons.

- [ ] **Step 3: Implement authenticated actions**

For read/confirm, POST to:

```ts
`/api/tenant/messaging/announcements/${encodeURIComponent(announcement.id)}/${announcement.confirmRequired ? "confirm" : "read"}`
```

Parse the returned `Announcement`, call `onAnnouncementChange`, and keep the modal open. For inquiry, POST the existing announcement context payload to `/api/tenant/messaging/threads`, parse `Thread`, and navigate to the encoded thread route. Disable actions while a request is in progress and show the API message or a Korean fallback on failure.

- [ ] **Step 4: Add responsive token-only styles**

Add a centered dialog with a backdrop, constrained width and height, scrollable body, fixed header/actions, focus rings, and a mobile media rule that reduces outer margins and lets the dialog occupy most of the viewport. Reset the card button’s native border/background/font while preserving the existing full-card layout.

- [ ] **Step 5: Run the focused test and verify GREEN**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: all tenant announcement route-boundary tests pass.

### Task 3: Verify and publish

**Files:**
- Verify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx`
- Verify: `apps/web/src/app/tenant/messaging/02/AnnouncementDetailDialog.tsx`
- Verify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css`
- Verify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`
- Verify: `docs/superpowers/plans/2026-07-14-tenant-announcement-detail-modal.md`

**Interfaces:**
- Produces fresh focused-test, build, browser, commit, and push evidence.

- [ ] **Step 1: Run web tests**

```bash
pnpm test:web
```

Expected: the announcement contracts pass. If the known unrelated manager token collision fails, verify it is unchanged and report it.

- [ ] **Step 2: Rebuild the Docker web service**

```bash
docker compose up -d --build web
docker compose ps web
```

Expected: the production web build succeeds and port `3000` is published.

- [ ] **Step 3: Verify in a browser**

At desktop and mobile viewport widths, open `/tenant/messaging/02`, click multiple announcement cards, verify the URL stays unchanged and the matching full body appears, verify close button/Escape/backdrop and focus restoration, and exercise read/confirm. Confirm there is no error overlay or browser error.

- [ ] **Step 4: Commit and push only scoped files**

```bash
git diff --check
git add -- apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx apps/web/src/app/tenant/messaging/02/AnnouncementDetailDialog.tsx apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts docs/superpowers/plans/2026-07-14-tenant-announcement-detail-modal.md
git commit -m "feat(messaging): open tenant notices in detail modal"
git push origin kms-venant-notice
```

Expected: local and remote branch counts are `0 0`; unrelated untracked documents remain unstaged.
