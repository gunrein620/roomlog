# Furniture First-Person Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop furniture mode use pointer-lock mouse look, doubled-speed WASD movement, `E` selection/pick-up, center-aim placement, and `Q` confirmation while preserving existing furniture mutation rules and fallback controls.

**Architecture:** A pure input module defines the state machine, shortcuts, and `6 m/s` movement delta. A focused React Three Fiber controller owns pointer lock, CameraControls, center raycasting, and semantic callbacks. `ListingTourRoom3D` remains the owner of furniture drafts, collision-aware movement, restore/finalize behavior, and interaction state.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, React Three Fiber 9, Drei CameraControls, Three.js, Node test runner.

## Global Constraints

- Apply the new workflow only to the full-screen desktop `3D 시뮬레이션 > 가구 배치` mode.
- Keep `워킹뷰`, the splat viewer, passive previews, registration views, persistence, and server APIs unchanged.
- Use pointer lock only from a user gesture; retain the current pointer workflow as fallback when lock is unavailable.
- Use `6 m/s`, fixed-height X/Z movement, normalized diagonals, and a `0.1 s` maximum frame delta.
- Ignore shortcuts from inputs, textareas, selects, buttons, links, and content-editable elements.
- Reuse existing token-based styles; add no raw color values.
- Write and run each focused failing test before its production change.

---

### Task 1: Pure furniture input state and movement

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.ts`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.spec.ts`

**Interfaces:**
- Consumes: `WalkAction`, `cameraRelativeWalkDelta`, and `combineWalkInput` from `../walk/walk-input`; `isOrbitKeyboardInteractiveTarget` from `./orbit-keyboard-movement`.
- Produces: `FurnitureInteractionMode`, `FurnitureShortcutAction`, `resolveFurnitureShortcut(...)`, `furnitureFirstPersonMovementDelta(...)`, `FURNITURE_MOVE_SPEED_METERS_PER_SECOND`.

- [ ] **Step 1: Write failing state-transition and movement tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FURNITURE_MOVE_SPEED_METERS_PER_SECOND,
  furnitureFirstPersonMovementDelta,
  resolveFurnitureShortcut
} from "./furniture-first-person-input";

