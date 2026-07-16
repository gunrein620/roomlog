# Living Announcement Card Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the entire ready-state landlord announcement card on `/living` navigate to `/tenant/messaging/02` while preserving the existing responsive design and non-clickable status states.

**Architecture:** Keep `tenant-announcement-card` as the visual shell. Render a full-area Next.js `Link` only when announcement data is ready, and let a dedicated CSS class reproduce the card grid and padding across breakpoints. Lock the route, DOM structure, focus treatment, and removal of the detail-route helper with the existing source-contract test.

**Tech Stack:** Next.js 16 App Router, React, CSS, Node.js test runner, Docker Compose

## Global Constraints

- Work on branch `kms-venant-notice`.
- Read `.local-agents/local-infra-guard.prompt.md` before implementation.
- Do not modify tracked infrastructure files.
- Use only existing CSS variables and `color-mix`; do not add raw hex values.
- Keep loading, empty, and error announcement states non-clickable.
- Rebuild and run the web service through Docker Compose after source validation.

---

### Task 1: Lock the full-card list-route contract

**Files:**
- Modify: `apps/web/property-shell.spec.mjs:1010`
- Modify: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts:80`
- Test: `apps/web/property-shell.spec.mjs`
- Test: `apps/web/src/app/tenant/messaging/02/announcement-page-contract.spec.ts`

**Interfaces:**
- Consumes: the source text of `TenantMyPage.tsx` and `globals.css` already loaded by the property-shell test.
- Produces: assertions requiring `href="/tenant/messaging/02"`, `tenant-announcement-link`, focus-visible CSS, and no `tenantAnnouncementDetailHref` reference.

- [ ] **Step 1: Write the failing contract test**

Replace the existing detail-link assertion with:

```js
  assert.match(
    pageSource,
    /<Link[\s\S]*?href="\/tenant\/messaging\/02"[\s\S]*?className="tenant-announcement-link"/,
  );
  assert.doesNotMatch(pageSource, /tenantAnnouncementDetailHref/);
  assert.match(cssSource, /\.tenant-announcement-link\s*\{/);
  assert.match(cssSource, /\.tenant-announcement-link:focus-visible\s*\{/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter web exec node --test --test-name-pattern="gives tenants a real resident dashboard" property-shell.spec.mjs
```

Expected: FAIL because the ready card still uses `tenantAnnouncementDetailHref(...)` and the new class does not exist.

- [ ] **Step 3: Update the existing route-boundary contract after it demonstrates the old behavior conflict**

Keep the `/tenant/messaging/00` entry on the dynamic detail helper, but require the `/living` card to use the list route:

```ts
  it("keeps the legacy notice entry on detail and routes the living card to the list", () => {
    assert.match(read("../00/page.tsx"), /tenantAnnouncementDetailHref\(announcement\.id\)/);
    const livingPage = read("../../../my/flows/TenantMyPage.tsx");
    assert.match(livingPage, /<Link href="\/tenant\/messaging\/02" className="tenant-announcement-link">/);
    assert.doesNotMatch(livingPage, /tenantAnnouncementDetailHref/);
  });
```

### Task 2: Implement the ready-state full-card link

**Files:**
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx:11`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx:940`
- Modify: `apps/web/src/app/globals.css:6947`
- Modify: `apps/web/src/app/globals.css:12169`
- Modify: `apps/web/src/app/globals.css:12226`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `announcementState.status === "ready"` and `announcementState.announcement` fields.
- Produces: a `Link` with `href="/tenant/messaging/02"` and class `tenant-announcement-link`; status states retain the existing icon, status text, and watermark without a link.

- [ ] **Step 1: Remove the detail-route helper and render the ready card as one link**

Use this ready-state structure:

```tsx
{announcementState.status === "ready" ? (
  <Link href="/tenant/messaging/02" className="tenant-announcement-link">
    <div className="tenant-card-icon" aria-hidden="true">
      <Megaphone size={28} strokeWidth={2.5} />
    </div>
    <div>
      <span>집주인 공지사항</span>
      <h3>{announcementState.announcement.title}</h3>
      <p>{announcementState.announcement.body}</p>
      <small>
        {announcementState.announcement.sender} · {tenancyDateLabel(announcementState.announcement.sentAt)}
      </small>
    </div>
    <Megaphone className="tenant-announcement-watermark" size={128} strokeWidth={2.1} aria-hidden="true" />
  </Link>
) : (
  <>
    <div className="tenant-card-icon" aria-hidden="true">
      <Megaphone size={28} strokeWidth={2.5} />
    </div>
    <div>
      <h3>집주인 공지사항</h3>
      <p>{announcementStatusMessage}</p>
    </div>
    <Megaphone className="tenant-announcement-watermark" size={128} strokeWidth={2.1} aria-hidden="true" />
  </>
)}
```

- [ ] **Step 2: Add the full-area responsive link styles**

Add the base styles:

```css
.tenant-announcement-link {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  padding: 24px;
  color: inherit;
  text-decoration: none;
}

.tenant-announcement-link:focus-visible {
  border-radius: inherit;
  outline: 2px solid var(--blue);
  outline-offset: -4px;
}
```

Add `padding: 30px 32px` to `.tenant-announcement-link` inside the `min-width: 900px` media query, and add the existing `54px` grid column, `14px` gap, and `18px` padding inside the `max-width: 560px` query.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
pnpm --filter web exec node --test --test-name-pattern="gives tenants a real resident dashboard" property-shell.spec.mjs
```

Expected: PASS with one selected test passing and unrelated tests skipped.

### Task 3: Verify the slice and publish it

**Files:**
- Verify: `apps/web/property-shell.spec.mjs`
- Verify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Verify: `apps/web/src/app/globals.css`
- Verify: `docs/superpowers/plans/2026-07-14-living-announcement-card-link.md`

**Interfaces:**
- Consumes: the implemented full-card link and current Docker Compose stack.
- Produces: fresh test, build, runtime, browser-navigation, commit, and push evidence.

- [ ] **Step 1: Run web tests**

Run:

```bash
pnpm test:web
```

Expected: the new property-shell contract passes. If the known unrelated manager token collision fails, confirm it is unchanged and report it explicitly.

- [ ] **Step 2: Rebuild the web Docker service**

Run:

```bash
docker compose up -d --build web
docker compose ps web
```

Expected: the `web` container is running and publishes port `3000`.

- [ ] **Step 3: Verify navigation in a browser**

Open `http://localhost:3000/living`, sign in with the existing demo tenant if needed, click the announcement card icon and a text/spacing area, and verify the final URL is `http://localhost:3000/tenant/messaging/02` with no browser console error caused by the click.

- [ ] **Step 4: Review and commit only scoped files**

Run:

```bash
git diff --check
git diff -- apps/web/property-shell.spec.mjs apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/globals.css docs/superpowers/plans/2026-07-14-living-announcement-card-link.md
git add -- apps/web/property-shell.spec.mjs apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/globals.css docs/superpowers/plans/2026-07-14-living-announcement-card-link.md
git commit -m "fix(living): link announcement card to notice list"
git push origin kms-venant-notice
```

Expected: commit and push succeed without staging unrelated untracked documents.
