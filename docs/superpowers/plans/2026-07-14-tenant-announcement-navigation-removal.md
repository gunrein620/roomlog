# Tenant Announcement Navigation Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `홈 · 공지 · 고정비 · 내 정보` navigation from the tenant announcement list at every responsive breakpoint without changing the notice content or other tenant routes.

**Architecture:** Keep the change local to `AnnouncementListPage` and its CSS module. Lock the absence of the navigation DOM, navigation styles, and reserved mobile spacing with the existing source-contract test before deleting the implementation.

**Tech Stack:** Next.js 16 App Router, React, CSS Modules, Node test runner, TypeScript, Docker Compose

## Global Constraints

- Keep the announcement title, search, filters, list, and help panel unchanged.
- Remove both the desktop top navigation and mobile fixed bottom navigation.
- Do not change shared tenant shells or other tenant routes.
- Use only existing design tokens; do not add raw hex colors.
- Do not modify Docker, deployment, workflow, environment, or other infrastructure files.

---

### Task 1: Remove the announcement-list navigation

**Files:**
- Modify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`
- Modify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx`
- Modify: `apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css`

**Interfaces:**
- Consumes: `AnnouncementListPage` props and existing responsive CSS module classes.
- Produces: The same announcement-list page without `MAIN_NAV_ITEMS`, `aria-label="세입자 주요 메뉴"`, `bottomNav`, `navLink`, or `navLinkActive`.

- [x] **Step 1: Write the failing contract test**

Add these assertions inside `renders a responsive token-only list at /02` after the existing component assertions:

```ts
assert.doesNotMatch(
  component,
  /MAIN_NAV_ITEMS|aria-label="세입자 주요 메뉴"|styles\.bottomNav/,
);
assert.doesNotMatch(css, /\.(?:bottomNav|navLink|navLinkActive)\b/);
const contentRule = css.match(/\.content\s*\{[\s\S]*?\}/)?.[0] ?? "";
assert.doesNotMatch(contentRule, /touch-target/);
```

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: FAIL in `renders a responsive token-only list at /02` because `MAIN_NAV_ITEMS`, navigation CSS classes, and `touch-target` spacing still exist.

- [x] **Step 3: Remove the navigation implementation**

In `AnnouncementListPage.tsx`:

- Remove the `UserRound` and `WalletCards` imports.
- Remove the `MAIN_NAV_ITEMS` constant.
- Remove the `<nav className={styles.bottomNav} aria-label="세입자 주요 메뉴">...</nav>` block.

In `AnnouncementListPage.module.css`:

- Remove `.navLink:focus-visible` from the shared focus selector.
- Replace the mobile content padding with:

```css
.content {
  width: 100%;
  padding: var(--space-lg) var(--space-lg) var(--space-xl);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
```

- Delete the complete `.bottomNav`, `.navLink`, `.navLink:hover`, and `.navLinkActive` rule blocks.
- Delete the `.bottomNav` and `.navLink` overrides inside `@media (min-width: 768px)`.

- [x] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/tenant/messaging/02/announcement-page-contract.spec.ts
```

Expected: 4 tests pass, 0 fail.

- [x] **Step 5: Run the complete web verification**

Run:

```bash
pnpm test:web
```

Expected: web contract and unit suites complete with 0 failures. If an unrelated pre-existing failure appears, record the exact failing test and continue only after confirming the focused announcement test remains green.

Verification record (2026-07-14): the focused announcement contract is green at 4/4. The full web suite retains one unrelated baseline failure, `manager workspace uses canonical tokens without manager-local collisions`, against `apps/web/src/app/manager/globals.css`; no manager files are changed by this slice.

- [x] **Step 6: Rebuild Docker and verify the responsive page**

Run:

```bash
docker compose up -d --build web
docker compose ps web api postgres
curl -fsS http://localhost:4000/api/health
```

Verify `http://localhost:3000/tenant/messaging/02?id=mann_7b7c0d2087` after tenant login at desktop and mobile viewport widths. Confirm that the main navigation is absent, while `공지사항`, search, filters, notice cards, and help panel remain visible with no runtime error overlay.

- [x] **Step 7: Commit and push the tested slice**

```bash
git add \
  docs/superpowers/plans/2026-07-14-tenant-announcement-navigation-removal.md \
  apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts \
  apps/web/src/app/tenant/messaging/02/AnnouncementListPage.tsx \
  apps/web/src/app/tenant/messaging/02/AnnouncementListPage.module.css
git diff --cached --check
git commit -m "fix(messaging): remove tenant notice navigation"
git push origin kms-venant-notice
```

Expected: commit succeeds and the remote branch advances to the new commit.
