# Tenant Announcement Back Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tenant announcement-list back button navigate directly to `/living`.

**Architecture:** Keep the change local to the existing Next.js `Link` in `AnnouncementListPage`. Extend the source-contract test to lock the new `href` while explicitly preserving the current accessibility label.

**Tech Stack:** Next.js 16 App Router, React, Node test runner, TypeScript, Docker Compose

## Global Constraints

- Change only the announcement-list back-link route from `/tenant/home/00` to `/living`.
- Keep `aria-label="세입자 홈으로 돌아가기"` unchanged.
- Do not change the icon, styles, other tenant routes, or infrastructure files.

---

### Task 1: Route the announcement-list back button to living

**Files:**
- Create: `docs/superpowers/plans/2026-07-14-tenant-announcement-back-link.md`
- Modify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`
- Modify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx`

**Interfaces:**
- Consumes: the existing `Link` rendered with `styles.backLink`.
- Produces: `href="/living"` with the existing `aria-label="세입자 홈으로 돌아가기"`.

- [x] **Step 1: Write the failing contract assertion**

Add these assertions inside `renders a responsive token-only list at /02`:

```ts
assert.match(
  component,
  /<Link href="\/living" className=\{styles\.backLink\} aria-label="세입자 홈으로 돌아가기">/,
);
assert.doesNotMatch(
  component,
  /<Link href="\/tenant\/home\/00" className=\{styles\.backLink\}/,
);
```

- [x] **Step 2: Run the focused test and confirm RED**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: the list-rendering contract fails because the back link still uses `/tenant/home/00`.

- [x] **Step 3: Change only the route**

Replace the existing link opening tag in `AnnouncementListPage.tsx` with:

```tsx
<Link href="/living" className={styles.backLink} aria-label="세입자 홈으로 돌아가기">
```

- [x] **Step 4: Run the focused test and confirm GREEN**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: 4 tests pass, 0 fail.

- [x] **Step 5: Run web verification**

```bash
pnpm test:web
```

Expected: the announcement contracts pass. Record the existing unrelated manager CSS token-contract failure if it remains unchanged.

Verification record (2026-07-14): the focused announcement contract passes 4/4. The full web suite passes 351/352 and retains the unrelated baseline failure `manager workspace uses canonical tokens without manager-local collisions` against `apps/web/src/app/manager/globals.css`.

- [x] **Step 6: Rebuild Docker and verify the click flow**

```bash
docker compose up -d --build web
docker compose ps web api postgres
curl -fsS http://localhost:4000/api/health
```

After tenant login, open `http://localhost:3000/tenant/messaging/02?id=mann_7b7c0d2087`, click the back button, and verify the resulting URL is `http://localhost:3000/living` with no runtime error overlay.

- [x] **Step 7: Commit and push the tested slice**

```bash
git add \
  docs/superpowers/plans/2026-07-14-tenant-announcement-back-link.md \
  apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts \
  apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx
git diff --cached --check
git commit -m "fix(messaging): route notice back link to living"
git push origin kms-venant-notice
```

Expected: the commit succeeds and `origin/kms-venant-notice` advances to the new commit.
