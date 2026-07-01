# Floor Plan 3D Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first landlord flow from My Page to a separate 3D floor-plan creation page.

**Architecture:** Keep the current `apps/web` demo shell intact. Change the landlord My Page 3D placeholder into a real link to `/floor-plan-3d`, then add a route-level page that documents the 123123 editor integration point without importing the external app yet.

**Tech Stack:** Next.js App Router, React, existing CSS in `apps/web/src/app/globals.css`, Node test runner.

---

### Task 1: Landlord 3D Floor Plan Entry

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/floor-plan-3d/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write the failing test**

Add assertions that:
- The landlord My Page source links to `/floor-plan-3d`.
- The landlord action label is `3D 도면 만들기`.
- The new route contains `123123`, `FloorPlanEditor`, and `PC에서 도면 만들기`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`

Expected: FAIL because `/floor-plan-3d/page.tsx` does not exist and the landlord button is still a placeholder.

- [ ] **Step 3: Write minimal implementation**

Change the placeholder button in `LandlordMyPage` to an anchor:

```tsx
<a className="upload-3d-button floor-plan-link" href="/floor-plan-3d">
  <strong>3D 도면 만들기</strong>
  <span>123123 도면 편집기와 연결될 별도 페이지로 이동</span>
</a>
```

Create `apps/web/src/app/floor-plan-3d/page.tsx` as a static App Router page with the 3D 도면 creation shell and explicit 123123 integration notes.

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm --filter web test
pnpm --filter web build
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-07-01-floor-plan-3d-entry.md apps/web/property-shell.spec.mjs apps/web/src/app/page.tsx apps/web/src/app/floor-plan-3d/page.tsx apps/web/src/app/globals.css
git commit -m "feat: add landlord 3d floor plan entry"
git push origin kms
```
