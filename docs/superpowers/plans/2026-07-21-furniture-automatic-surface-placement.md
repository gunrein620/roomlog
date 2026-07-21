# Furniture Automatic Surface Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the listing 3D furniture simulator automatically place compatible furniture on floors, supporting furniture, and walls using the centre reticle, with valid/invalid feedback and complete keyboard controls.

**Architecture:** Extend the local room-model contract with optional placement metadata, then keep all capability inference and transform math in a pure `surface-placement` module. The Three.js controller only reports the nearest semantic hit; `ListingTourRoom3D` resolves and persists drafts, while `RoomlogThreeFloorPlanView` renders feedback and routes shortcuts.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, React Three Fiber, Three.js, Node test runner, CSS design tokens.

## Global Constraints

- Existing furniture records without `placement` remain floor placements.
- Wall-mount fallback allows depth up to 300 mm.
- Surface fallback allows a largest footprint side up to 1,000 mm and height up to 1,200 mm.
- Only floor-placed furniture in table, desk, storage, or kitchen categories can support one child level.
- The nearest visible semantic hit is authoritative; incompatible foreground objects cannot be skipped.
- GLB furniture stores base Y while fallback boxes store centre Y; helpers normalize both.
- `Q` confirms only valid placement, `R` deletes an existing carried item or cancels a new draft, and `Esc` restores/cancels.
- New CSS uses existing token variables only; no raw hex values.
- Direct work on `main` and push to `origin/main` are explicitly authorized.

---

### Task 1: Placement contracts and pure surface resolver

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-model/types.ts`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/surface-placement.ts`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/surface-placement.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/furniture-placement/index.ts`

**Interfaces:**
- Produces: `FurniturePlacementCapability`, `FurniturePlacementAttachment`, `FurniturePlacementMode`, `FurniturePlacementHit`, `FurniturePlacementResult`.
- Produces: `resolveFurniturePlacement(input)`, `rotateFurnitureForPlacement(furniture, direction)`, `moveAttachedFurniture(input)`, `hasAttachedFurniture(furnitureId, placed)`.
- Consumes: `PlacedFurniture`, `WheretoputWall3D`, `getFurnitureDimensions`, and existing floor wall constraints.

- [ ] **Step 1: Add failing capability and legacy tests**

```ts
it("treats missing placement metadata as floor and respects explicit wall capability", () => {
  assert.equal(furniturePlacementMode(legacyFurniture), "floor");
  assert.equal(canPlaceFurniture(wallOnlyFurniture, "wall"), true);
  assert.equal(canPlaceFurniture(wallOnlyFurniture, "surface"), false);
});
```

- [ ] **Step 2: Run the focused test and observe missing exports**

Run: `pnpm --filter web exec tsx --test src/app/floor-plan-3d/furniture-placement/surface-placement.spec.ts`
Expected: FAIL because `surface-placement.ts` does not exist.

- [ ] **Step 3: Add optional placement types and capability inference**

```ts
export type FurniturePlacementMode = "floor" | "surface" | "wall";
export type FurniturePlacementCapability = FurniturePlacementMode | "any";
export type FurniturePlacementAttachment = {
  mode: FurniturePlacementMode;
  supportFurnitureId?: string;
  wallId?: string;
};
```

Add `placementCapability?: FurniturePlacementCapability` to `FurnitureCatalogItem` and `placement?: FurniturePlacementAttachment` to `PlacedFurniture`. Explicit metadata wins; otherwise infer from dimensions, category/name keywords, and the approved loose thresholds.

- [ ] **Step 4: Add failing floor, support, wall, collision, and propagation tests**

```ts
it("snaps a small item inside a support top", () => {
  const result = resolveFurniturePlacement({ draft: decor, hit: supportHit, placed: [table], walls: [] });
  assert.equal(result.valid, true);
  assert.deepEqual(result.attachment, { mode: "surface", supportFurnitureId: table.id });
  assert.ok(furnitureBaseY(result.furniture) >= supportTopY);
});

