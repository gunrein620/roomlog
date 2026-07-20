# Furniture Category Horizontal Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clearly visible, draggable horizontal scrollbar below the listing-tour furniture category chips without changing category filtering.

**Architecture:** Keep the existing single-row flex layout and native `overflow-x: auto` behavior. Add a focused CSS contract test, then style the Firefox and Chromium scrollbar surfaces in `globals.css`; no React state or event handlers are added.

**Tech Stack:** Next.js, React, CSS, Node.js test runner, `node:assert/strict`

## Global Constraints

- Keep category chips on one row.
- Preserve mouse dragging and touch swiping through native scrolling.
- Do not change selected-category styling or filter behavior.
- Do not affect the furniture grid or vertical scrolling.
- Use the current gray UI palette for the scrollbar thumb and track.

---

### Task 1: Visible category scrollbar

**Files:**
- Create: `apps/web/src/app/_components/ListingTourRoom3D.category-scroll.spec.ts`
- Modify: `apps/web/src/app/globals.css:5271-5277`
- Test: `apps/web/src/app/_components/ListingTourRoom3D.category-scroll.spec.ts`

**Interfaces:**
- Consumes: `.listing-tour-furniture-category-tabs` from `ListingTourRoom3D.tsx`
- Produces: Browser-native horizontal scrollbar styling for Firefox and Chromium

- [ ] **Step 1: Write the failing CSS contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const globalsSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

test("shows a visible horizontal scrollbar below the furniture category chips", () => {
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-color:\s*#8e8e8e\s+#f2f2f2;[^}]*scrollbar-width:\s*thin;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs::-webkit-scrollbar\s*\{[^}]*height:\s*8px;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs::-webkit-scrollbar-track\s*\{[^}]*background:\s*#f2f2f2;[^}]*border-radius:\s*999px;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*#8e8e8e;[^}]*border-radius:\s*999px;[^}]*\}/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/web`:

```powershell
node --test -r ts-node/register src/app/_components/ListingTourRoom3D.category-scroll.spec.ts
```

Expected: FAIL because `scrollbar-color` and the WebKit scrollbar selectors do not exist.

- [ ] **Step 3: Add the minimal scrollbar CSS**

Update the category rule and add its browser-specific pseudo-elements:

```css
.listing-tour-furniture-category-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-color: #8e8e8e #f2f2f2;
  scrollbar-width: thin;
}

.listing-tour-furniture-category-tabs::-webkit-scrollbar {
  height: 8px;
}

.listing-tour-furniture-category-tabs::-webkit-scrollbar-track {
  background: #f2f2f2;
  border-radius: 999px;
}

.listing-tour-furniture-category-tabs::-webkit-scrollbar-thumb {
  background: #8e8e8e;
  border-radius: 999px;
}
```

- [ ] **Step 4: Run focused and full unit tests and verify GREEN**

Run from `apps/web`:

```powershell
node --test -r ts-node/register src/app/_components/ListingTourRoom3D.category-scroll.spec.ts
node scripts/run-ts-unit-tests.mjs
```

Expected: the focused test and complete TypeScript unit suite both PASS.

- [ ] **Step 5: Verify in the browser**

Open the listing-tour furniture catalog at a width where the category chips overflow. Confirm the scrollbar is visible below the chips, its thumb can be dragged to the final category, touch swiping remains available, and the furniture list still scrolls vertically.

- [ ] **Step 6: Commit only the feature files**

```powershell
git add apps/web/src/app/_components/ListingTourRoom3D.category-scroll.spec.ts apps/web/src/app/globals.css docs/superpowers/plans/2026-07-20-furniture-category-horizontal-scroll.md
git commit -m "fix(3d-tour): 가구 카테고리 가로 스크롤 표시"
```