describe("furniture first-person input", () => {
  it("uses E contextually for aimed pickup or cursor selection", () => {
    assert.equal(resolveFurnitureShortcut({ code: "KeyE", mode: "explore", aimedFurnitureId: "chair", repeat: false, target: null }), "pickup-aimed");
    assert.equal(resolveFurnitureShortcut({ code: "KeyE", mode: "explore", aimedFurnitureId: null, repeat: false, target: null }), "open-select");
    assert.equal(resolveFurnitureShortcut({ code: "KeyE", mode: "select", aimedFurnitureId: null, repeat: false, target: null }), "close-select");
  });

  it("uses Q to confirm carry and Escape to close or cancel", () => {
    assert.equal(resolveFurnitureShortcut({ code: "KeyQ", mode: "carry", aimedFurnitureId: null, repeat: false, target: null }), "confirm");
    assert.equal(resolveFurnitureShortcut({ code: "Escape", mode: "carry", aimedFurnitureId: null, repeat: false, target: null }), "cancel");
    assert.equal(resolveFurnitureShortcut({ code: "Escape", mode: "select", aimedFurnitureId: null, repeat: false, target: null }), "close-select");
  });

  it("ignores repeats and editable targets", () => {
    assert.equal(resolveFurnitureShortcut({ code: "KeyE", mode: "explore", aimedFurnitureId: null, repeat: true, target: null }), null);
    assert.equal(resolveFurnitureShortcut({ code: "KeyQ", mode: "carry", aimedFurnitureId: null, repeat: false, target: { tagName: "INPUT" } }), null);
  });

  it("moves at exactly six metres per second with bounded delta", () => {
    assert.equal(FURNITURE_MOVE_SPEED_METERS_PER_SECOND, 6);
    assert.deepEqual(furnitureFirstPersonMovementDelta(new Set(["forward"]), { x: 0, z: -1 }, 1), { x: 0, z: -0.6 });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter web test:unit -- furniture-first-person-input.spec.ts`

Expected: FAIL because `./furniture-first-person-input` does not exist.

- [ ] **Step 3: Implement the pure input contract**

```ts
export const FURNITURE_MOVE_SPEED_METERS_PER_SECOND = 6;
export const FURNITURE_MAX_FRAME_DELTA_SECONDS = 0.1;
export type FurnitureInteractionMode = "explore" | "select" | "carry";
export type FurnitureShortcutAction = "pickup-aimed" | "open-select" | "close-select" | "confirm" | "cancel";

export function resolveFurnitureShortcut(input: {
  aimedFurnitureId: string | null;
  code: string;
  mode: FurnitureInteractionMode;
  repeat: boolean;
  target: unknown;
}): FurnitureShortcutAction | null {
  if (input.repeat || isOrbitKeyboardInteractiveTarget(input.target)) return null;
  if (input.code === "KeyE" && input.mode === "explore") return input.aimedFurnitureId ? "pickup-aimed" : "open-select";
  if ((input.code === "KeyE" || input.code === "Escape") && input.mode === "select") return "close-select";
  if (input.code === "KeyQ" && input.mode === "carry") return "confirm";
  if (input.code === "Escape" && input.mode === "carry") return "cancel";
  return null;
}
```

Implement `furnitureFirstPersonMovementDelta` with `combineWalkInput`, `cameraRelativeWalkDelta`, speed `6`, and clamped delta `[0, 0.1]`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter web test:unit -- furniture-first-person-input.spec.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.ts apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.spec.ts
git commit -m "feat: add furniture first-person input state"
```

---

### Task 2: Dedicated pointer-lock furniture controller

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/room-scene/FurnitureFirstPersonControls.tsx`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 input helpers; `PlacedFurniture`; `CameraControls`; room center spawn; current interaction mode.
- Produces: `FurnitureFirstPersonControls`, `FurnitureFirstPersonStatus`, canvas pointer-lock request ref, aimed furniture callbacks, placement-point callbacks, semantic shortcut callbacks.

- [ ] **Step 1: Write failing source-contract tests**

Create tests that read both component source files and assert all of these contracts:

```ts
assert.match(controllerSource, /document\.addEventListener\("pointerlockchange"/);
assert.match(controllerSource, /document\.addEventListener\("mousemove"/);
assert.match(controllerSource, /resolveFurnitureShortcut/);
assert.match(controllerSource, /furnitureFirstPersonMovementDelta/);
assert.match(controllerSource, /raycaster\.setFromCamera\(CENTER_SCREEN/);
assert.match(controllerSource, /onPlacementPoint/);
assert.match(controllerSource, /onAimedFurnitureChange/);
assert.match(viewerSource, /furnitureFirstPersonEnabled\?: boolean/);
assert.match(viewerSource, /<FurnitureFirstPersonControls/);
assert.match(viewerSource, /className="floor-plan-furniture-reticle"/);
assert.match(viewerSource, /Q 고정 · Esc 취소/);
assert.match(styles, /\.floor-plan-furniture-reticle/);
```

Also assert that `RoomOrbitControls` remains the fallback and auto-fit is skipped while furniture first-person mode is active.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter web test:unit -- furniture-first-person-controls.spec.ts`

Expected: FAIL because the controller and viewer contract do not exist.

- [ ] **Step 3: Implement `FurnitureFirstPersonControls`**

Define this focused prop contract:

```ts
export type FurnitureFirstPersonStatus = "ready" | "locked" | "fallback";

export type FurnitureFirstPersonControlsProps = {
  aimedFurnitureId: string | null;
  enabled: boolean;
  interactionMode: FurnitureInteractionMode;
  onAimedFurnitureChange: (id: string | null) => void;
  onCancel: () => void;
  onCloseSelect: () => void;
  onConfirm: () => void;
  onOpenSelect: () => void;
  onPickupAimed: (id: string) => void;
  onPlacementPoint: (point: { x: number; z: number }) => void;
  onStatusChange: (status: FurnitureFirstPersonStatus) => void;
  pointerLockRequestRef: MutableRefObject<(() => void) | null>;
  preferredSpawn: { x: number; z: number };
};
```

Use `CameraControls` for yaw/pitch, set its spawn to `[preferredSpawn.x, 1.45, preferredSpawn.z]`, and configure rotate-only mouse actions. Install and clean up canvas click, pointer-lock, mousemove, keydown, keyup, and blur listeners. Use the pure shortcut resolver before movement key mapping. Request pointer lock on a canvas click; in Select, invoke `onCloseSelect` first.

In `useFrame`:

1. Move the camera with `furnitureFirstPersonMovementDelta` without collision.
2. Call `raycaster.setFromCamera(CENTER_SCREEN, camera)` and inspect sorted scene intersections.
3. Walk each hit object's parents for `userData.roomlogFurnitureId` or `userData.roomlogPlacementSurface`.
4. Stop at the first relevant wall, floor, or placed furniture.
5. In Explore report the first visible furniture ID; in Carry report a floor hit through `onPlacementPoint`.

- [ ] **Step 4: Wire scene metadata and viewer state**

Add `userData={{ roomlogPlacementSurface: "floor" }}` to `RoomFloor`, `userData={{ roomlogPlacementSurface: "wall" }}` to `WallMesh`, and `userData={{ roomlogFurnitureId: furniture.id }}` to furniture roots. Pending furniture remains excluded from raycasting.

Extend `RoomlogThreeFloorPlanView` with the exact controller props, internal aimed/status state, reticle, and state-specific hints:

```tsx
{furnitureInteractionMode === "carry"
  ? "Q 고정 · Esc 취소"
  : furnitureInteractionMode === "select"
    ? "가구를 선택하세요 · E 또는 Esc 닫기"
    : aimedFurnitureId
      ? "E 가구 이동 · WASD 이동 · 마우스 시점"
      : "WASD 이동 · 마우스 시점 · E 가구 선택"}
```

Render the new controller instead of orbit controls only when `furnitureFirstPersonEnabled`; keep OrbitControls for every other consumer. Skip `RoomCameraAutoFit` while the new controller is active. Style the reticle and hints with existing CSS variables only.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm --filter web test:unit -- furniture-first-person-input.spec.ts furniture-first-person-controls.spec.ts
pnpm --filter web exec tsc --noEmit
```

Expected: focused tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene/FurnitureFirstPersonControls.tsx apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts apps/web/src/app/globals.css
git commit -m "feat: add first-person furniture controller"
```

---

### Task 3: Integrate E/Q placement with existing furniture mutations

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-floating-toolbar.spec.ts`

**Interfaces:**
- Consumes: `FurnitureInteractionMode` and the Task 2 viewer props.
- Produces: parent-owned interaction state, synchronous pointer-lock request after catalog selection, aimed-item reopen, guarded Q confirmation, and unchanged coarse-pointer fallback.

- [ ] **Step 1: Add failing integration assertions**

Assert that `ListingTourRoom3D`:

```ts
assert.match(source, /useState<FurnitureInteractionMode>\("explore"\)/);
assert.match(source, /furnitureFirstPersonEnabled=\{simulationOpen && simulationMode === "furniture" && !isCoarsePointer\}/);
assert.match(source, /onFurniturePickupAimed=\{beginFurnitureMoveById\}/);
assert.match(source, /onFurniturePlacementPoint=\{placePendingFurniture\}/);
assert.match(source, /onFurnitureConfirm=\{confirmPendingFurnitureFromShortcut\}/);
assert.match(source, /furniturePointerLockRequestRef\.current\?\.\(\)/);
```

Assert that the passive preview does not enable the controller and the existing toolbar callbacks remain wired.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `pnpm --filter web test:unit -- furniture-first-person-controls.spec.ts listing-preview-presentation.spec.ts furniture-floating-toolbar.spec.ts`

Expected: FAIL on missing parent integration while existing assertions remain green.

- [ ] **Step 3: Add parent interaction state and semantic handlers**

Add:

```ts
const [furnitureInteractionMode, setFurnitureInteractionMode] = useState<FurnitureInteractionMode>("explore");
const furniturePointerLockRequestRef = useRef<(() => void) | null>(null);
```

Create `beginFurnitureMoveById(id)` by extracting the existing reopen/origin logic from `beginSelectedFurnitureMove`. Make the toolbar handler delegate to the same function. Implement:

```ts
function openFurnitureSelection() {
  setFurnitureInteractionMode("select");
  openFurnitureEditor();
}

function confirmPendingFurnitureFromShortcut() {
  if (!pendingFurniturePlacedOnceRef.current) {
    setSaveMessage("바닥을 바라본 뒤 Q를 눌러 가구를 고정하세요.");
    return;
  }
  confirmPendingFurniturePlacement();
}
```

Catalog selection sets Carry and calls `furniturePointerLockRequestRef.current?.()` synchronously from the click handler. Existing-item pickup sets Carry. Confirm/cancel/reset/mode changes restore Explore. `placePendingFurniture` remains the only path that mutates pending X/Z and therefore retains wall-crossing behavior.

- [ ] **Step 4: Wire viewer props and preserve fallbacks**

Pass the new props to `RoomlogThreeFloorPlanView`. Enable first-person mode only for `simulationOpen && simulationMode === "furniture" && !isCoarsePointer`. Keep current orbit/pointer drag controls on coarse-pointer devices and on every non-full-screen surface. Remove desktop `orbitKeyboardMoveEnabled`; it is superseded by the new controller.

- [ ] **Step 5: Run the focused regression suite**

Run:

```bash
pnpm --filter web test:unit -- furniture-first-person-input.spec.ts furniture-first-person-controls.spec.ts orbit-keyboard-controls.spec.ts listing-preview-presentation.spec.ts furniture-floating-toolbar.spec.ts floor-plan-walk-controls.spec.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts apps/web/src/app/floor-plan-3d/room-scene/furniture-floating-toolbar.spec.ts
git commit -m "feat: add E and Q furniture placement flow"
```

---

### Task 4: Full verification and handoff

**Files:**
- Modify only files required by failures caused by Tasks 1-3.

**Interfaces:**
- Consumes: completed first-person furniture workflow.
- Produces: verified build and repository state ready for user testing.

- [ ] **Step 1: Run focused tests once more**

Run the Task 3 focused suite. Expected: PASS with no new warnings.

- [ ] **Step 2: Run the web production build**

Run: `pnpm --filter web build`

Expected: Next.js production build and TypeScript validation succeed.

- [ ] **Step 3: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, UI, web, API, and smoke checks PASS.

- [ ] **Step 4: Run Docker manual smoke when Docker is available**

Run: `docker compose up -d --build web`, then test the spec's Explore → Select → Carry → Q/Esc flows at `http://localhost:3000/listing/TRADE-4730b4a6`.

Expected: pointer-lock look, `6 m/s` movement, E pickup/select, center-ray follow, Q fix, Esc restore, and input-focus guards work. If the daemon is unavailable, report that manual smoke remains for the user without claiming it passed.

- [ ] **Step 5: Inspect the final diff**

Run: `git status --short --branch && git diff HEAD~3 --check && git log -5 --oneline`.

Expected: no unstaged changes except any intentional verification fix, no whitespace errors, and the feature commits are present.