it("aligns a shallow item to a wall normal", () => {
  const result = resolveFurniturePlacement({ draft: mirror, hit: wallHit, placed: [], walls: [] });
  assert.equal(result.attachment.mode, "wall");
  assert.equal(result.valid, true);
});
```

Also assert rejection of oversized items, second-level supports, vertical collisions, support deletion with children, and rigid child translation/rotation.

- [ ] **Step 5: Implement the pure resolver and normalized vertical helpers**

```ts
export function resolveFurniturePlacement(input: ResolveFurniturePlacementInput): FurniturePlacementResult {
  if (input.hit.kind === "floor") return resolveFloorPlacement(input);
  if (input.hit.kind === "furniture") return resolveSurfacePlacement(input);
  return resolveWallPlacement(input);
}
```

Floor resolution delegates to `moveFurnitureDraftToPoint`; support resolution transforms the hit into support-local coordinates and clamps it inward; wall resolution uses the world normal, half-depth offset, wall-height clamp, and 3D collision checks. Invalid results retain the last valid draft transform supplied by the caller.

- [ ] **Step 6: Run the focused tests until green**

Run: `pnpm --filter web run test:unit -- surface-placement.spec.ts`
Expected: all surface-placement tests PASS.

- [ ] **Step 7: Commit the pure placement slice**

```bash
git add apps/web/src/app/floor-plan-3d/room-model/types.ts apps/web/src/app/floor-plan-3d/furniture-placement
git commit -m "feat: add automatic furniture surface placement"
```

### Task 2: Nearest semantic hit and remove shortcut

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/FurnitureFirstPersonControls.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts`

**Interfaces:**
- Consumes: `FurniturePlacementHit`.
- Produces: `onLatestPlacementHit(hit)`, `onPlacementHit(hit)`, and `onRemove()` controller callbacks.

- [ ] **Step 1: Add failing shortcut and source-contract tests**

```ts
assert.equal(resolveFurnitureShortcut({ code: "KeyR", mode: "carry", repeat: false, target: null, aimedFurnitureId: null }), "remove");
assert.match(controllerSource, /normal\.transformDirection\(.*matrixWorld/);
assert.match(controllerSource, /supportTopY/);
```

- [ ] **Step 2: Run focused controller tests and observe failure**

Run: `pnpm --filter web run test:unit -- furniture-first-person-input.spec.ts furniture-first-person-controls.spec.ts`
Expected: FAIL because `KeyR` and rich hits are absent.

- [ ] **Step 3: Route `R` and emit the nearest rich hit**

```ts
export type FurnitureShortcutAction = /* existing */ | "remove";
if (input.code === "KeyR" && input.mode === "carry") return "remove";
```

For each nearest semantic intersection, emit floor point, wall point plus transformed world normal and wall bounds, or furniture point plus ID and `Box3` top. Do not continue past the first semantic hit.

- [ ] **Step 4: Run focused controller tests until green**

Run: `pnpm --filter web run test:unit -- furniture-first-person-input.spec.ts furniture-first-person-controls.spec.ts`
Expected: all named tests PASS.

