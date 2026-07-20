# Building-Only Registration Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the owner registration 3D preview use the editor's look, hide furniture, and automatically frame the complete building in its card.

**Architecture:** Keep `RoomlogThreeFloorPlanView` as the sole Three.js renderer. Add an opt-in camera-fit prop used only by the owner summary preview; the editor and listing-detail tour retain their existing camera behavior. The owner page passes no furniture to the renderer, while CSS lets the canvas measure the real card size.

**Tech Stack:** Next.js, React, React Three Fiber, Drei, Node `property-shell.spec.mjs` tests, CSS.

## Global Constraints

- Change only the owner registration summary 3D preview, shared renderer camera-fit support, its CSS, and focused regression assertions.
- Preserve the interactive floor-plan editor and listing-detail furniture-placement tour behavior.
- Do not stage or modify the existing unrelated worktree changes.

---

### Task 1: Add an opt-in card camera fit to the shared renderer

**Files:**

- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**

- Consumes: existing `RoomCameraAutoFit` wall bounds and React Three Fiber `camera`, `size`, and `invalidate` state.
- Produces: optional `previewFit?: boolean` on `RoomlogThreeFloorPlanView`; when true, the camera position is calculated from the canvas aspect ratio and all wall bounds, with a small margin.

- [ ] **Step 1: Write the failing test**

Add a targeted source assertion that the shared renderer exposes `previewFit` and forwards it into `RoomCameraAutoFit`:

```js
const roomRendererSource = readFileSync(new URL("./src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx", import.meta.url), "utf8");

test("supports an opt-in camera fit for compact building previews", () => {
  assert.match(roomRendererSource, /previewFit\?: boolean/);
  assert.match(roomRendererSource, /<RoomCameraAutoFit bounds=\{wallBounds\} distanceScale=\{fitDistanceScale\} previewFit=\{previewFit\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd --filter web exec node property-shell.spec.mjs`

Expected: failure because `previewFit` is not present in the renderer source.

- [ ] **Step 3: Write minimal implementation**

Extend `RoomCameraAutoFit` to accept `previewFit`. Read `size.width` and `size.height` from `useThree`; when enabled, calculate the camera distance from the larger of the horizontal and vertical FOV requirements for `bounds.width` and `bounds.height`, multiplied by a 1.12 margin. Keep the current `longSide * 1.5` calculation unchanged when `previewFit` is false. Add `previewFit = false` to `RoomlogThreeFloorPlanView` props and forward it into `RoomCameraAutoFit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd --filter web exec node property-shell.spec.mjs`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/property-shell.spec.mjs
git commit -m "feat: fit building inside registration preview"
```

### Task 2: Configure the registration card as a building-only preview

**Files:**

- Modify: `apps/web/src/app/my/flows/LandlordMyPage.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**

- Consumes: `RoomlogThreeFloorPlanView.previewFit` from Task 1 and `floorPlan3D.walls3D` from the existing owner page state.
- Produces: a registration card that renders its building but no furniture, and a canvas with the card's real measured height.

- [ ] **Step 1: Write the failing test**

Add focused assertions using the exact owner-page and CSS source files:

```js
const ownerPageSource = readFileSync(new URL("./src/app/my/flows/LandlordMyPage.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./src/app/globals.css", import.meta.url), "utf8");

test("renders the owner summary preview as building-only with compact camera fitting", () => {
  assert.match(ownerPageSource, /<FloorPlan3DPreview[\s\S]*?furnitureData=\{\[\]\}[\s\S]*?previewFit[\s\S]*?wallsData=/);
  assert.match(cssSource, /\.summary-media-3d \.floor-plan-3d-preview\s*\{[\s\S]*?min-height:\s*0/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd --filter web exec node property-shell.spec.mjs`

Expected: failure because the card still passes `floorPlan3D.furnitures`, does not enable `previewFit`, and does not reset `min-height`.

- [ ] **Step 3: Write minimal implementation**

Change only the `FloorPlan3DPreview` call in `LandlordMyPage.tsx`:

```tsx
furnitureData={[]}
previewFit
```

Add the following declaration inside the existing `.summary-media-3d .floor-plan-3d-preview` rule:

```css
min-height: 0;
```

Do not pass different lighting, background, material, scale, or camera-position props; that preserves the editor defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd --filter web exec node property-shell.spec.mjs`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/my/flows/LandlordMyPage.tsx apps/web/src/app/globals.css apps/web/property-shell.spec.mjs
git commit -m "feat: show building-only owner preview"
```

### Task 3: Verify the complete web application

**Files:**

- Verify only: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`
- Verify only: `apps/web/src/app/my/flows/LandlordMyPage.tsx`
- Verify only: `apps/web/src/app/globals.css`
- Verify only: `apps/web/property-shell.spec.mjs`

**Interfaces:**

- Consumes: completed Tasks 1 and 2.
- Produces: fresh evidence that tests and the production build accept the change.

- [ ] **Step 1: Run the focused regression test**

Run: `pnpm.cmd --filter web exec node property-shell.spec.mjs`

Expected: exit code 0.

- [ ] **Step 2: Run the production build**

Run: `pnpm.cmd --filter web run build`

Expected: exit code 0 and no TypeScript errors.

- [ ] **Step 3: Inspect the scoped diff**

Run: `git diff -- apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/src/app/my/flows/LandlordMyPage.tsx apps/web/src/app/globals.css apps/web/property-shell.spec.mjs`

Expected: only the building-only preview, compact camera fit, CSS sizing, and regression assertions are present.

- [ ] **Step 4: Confirm no scoped changes remain unstaged**

Run: `git status --short`

Expected: no unstaged changes in the four scoped files.
