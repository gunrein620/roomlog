# Preview Furniture Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show editor-placed furniture in the registration preview and preserve it as the editable starting layout in the registered 3D tour.

**Architecture:** The editor already persists confirmed landlord furniture in `floorPlan3D.furnitures`. Restore that array as the owner preview renderer input while retaining `previewFit`. The listing tour keeps its existing browser-local edited layout, otherwise initializing from `floorPlan.furnitures`.

**Tech Stack:** Next.js, React, React Three Fiber, Node `property-shell.spec.mjs` tests.

## Global Constraints

- Keep furniture edits browser-local; do not modify APIs, Prisma, or cross-device persistence.
- Preserve `previewFit` and the `min-height: 0` card sizing correction.
- Do not modify existing unrelated worktree changes.

---

### Task 1: Restore saved furniture in the registration preview

**Files:**

- Modify: `apps/web/src/app/my/flows/LandlordMyPage.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**

- Consumes: `floorPlan3D.furnitures` populated from the floor-plan editor.
- Produces: `FloorPlan3DPreview` with saved furniture and `previewFit` enabled.

- [ ] **Step 1: Write the failing regression test**

```js
test("renders editor-placed furniture in the owner summary preview", () => {
  assert.match(landlordMyPageSource, /<FloorPlan3DPreview[\s\S]*?furnitureData=\{floorPlan3D\.furnitures as unknown as PlacedFurniture\[\]\}[\s\S]*?previewFit[\s\S]*?wallsData=/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "renders editor-placed furniture" property-shell.spec.mjs`

Expected: failure because the owner preview currently receives `furnitureData={[]}`.

- [ ] **Step 3: Write minimal implementation**

Restore the `PlacedFurniture` type import and set `furnitureData={floorPlan3D.furnitures as unknown as PlacedFurniture[]}`. Keep `previewFit`, `mitunetPlan`, and all existing wall inputs unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern "renders editor-placed furniture" property-shell.spec.mjs`

Expected: exit code 0.

- [ ] **Step 5: Commit**

Run: `git add apps/web/src/app/my/flows/LandlordMyPage.tsx apps/web/property-shell.spec.mjs`

Run: `git commit -m "feat: show saved furniture in registration preview"`

### Task 2: Lock in editable-tour initial furniture behavior

**Files:**

- Modify: `apps/web/property-shell.spec.mjs`
- Verify only: `apps/web/src/app/_components/ListingTourRoom3D.tsx`

**Interfaces:**

- Consumes: `ListingTourRoom3D.floorPlan.furnitures` and optional browser-local furniture state.
- Produces: regression coverage that tour furniture starts from the saved plan and remains editable and browser-local.

- [ ] **Step 1: Write the regression test**

```js
const listingTourSource = readFileSync(new URL("./src/app/_components/ListingTourRoom3D.tsx", import.meta.url), "utf8");

test("uses saved plan furniture as the editable tour starting layout", () => {
  assert.match(listingTourSource, /setPlacedFurnitures\(\(savedFurnitures \?\? floorPlan\.furnitures\) as unknown as PlacedFurniture\[\]\)/);
  assert.match(listingTourSource, /window\.localStorage\.setItem\(floorPlanFurnitureStorageKey\(floorPlan\), payload\)/);
  assert.match(listingTourSource, /reopenFurnitureDraft\(furniture\)/);
});
```

- [ ] **Step 2: Run focused tour test**

Run: `node --test --test-name-pattern "uses saved plan furniture" property-shell.spec.mjs`

Expected: exit code 0 because this behavior already exists.

- [ ] **Step 3: Run combined focused verification**

Run: `node --test --test-name-pattern "editor-placed furniture|saved plan furniture|opt-in camera fit" property-shell.spec.mjs`

Expected: exit code 0.

- [ ] **Step 4: Inspect scoped diff**

Run: `git diff -- apps/web/src/app/my/flows/LandlordMyPage.tsx apps/web/property-shell.spec.mjs`

Expected: only the restored furniture input and focused regression checks.