- [ ] **Step 5: Commit controller routing**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene
git commit -m "feat: report furniture placement surfaces"
```

### Task 3: Listing state, persistence, and dependent furniture

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.catalog.spec.ts`
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.first-person.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`

**Interfaces:**
- Consumes: Task 1 resolver/dependency helpers and Task 2 rich-hit callbacks.
- Produces: placement feedback `{ valid, mode, reason }`, guarded confirm/delete, and attached-child propagation.

- [ ] **Step 1: Add failing listing contract tests**

```ts
assert.match(source, /resolveFurniturePlacement/);
assert.match(source, /onFurnitureRemove/);
assert.match(source, /위에 놓인 가구를 먼저 제거하세요/);
assert.match(source, /moveAttachedFurniture/);
```

- [ ] **Step 2: Run the listing tests and observe failure**

Run: `pnpm --filter web run test:unit -- ListingTourRoom3D.first-person.spec.ts`
Expected: FAIL because placement validity and dependent behavior are not wired.

- [ ] **Step 3: Replace floor-point state with placement-result state**

Keep the latest rich hit for catalogue selection, resolve every carry hit against the current draft and placed furniture, retain the last valid transform on invalid hits, and pass `{ valid, mode, reason }` to the renderer.

- [ ] **Step 4: Guard confirm, remove, support movement, and deletion**

```ts
if (!pendingPlacementRef.current?.valid) return;
if (hasAttachedFurniture(pendingFurniture.id, placedFurnitures)) {
  setSaveMessage("위에 놓인 가구를 먼저 제거하세요");
  return;
}
```

On confirming a moved support, apply its horizontal rigid transform to direct children. `R` deletes an existing carried item, cancels a new item, and blocks support deletion while children exist.

- [ ] **Step 5: Run listing and persistence tests until green**

Run: `pnpm --filter web run test:unit -- ListingTourRoom3D.first-person.spec.ts ListingTourRoom3D.catalog.spec.ts`
Expected: all named tests PASS and attachment fields survive JSON save/load unchanged.

- [ ] **Step 6: Commit listing integration**

```bash
git add apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/_components/*.spec.ts apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx
git commit -m "feat: integrate automatic placement controls"
```

### Task 4: Green/red reticle and user guidance

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: listing placement feedback.
- Produces: `.is-valid` and `.is-invalid` reticle modifiers and Korean placement labels.

- [ ] **Step 1: Add failing feedback presentation tests**

```ts
assert.match(viewerSource, /바닥 배치/);
assert.match(viewerSource, /가구 위 배치/);
assert.match(viewerSource, /벽걸이 배치/);
assert.match(styles, /\.floor-plan-furniture-reticle\.is-valid/);
assert.match(styles, /\.floor-plan-furniture-reticle\.is-invalid/);
```

- [ ] **Step 2: Run the presentation test and observe failure**

Run: `pnpm --filter web run test:unit -- furniture-first-person-controls.spec.ts`
Expected: FAIL because state modifiers and labels are absent.

- [ ] **Step 3: Render token-based valid/invalid feedback and updated hint**

Use existing success/danger token variables for the reticle border, centre dot, and subtle label. Carry hint becomes `1 왼쪽 회전 · 2 다시 선택 · 3 오른쪽 회전 · Q 고정 · R 제거/취소`.

- [ ] **Step 4: Run presentation tests until green**

Run: `pnpm --filter web run test:unit -- furniture-first-person-controls.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit feedback UI**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene apps/web/src/app/globals.css
git commit -m "feat: show furniture placement validity"
```

### Task 5: Regression and browser verification

**Files:**
- Modify if needed: implementation files from Tasks 1-4 only.

**Interfaces:**
- Consumes: completed automatic placement workflow.
- Produces: verified main branch ready to push.

- [ ] **Step 1: Run all web unit tests**

Run: `pnpm --filter web test`
Expected: all web tests PASS.

- [ ] **Step 2: Run repository verification**

Run: `bash scripts/verify.sh`
Expected: types, UI, web, API builds and API smoke checks PASS.

- [ ] **Step 3: Rebuild the Docker web service**

Run: `docker compose up -d --build web`
Expected: `roomlog-web` is recreated and healthy/running on port 3000.

- [ ] **Step 4: Verify the listing workflow in a real browser**

Open `/listing/TRADE-eadc1bad`, enter furniture simulation, press `2`, select a small item, aim at a table and confirm with `Q`; repeat on a wall, rotate with `1`/`3`, reload, move the support, verify its child follows, verify invalid red positions cannot confirm, and verify `R` delete/cancel behavior.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/floor-plan-3d apps/web/src/app/globals.css
git commit -m "fix: stabilize automatic furniture placement"
```

- [ ] **Step 6: Push authorized main branch**

Run: `git push origin main`
Expected: `origin/main` advances to the verified local `main` HEAD.
