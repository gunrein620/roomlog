# 3D Simulation Walk Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the floor-plan furniture simulator to `3D 시뮬레이션` and add a default FPS-style `워킹뷰` mode with pointer-lock mouse look, WASD/touch movement, and wall/furniture collision while leaving the separate splat tour unchanged.

**Architecture:** Keep one React Three Fiber floor-plan scene and switch between mutually exclusive orbit and walk camera controllers. Put deterministic X/Z collision and scene-to-obstacle conversion in pure modules, then let a focused React controller own pointer lock, input state, camera movement, and status reporting. `ListingTourRoom3D` owns the `walk | furniture` product mode and existing furniture state; `ListingDetailView` owns only entry-point naming and fullscreen open/close state.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Three.js 0.185, `@react-three/fiber` 9.6, `@react-three/drei` 10.7, Node test runner with `ts-node/register`, CSS custom-property tokens.

## Global Constraints

- The existing `/splat-tour` viewer, splat asset lookup, and `1인칭 투어` availability gate must remain unchanged.
- Every newly opened fullscreen simulation starts in `워킹뷰`; mode state is not persisted between sessions.
- Desktop input is canvas click to request pointer lock, mouse movement to look, WASD/arrow keys to move, and Escape to unlock without closing.
- The visitor eye height is exactly `1.45` metres and the collision radius is exactly `0.22` metres.
- Walk mode blocks both walls and confirmed furniture, supports obstacle sliding, and cannot select or edit furniture.
- Furniture mode preserves all existing catalog, placement, edit, restore, and browser-save behavior.
- Switching to walk mode cancels only the current unconfirmed furniture draft and restores a re-edited item to its last confirmed state.
- Pointer lock must be released on mode change, close, unmount, and loss of walk mode.
- Mobile uses analogue movement and touch-drag look; pointer lock is desktop-only.
- Use only existing `@roomlog/ui` CSS variables for new visual values; do not add raw hex colors.
- Standard validation remains `pnpm test:web` followed by `bash scripts/verify.sh`; Docker is the development/runtime reference environment.

## File Map

- Create `apps/web/src/app/floor-plan-3d/walk/walk-collision.ts` — pure circle/OBB collision, bounded substep movement, sliding, and spawn search.
- Create `apps/web/src/app/floor-plan-3d/walk/walk-scene.ts` — converts wall and furniture domain data into the collision world's scaled X/Z geometry.
- Create `apps/web/src/app/floor-plan-3d/walk/walk-collision.spec.ts` — pure collision and scene-adapter tests.
- Create `apps/web/src/app/floor-plan-3d/walk/walk-input.ts` — keyboard/analogue input normalization and camera-relative movement vectors.
- Create `apps/web/src/app/floor-plan-3d/walk/walk-input.spec.ts` — key mapping and direction normalization tests.
- Create `apps/web/src/app/floor-plan-3d/room-scene/FloorPlanWalkControls.tsx` — pointer-lock lifecycle, drag-look fallback, walk camera, and status callbacks.
- Create `apps/web/src/app/floor-plan-3d/room-scene/floor-plan-walk-controls.spec.ts` — component-source contract tests for pointer lock and cleanup.
- Modify `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx` — explicit camera-control mode, walk overlay, noninteractive walk scene, and single-controller mounting.
- Modify `apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts` — preserve preview behavior and assert orbit/walk controller selection.
- Modify `apps/web/src/app/_components/ListingTourRoom3D.tsx` — product mode state, mode transition policy, and shared furniture/walk data flow.
- Reuse `apps/web/src/app/splat-tour/tour-joystick.tsx` — existing coarse-pointer analogue movement control without changing splat behavior.
- Modify `apps/web/src/app/_components/ListingDetailView.tsx` — rename open state, entry copy, dialog labels, and close copy to `3D 시뮬레이션`.
- Modify `apps/web/src/app/globals.css` — token-only mode switch and walk instruction overlay styling, including desktop/mobile layout.
- Modify `apps/web/property-shell.spec.mjs` — top-level naming, default mode, transition, and splat-nonregression source assertions.

---

### Task 1: Pure Walk Collision World

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/walk/walk-collision.ts`
- Create: `apps/web/src/app/floor-plan-3d/walk/walk-scene.ts`
- Create: `apps/web/src/app/floor-plan-3d/walk/walk-collision.spec.ts`
- Read: `apps/web/src/app/floor-plan-3d/room-model/collision.ts`
- Read: `apps/web/src/app/floor-plan-3d/room-model/types.ts`

**Interfaces:**
- Consumes: `WheretoputWall3D`, `PlacedFurniture`, and `getFurnitureFootprint(...)` from the existing room model.
- Produces: `WALK_COLLISION_RADIUS_METERS`, `WalkPoint`, `WalkBounds`, `WalkObstacle`, `WalkCollisionWorld`, `isWalkPointClear(...)`, `resolveWalkMovement(...)`, `findWalkSpawn(...)`, and `createFloorPlanWalkWorld(...)` for Tasks 2–3.

- [ ] **Step 1: Write the failing collision and scene-conversion tests**

Create `walk-collision.spec.ts` with exact fixtures for outer bounds, a solid wall, a doorway gap, a rotated obstacle, furniture, tunnelling prevention, sliding, and deterministic spawn repair:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import {
  WALK_COLLISION_RADIUS_METERS,
  findWalkSpawn,
  isWalkPointClear,
  resolveWalkMovement,
  type WalkCollisionWorld
} from "./walk-collision";
import { createFloorPlanWalkWorld } from "./walk-scene";

const emptyWorld: WalkCollisionWorld = {
  bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
  obstacles: []
};

describe("floor-plan walk collision", () => {
  it("uses the approved visitor radius", () => {
    assert.equal(WALK_COLLISION_RADIUS_METERS, 0.22);
  });

  it("blocks a circle at an axis-aligned wall and allows a doorway gap", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [
        { id: "left", center: { x: -0.75, z: 0 }, halfWidth: 0.75, halfDepth: 0.075, rotationY: 0 },
        { id: "right", center: { x: 0.75, z: 0 }, halfWidth: 0.25, halfDepth: 0.075, rotationY: 0 }
      ]
    };
    assert.equal(isWalkPointClear({ x: -0.8, z: 0.2 }, world), false);
    assert.equal(isWalkPointClear({ x: 0.2, z: 0.25 }, world), true);
  });

  it("blocks a rotated obstacle", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "diagonal", center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 0.1, rotationY: Math.PI / 4 }]
    };
    assert.equal(isWalkPointClear({ x: 0.45, z: 0.45 }, world), false);
    assert.equal(isWalkPointClear({ x: 0.8, z: -0.8 }, world), true);
  });

  it("substeps a long frame so movement cannot tunnel through a thin wall", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "wall", center: { x: 0, z: 0 }, halfWidth: 1.5, halfDepth: 0.05, rotationY: 0 }]
    };
    const next = resolveWalkMovement({ x: 0, z: 1 }, { x: 0, z: -2 }, world);
    assert.ok(next.z > WALK_COLLISION_RADIUS_METERS);
  });

  it("slides along a wall when the combined diagonal step is blocked", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "wall", center: { x: 0, z: 0 }, halfWidth: 2, halfDepth: 0.05, rotationY: 0 }]
    };
    const next = resolveWalkMovement({ x: -0.8, z: 0.5 }, { x: 0.6, z: -0.6 }, world);
    assert.ok(next.x > -0.8);
    assert.ok(next.z > WALK_COLLISION_RADIUS_METERS);
  });

  it("repairs an obstructed preferred spawn deterministically", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "center", center: { x: 0, z: 0 }, halfWidth: 0.3, halfDepth: 0.3, rotationY: 0 }]
    };
    const first = findWalkSpawn({ x: 0, z: 0 }, world);
    const second = findWalkSpawn({ x: 0, z: 0 }, world);
    assert.deepEqual(first, second);
    assert.ok(first);
    assert.equal(isWalkPointClear(first, world), true);
  });
});

describe("floor-plan walk scene adapter", () => {
  it("converts scaled wall and confirmed furniture footprints into obstacles", () => {
    const walls: WheretoputWall3D[] = [{
      id: "wall-1", wall_id: "wall-1", dimensions: { width: 2, height: 2.4, depth: 0.15 },
      position: [1, 1.2, -1], rotation: [0, Math.PI / 2, 0]
    }];
    const furniture: PlacedFurniture[] = [{
      id: "chair-1", furniture_id: "chair", name: "chair", color: "gray", length: [600, 900, 500],
      position: [0.5, 0, 0.75], rotation: [0, Math.PI / 4, 0], scale: 1, sizeMm: { width: 600, depth: 500, height: 900 }
    }];
    const world = createFloorPlanWalkWorld(walls, furniture, 2);
    assert.deepEqual(world.obstacles.find((item) => item.id === "wall:wall-1")?.center, { x: 2, z: -2 });
    assert.deepEqual(world.obstacles.find((item) => item.id === "furniture:chair-1")?.center, { x: 1, z: 1.5 });
    assert.equal(world.obstacles.length, 2);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/walk/walk-collision.spec.ts
```

Expected: FAIL because `walk-collision.ts` and `walk-scene.ts` do not exist.

- [ ] **Step 3: Implement the pure collision primitives**

Create `walk-collision.ts` with these public types/constants and algorithms:

```ts
export const WALK_COLLISION_RADIUS_METERS = 0.22;
export const WALK_MAX_SUBSTEP_METERS = 0.08;

export type WalkPoint = { x: number; z: number };
export type WalkBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type WalkObstacle = {
  id: string;
  center: WalkPoint;
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
};
export type WalkCollisionWorld = { bounds: WalkBounds; obstacles: WalkObstacle[] };

export declare function isWalkPointClear(
  point: WalkPoint,
  world: WalkCollisionWorld,
  radius = WALK_COLLISION_RADIUS_METERS
): boolean;

export declare function resolveWalkMovement(
  start: WalkPoint,
  delta: WalkPoint,
  world: WalkCollisionWorld,
  radius = WALK_COLLISION_RADIUS_METERS
): WalkPoint;

export declare function findWalkSpawn(
  preferred: WalkPoint,
  world: WalkCollisionWorld,
  radius = WALK_COLLISION_RADIUS_METERS
): WalkPoint | null;
```

Implementation requirements:

1. For circle/OBB collision, translate the point by `-obstacle.center`, rotate by `-rotationY`, clamp to `[-halfWidth, halfWidth] × [-halfDepth, halfDepth]`, and compare squared distance with `radius²`.
2. Check bounds using `min + radius` and `max - radius` before obstacle checks.
3. Split movement into `ceil(hypot(delta.x, delta.z) / 0.08)` equal steps.
4. For every step, try the combined X/Z point, then X-only, then Z-only. Retain the prior point if all candidates collide.
5. Search spawn candidates in this fixed order: preferred point, then square rings at `0.25`-metre increments through `3` metres, iterating `z` from negative to positive and `x` from negative to positive. Return the first clear point or `null`.

- [ ] **Step 4: Implement wall/furniture-to-world conversion**

Create `walk-scene.ts` with this interface:

```ts
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import { getFurnitureFootprint } from "../room-model/collision";
import type { WalkCollisionWorld, WalkObstacle } from "./walk-collision";

export declare function createFloorPlanWalkWorld(
  walls: readonly WheretoputWall3D[],
  furniture: readonly PlacedFurniture[],
  horizontalScale = 1
): WalkCollisionWorld;
```

Build wall obstacles from `position[0|2]`, `dimensions.width/depth`, and `rotation[1]`. Build furniture obstacles from `getFurnitureFootprint(item).width/depth`, `position`, and `rotation[1]`. Multiply centers and horizontal dimensions by `Math.max(0.1, horizontalScale)`. Compute bounds from all wall OBB corners; when there are no walls, return a zero-area bounds object so spawn selection fails safely instead of inventing a walkable room.

- [ ] **Step 5: Run the focused test and verify it passes**

Run the same focused command. Expected: all tests in `walk-collision.spec.ts` PASS.

- [ ] **Step 6: Run the existing room-model tests**

Run:

```bash
pnpm --filter web test:unit
```

Expected: PASS with no regression in furniture placement/collision tests.

- [ ] **Step 7: Commit the collision slice**

```bash
git add apps/web/src/app/floor-plan-3d/walk/walk-collision.ts apps/web/src/app/floor-plan-3d/walk/walk-scene.ts apps/web/src/app/floor-plan-3d/walk/walk-collision.spec.ts
git commit -m "feat: add floor plan walk collision"
```

---

### Task 2: Input Math and Pointer-Lock Walk Controller

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/walk/walk-input.ts`
- Create: `apps/web/src/app/floor-plan-3d/walk/walk-input.spec.ts`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/FloorPlanWalkControls.tsx`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/floor-plan-walk-controls.spec.ts`
- Read: `apps/web/src/app/splat-tour/tour-camera.tsx`

**Interfaces:**
- Consumes: `createFloorPlanWalkWorld(...)`, `findWalkSpawn(...)`, and `resolveWalkMovement(...)` from Task 1.
- Produces: `WalkInput`, `resolveWalkInputCode(...)`, `combineWalkInput(...)`, `cameraRelativeWalkDelta(...)`, `FloorPlanWalkControls`, and `FloorPlanWalkStatus` for Task 3.

- [ ] **Step 1: Write failing input-math tests**

Create `walk-input.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cameraRelativeWalkDelta, combineWalkInput, resolveWalkInputCode } from "./walk-input";

describe("walk input", () => {
  it("maps WASD and arrows to the same actions", () => {
    assert.equal(resolveWalkInputCode("KeyW"), "forward");
    assert.equal(resolveWalkInputCode("ArrowUp"), "forward");
    assert.equal(resolveWalkInputCode("KeyA"), "left");
    assert.equal(resolveWalkInputCode("ArrowRight"), "right");
    assert.equal(resolveWalkInputCode("Space"), null);
  });

  it("combines digital and analogue movement", () => {
    assert.deepEqual(combineWalkInput(new Set(["forward", "left"]), { forward: 0.25, strafe: 0.5 }), {
      forward: 1.25,
      strafe: -0.5
    });
  });

  it("normalizes diagonal movement and keeps it camera-relative", () => {
    const delta = cameraRelativeWalkDelta({ forward: 1, strafe: 1 }, { x: 0, z: -1 }, 2);
    assert.ok(Math.abs(Math.hypot(delta.x, delta.z) - 2) < 1e-9);
    assert.ok(delta.x > 0);
    assert.ok(delta.z < 0);
  });
});
```

- [ ] **Step 2: Write the failing walk-controller source contract test**

Create `floor-plan-walk-controls.spec.ts` that reads `FloorPlanWalkControls.tsx` and asserts all browser lifecycle contracts explicitly:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/room-scene/FloorPlanWalkControls.tsx"), "utf8");

describe("floor plan walk controls", () => {
  it("requests pointer lock only from a canvas click and observes lock lifecycle", () => {
    assert.match(source, /gl\.domElement\.addEventListener\("click"/);
    assert.match(source, /gl\.domElement\.requestPointerLock\(\)/);
    assert.match(source, /document\.addEventListener\("pointerlockchange"/);
    assert.match(source, /document\.addEventListener\("pointerlockerror"/);
    assert.match(source, /document\.addEventListener\("mousemove"/);
  });

  it("releases pointer lock and every global listener during cleanup", () => {
    assert.match(source, /document\.exitPointerLock\(\)/);
    for (const eventName of ["pointerlockchange", "pointerlockerror", "mousemove", "keydown", "keyup"]) {
      assert.match(source, new RegExp(`removeEventListener\\("${eventName}"`));
    }
  });

  it("uses the approved eye height, collision world, and frame-rate-independent movement", () => {
    assert.match(source, /const WALK_EYE_HEIGHT_METERS = 1\.45/);
    assert.match(source, /createFloorPlanWalkWorld/);
    assert.match(source, /resolveWalkMovement/);
    assert.match(source, /WALK_SPEED_METERS_PER_SECOND \* Math\.min\(delta, 0\.1\)/);
  });

  it("ignores movement keys from editable controls", () => {
    assert.match(source, /tagName === "input" \|\| tagName === "textarea" \|\| target\.isContentEditable/);
  });
});
```

- [ ] **Step 3: Run both focused tests and verify they fail**

```bash
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/walk/walk-input.spec.ts src/app/floor-plan-3d/room-scene/floor-plan-walk-controls.spec.ts
```

Expected: FAIL because the input module and controller do not exist.

- [ ] **Step 4: Implement the pure input helpers**

Create `walk-input.ts` with these exact exports:

```ts
import type { WalkPoint } from "./walk-collision";

export type WalkAction = "forward" | "backward" | "left" | "right";
export type WalkInput = { forward: number; strafe: number };

export declare function resolveWalkInputCode(code: string): WalkAction | null;
export declare function combineWalkInput(keys: ReadonlySet<WalkAction>, analogue: WalkInput | null): WalkInput;
export declare function cameraRelativeWalkDelta(input: WalkInput, forward: WalkPoint, distance: number): WalkPoint;
```

`cameraRelativeWalkDelta(...)` flattens and normalizes the camera forward vector, derives right as `{ x: -forward.z, z: forward.x }`, combines the axes, and normalizes only when vector length exceeds `1`. Keep the same W/S and A/D sign semantics as the existing splat `TourCamera`.

- [ ] **Step 5: Implement `FloorPlanWalkControls`**

Create the controller with this public contract:

```ts
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";

export type FloorPlanWalkStatus = "ready" | "locked" | "fallback" | "unavailable";

export type FloorPlanWalkControlsProps = {
  enabled: boolean;
  furnitureData: readonly PlacedFurniture[];
  horizontalScale: number;
  moveInputRef?: { current: { forward: number; strafe: number } } | null;
  onStatusChange?: (status: FloorPlanWalkStatus) => void;
  preferredSpawn: { x: number; z: number };
  wallsData: readonly WheretoputWall3D[];
};

export declare function FloorPlanWalkControls(props: FloorPlanWalkControlsProps): React.ReactNode;
```

Use `CameraControls` as the single camera rig so unlocked left-drag rotation remains the fallback. Configure its mouse/touch actions exactly as the existing splat camera: rotate only, with dolly/truck/wheel/two-finger actions disabled. Add the following behavior:

1. `useMemo` builds the collision world from confirmed furniture only.
2. `findWalkSpawn(...)` sets `[x, 1.45, z]` and a horizontal target one metre forward; `null` reports `unavailable` and disables movement.
3. A direct `gl.domElement` click calls `requestPointerLock()` only while enabled and not already locked.
4. `pointerlockchange` reports `locked` only when `document.pointerLockElement === gl.domElement`; otherwise it reports `ready`.
5. `pointerlockerror` reports `fallback` and leaves `CameraControls` drag rotation enabled.
6. Locked `mousemove` calls `controls.rotate(-event.movementX * 0.002, -event.movementY * 0.002, false)`.
7. Key handlers mirror the existing splat implementation and ignore input/textarea/contenteditable targets.
8. `useFrame` reads camera position/target, computes a flattened forward direction, combines digital and analogue input, caps frame delta with `Math.min(delta, 0.1)`, resolves collision, and applies the new position and translated target through `setLookAt(..., false)`.
9. Cleanup removes all listeners, clears key state, and calls `document.exitPointerLock()` only if this canvas owns the lock.

- [ ] **Step 6: Run both focused tests and verify they pass**

Run the Step 3 command. Expected: all input and controller source-contract tests PASS.

- [ ] **Step 7: Run TypeScript/web unit validation**

```bash
pnpm --filter web test:unit
pnpm --filter web build
```

Expected: both commands PASS; fix controller ref/event typings without weakening public types or using `any`.

- [ ] **Step 8: Commit the controller slice**

```bash
git add apps/web/src/app/floor-plan-3d/walk/walk-input.ts apps/web/src/app/floor-plan-3d/walk/walk-input.spec.ts apps/web/src/app/floor-plan-3d/room-scene/FloorPlanWalkControls.tsx apps/web/src/app/floor-plan-3d/room-scene/floor-plan-walk-controls.spec.ts
git commit -m "feat: add floor plan walk controls"
```

---

### Task 3: Switch the Shared Room Viewer Between Orbit and Walk

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts`
- Read: `apps/web/src/app/floor-plan-3d/room-scene/FloorPlanWalkControls.tsx`

**Interfaces:**
- Consumes: `FloorPlanWalkControls` and `FloorPlanWalkStatus` from Task 2.
- Produces: `RoomControlMode = "orbit" | "walk"` and new `RoomlogThreeFloorPlanView` props `controlMode`, `moveInputRef`, and `onWalkStatusChange` for Task 4.

- [ ] **Step 1: Add failing viewer-mode assertions**

Extend `listing-preview-presentation.spec.ts` with:

```ts
it("mounts exactly one camera controller for orbit or walk mode", () => {
  assert.match(viewerSource, /export type RoomControlMode = "orbit" \| "walk"/);
  assert.match(viewerSource, /controlMode === "walk" \? \(/);
  assert.match(viewerSource, /<FloorPlanWalkControls/);
  assert.match(viewerSource, /:\s*\(\s*<RoomOrbitControls/);
  assert.match(viewerSource, /controlMode === "orbit" \? \(\s*<RoomCameraAutoFit/);
});

it("makes the scene view-only and shows lock instructions in walk mode", () => {
  assert.match(viewerSource, /const sceneInteractive = controlMode === "orbit"/);
  assert.match(viewerSource, /walkStatus === "locked" \? null/);
  assert.match(viewerSource, /클릭하여 둘러보기/);
  assert.match(viewerSource, /WASD · 방향키 이동 · Esc 마우스 해제/);
  assert.match(viewerSource, /워킹뷰를 시작할 수 없습니다/);
});
```

- [ ] **Step 2: Run the focused viewer test and verify it fails**

```bash
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts
```

Expected: FAIL because the viewer has no control mode.

- [ ] **Step 3: Add the explicit viewer control-mode API**

In `RoomlogThreeFloorPlanView.tsx`, add:

```ts
export type RoomControlMode = "orbit" | "walk";
```

Add props with nonbreaking defaults:

```ts
controlMode = "orbit",
moveInputRef = null,
onWalkStatusChange,
```

and types:

```ts
controlMode?: RoomControlMode;
moveInputRef?: { current: { forward: number; strafe: number } } | null;
onWalkStatusChange?: (status: FloorPlanWalkStatus) => void;
```

Keep every existing caller in orbit mode until Task 4 opts the listing simulation into walk mode.

- [ ] **Step 4: Make camera and scene interaction mutually exclusive**

Inside the viewer:

1. Render `RoomCameraAutoFit` only in orbit mode so a resize cannot pull a walking camera back outside the room.
2. Render `FloorPlanWalkControls` in walk mode with confirmed `furnitureData`, scaled bounds, preferred spawn `{ x: wallBounds.centerX * sceneHorizontalScale, z: wallBounds.centerZ * sceneHorizontalScale }`, and the status callback.
3. Render `RoomOrbitControls` only in orbit mode.
4. Set `sceneInteractive = controlMode === "orbit"` and pass no-op/undefined floor, wall, and furniture pointer handlers while walking.
5. Suppress selected/pending furniture `<Html>` toolbars while walking.
6. Preserve the existing default orbit behavior for floor-plan editing, listing previews outside fullscreen simulation, and registration views.

- [ ] **Step 5: Render the walk-status overlay outside the Canvas**

Track local `walkStatus` initialized to `"ready"`, forward changes to `onWalkStatusChange`, and render token-styled semantic text after the Canvas:

```tsx
{controlMode === "walk" && walkStatus !== "locked" ? (
  <div className={`floor-plan-walk-instruction is-${walkStatus}`} role="status">
    <strong>{walkStatus === "unavailable" ? "워킹뷰를 시작할 수 없습니다" : "클릭하여 둘러보기"}</strong>
    <span>
      {walkStatus === "fallback"
        ? "마우스를 끌어 시선을 돌리고 WASD로 이동하세요."
        : "WASD · 방향키 이동 · Esc 마우스 해제"}
    </span>
  </div>
) : null}
```

- [ ] **Step 6: Run focused and full web unit tests**

```bash
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts
pnpm --filter web test:unit
```

Expected: PASS; existing listing preview and registration tests remain in orbit mode.

- [ ] **Step 7: Commit the viewer integration**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts
git commit -m "feat: switch floor plan camera modes"
```

---

### Task 4: Product Mode State and Pending-Furniture Transition Policy

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/property-shell.spec.mjs`
- Reuse: `apps/web/src/app/splat-tour/tour-joystick.tsx`

**Interfaces:**
- Consumes: `RoomControlMode`, `RoomlogThreeFloorPlanView.controlMode`, and walk status from Task 3.
- Produces: `SimulationMode = "walk" | "furniture"`, default walk state, accessible mode controls, and exact pending-draft transition behavior.

- [ ] **Step 1: Write failing source-contract tests for simulation state**

Add to `property-shell.spec.mjs`:

```js
test("opens the 3D simulation in walking view and switches to furniture mode explicitly", () => {
  assert.match(listingTourSource, /type SimulationMode = "walk" \| "furniture"/);
  assert.match(listingTourSource, /useState<SimulationMode>\("walk"\)/);
  assert.match(listingTourSource, /role="tablist"[\s\S]*?워킹뷰[\s\S]*?가구 배치/);
  assert.match(listingTourSource, /aria-selected=\{simulationMode === "walk"\}/);
  assert.match(listingTourSource, /controlMode=\{simulationMode === "walk" \? "walk" : "orbit"\}/);
  assert.match(listingTourSource, /<TourJoystick onChange=\{handleWalkJoystickChange\}/);
  assert.match(listingTourSource, /moveInputRef=\{walkMoveInputRef\}/);
});

test("cancels an unconfirmed furniture operation before entering walking view", () => {
  assert.match(
    listingTourSource,
    /function selectSimulationMode\(nextMode: SimulationMode\)[\s\S]*?if \(nextMode === "walk" && pendingFurniture\)[\s\S]*?cancelPendingFurniturePlacement\(\)/
  );
  assert.match(listingTourSource, /setSelectedFurnitureId\(null\)/);
  assert.match(listingTourSource, /setIsFurnitureDragging\(false\)/);
});
```

- [ ] **Step 2: Run the source test and verify it fails**

```bash
pnpm --filter web exec node --test property-shell.spec.mjs
```

Expected: FAIL because the product mode control does not exist.

- [ ] **Step 3: Replace the external furniture-open contract with simulation-open state**

In `ListingTourRoom3D`, rename the prop:

```ts
simulationOpen?: boolean;
```

Add:

```ts
type SimulationMode = "walk" | "furniture";
const [simulationMode, setSimulationMode] = useState<SimulationMode>("walk");
```

When `simulationOpen` changes to true, reset to walk mode, close the furniture drawer, clear selected furniture, and stop dragging. When it changes to false, cancel a pending operation through the existing cancellation function, close the drawer, and leave the component in orbit preview mode. The viewer receives:

```tsx
controlMode={simulationOpen && simulationMode === "walk" ? "walk" : "orbit"}
```

This preserves the non-fullscreen 3D hero preview as an orbit view.

- [ ] **Step 4: Implement mode transition policy**

Add this single transition entry point and use it from both mode buttons:

```ts
function selectSimulationMode(nextMode: SimulationMode) {
  if (nextMode === simulationMode) return;
  if (nextMode === "walk" && pendingFurniture) {
    cancelPendingFurniturePlacement();
  }
  setSelectedFurnitureId(null);
  setIsFurnitureDragging(false);
  setSimulationMode(nextMode);
  if (nextMode === "furniture") {
    openFurnitureEditor();
  } else {
    closeFurnitureEditor();
  }
}
```

Do not duplicate pending-origin restoration; `cancelPendingFurniturePlacement()` remains authoritative.

- [ ] **Step 5: Add the accessible mode switch and conditional furniture tools**

Render only while `simulationOpen`:

```tsx
<div className="simulation-mode-tabs" role="tablist" aria-label="3D 시뮬레이션 모드">
  <button
    aria-selected={simulationMode === "walk"}
    className={simulationMode === "walk" ? "active" : ""}
    onClick={() => selectSimulationMode("walk")}
    role="tab"
    type="button"
  >
    워킹뷰
  </button>
  <button
    aria-selected={simulationMode === "furniture"}
    className={simulationMode === "furniture" ? "active" : ""}
    onClick={() => selectSimulationMode("furniture")}
    role="tab"
    type="button"
  >
    가구 배치
  </button>
</div>
```

Render the existing hero furniture drawer/reopen control only when `simulationMode === "furniture"`. Leave all existing furniture catalog and save/reset code unchanged.

Reuse `TourJoystick` for coarse pointers without altering its implementation or the splat viewer. Add a stable movement ref and media-query state:

```ts
const walkMoveInputRef = useRef<WalkInput>({ forward: 0, strafe: 0 });
const [isCoarsePointer, setIsCoarsePointer] = useState(false);

useEffect(() => {
  const query = window.matchMedia("(pointer: coarse)");
  const sync = () => setIsCoarsePointer(query.matches);
  sync();
  query.addEventListener("change", sync);
  return () => query.removeEventListener("change", sync);
}, []);

function handleWalkJoystickChange(vector: TourJoystickVector | null) {
  walkMoveInputRef.current = vector ?? { forward: 0, strafe: 0 };
}
```

Pass `moveInputRef={walkMoveInputRef}` to `RoomlogThreeFloorPlanView`. Render `<TourJoystick onChange={handleWalkJoystickChange} />` only while the fullscreen simulation is open, `simulationMode === "walk"`, and `isCoarsePointer` is true. Reset the ref to `{ forward: 0, strafe: 0 }` whenever leaving walk mode or closing the simulation so a released/missing pointer-up cannot leave movement stuck.

- [ ] **Step 6: Run focused and unit tests**

```bash
pnpm --filter web exec node --test property-shell.spec.mjs
pnpm --filter web test:unit
```

Expected: PASS.

- [ ] **Step 7: Commit product mode behavior**

```bash
git add apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/property-shell.spec.mjs
git commit -m "feat: add 3d simulation modes"
```

---

### Task 5: Rename the Entry Point and Style the Fullscreen Experience

**Files:**
- Modify: `apps/web/src/app/_components/ListingDetailView.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `ListingTourRoom3D.simulationOpen` from Task 4 and the CSS class names introduced in Tasks 3–4.
- Produces: final user-facing naming/layout with unchanged `1인칭 투어` links.

- [ ] **Step 1: Update failing naming/nonregression assertions first**

Replace the old furniture-simulation assertions in `listing-preview-presentation.spec.ts` and add this property-shell assertion:

```js
test("renames only the floor-plan entry to 3D simulation and preserves the splat tour", () => {
  assert.match(listingDetailViewSource, /3D 시뮬레이션/);
  assert.doesNotMatch(listingDetailViewSource, /가구배치 시뮬레이션/);
  assert.match(listingDetailViewSource, /href=\{`\/splat-tour\?asset=\$\{splatAssetId\}`\}/);
  assert.match(listingDetailViewSource, />\s*1인칭 투어\s*</);
  assert.match(listingDetailViewSource, /이 매물은 1인칭 투어가 준비되어 있지 않습니다/);
});
```

The updated TypeScript source test must expect `is3DSimulationOpen`, `is-3d-simulation-open`, `aria-label="3D 시뮬레이션 닫기"`, and `simulationOpen={is3DSimulationOpen}`.

- [ ] **Step 2: Run both source suites and verify they fail**

```bash
pnpm --filter web exec node --test property-shell.spec.mjs
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts
```

Expected: FAIL on the old names/contracts.

- [ ] **Step 3: Rename the listing-detail state, copy, classes, and props**

In `ListingDetailView.tsx`:

- Rename `isFurnitureSimulationOpen`/`setIsFurnitureSimulationOpen` to `is3DSimulationOpen`/`setIs3DSimulationOpen`.
- Rename `is-furniture-simulation-open` to `is-3d-simulation-open`.
- Change the entry button, dialog accessible name, close accessible name, and visible supporting copy from `가구배치 시뮬레이션` to `3D 시뮬레이션`.
- Pass `simulationOpen={is3DSimulationOpen}`.
- Keep all `/splat-tour` hrefs, `splatAssetId`, `splatChecked`, `1인칭 투어`, and the unavailable note unchanged.

- [ ] **Step 4: Add token-only mode and instruction styling**

Add styles for these selectors using existing variables such as `var(--surface)`, `var(--surface-container)`, `var(--on-surface)`, `var(--on-surface-variant)`, `var(--primary)`, `var(--on-primary)`, `var(--border)`, and `var(--shadow)`:

```css
.simulation-mode-tabs {
  position: absolute;
  z-index: 42;
  top: 20px;
  left: 50%;
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-container);
  box-shadow: var(--shadow-soft);
  transform: translateX(-50%);
}

.simulation-mode-tabs button {
  min-height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--on-surface-variant);
  font: inherit;
  font-weight: 800;
}

.simulation-mode-tabs button.active {
  background: var(--primary);
  color: var(--on-primary);
}

.floor-plan-walk-instruction {
  position: absolute;
  z-index: 20;
  top: 50%;
  left: 50%;
  display: grid;
  gap: 6px;
  max-width: min(360px, calc(100% - 40px));
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface-container);
  box-shadow: var(--shadow);
  color: var(--on-surface);
  text-align: center;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.floor-plan-walk-instruction span,
.floor-plan-walk-instruction.is-fallback span,
.floor-plan-walk-instruction.is-unavailable span {
  color: var(--on-surface-variant);
}

.is-3d-simulation-open {
  position: fixed;
  inset: 0;
  height: 100dvh;
}

.is-3d-simulation-open .listing-tour-room3d.hero-panel-open .floor-plan-3d-preview {
  right: 340px;
}

.is-3d-simulation-open .hero-stage .hero-furniture-drawer {
  right: 0;
  bottom: 0;
  width: 340px;
  max-height: none;
}
```

Required layout behavior:

- The mode tabs sit at the fullscreen simulation's top centre and remain above the Canvas but below the close button.
- The walk instruction is centred over the viewport, uses `pointer-events: none`, and disappears while locked.
- Furniture mode retains the current 340-pixel desktop sidebar and full remaining canvas width.
- Walk mode has no right sidebar and uses the full viewport.
- At the existing mobile breakpoint, tabs remain reachable below the close control, the instruction text wraps, and furniture mode retains its current mobile drawer behavior.
- Rename all existing fullscreen selectors from `.is-furniture-simulation-open` to `.is-3d-simulation-open`; do not leave duplicate old selectors.

- [ ] **Step 5: Run source suites and raw-color scan**

```bash
pnpm --filter web exec node --test property-shell.spec.mjs
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts
if git diff -U0 -- apps/web/src/app/globals.css | rg -q '^\+.*#[0-9a-fA-F]{3,8}'; then
  echo "Unexpected raw color added to globals.css"
  exit 1
fi
```

Expected: tests PASS and the raw-color scan prints no new matches.

- [ ] **Step 6: Build the web app**

```bash
pnpm --filter web build
```

Expected: PASS with no TypeScript, Next.js, or CSS build error.

- [ ] **Step 7: Commit naming and presentation**

```bash
git add apps/web/src/app/_components/ListingDetailView.tsx apps/web/src/app/globals.css apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts apps/web/property-shell.spec.mjs
git commit -m "feat: present 3d simulation walking view"
```

---

### Task 6: Full Verification and Browser Acceptance

**Files:**
- Modify only if verification exposes a defect in files already scoped by Tasks 1–5.

**Interfaces:**
- Consumes: the complete implementation from Tasks 1–5.
- Produces: verified Docker/browser behavior and a clean repository state ready for review.

- [ ] **Step 1: Run the complete web test suite**

```bash
pnpm test:web
```

Expected: PASS for `property-shell.spec.mjs` and all TypeScript unit specs.

- [ ] **Step 2: Run repository verification**

```bash
bash scripts/verify.sh
```

Expected: shared types, UI, web, and API builds pass and the API smoke check completes.

- [ ] **Step 3: Rebuild the standard web container**

```bash
docker compose up -d --build web
docker compose logs --tail=120 web
```

Expected: the web container starts on port 3000 without compilation or runtime startup errors.

- [ ] **Step 4: Verify the target listing in a real browser**

Open `http://localhost:3000/listing/TRADE-35c56cce` and verify all of the following in order:

1. The separate `1인칭 투어` control still reflects splat availability and does not open the floor-plan simulation.
2. The floor-plan entry says `3D 시뮬레이션`.
3. Opening it selects `워킹뷰` and shows `클릭하여 둘러보기`.
4. A canvas click locks the mouse; mouse movement changes yaw/pitch; W/A/S/D and arrows move relative to view.
5. Escape releases the pointer without closing; the instruction returns.
6. Outer and internal walls cannot be crossed, doorway gaps can be crossed, and diagonal contact slides.
7. Confirmed furniture cannot be crossed.
8. `가구 배치` restores the existing orbit/editor UI and all add/move/rotate/delete/save/reset controls work.
9. Switching to walk mode during a new pending item removes it; switching while re-editing restores its confirmed position.
10. A confirmed furniture edit appears in walk mode and changes the collision obstacle immediately.
11. Closing during pointer lock releases it.
12. At the mobile breakpoint, touch-drag look and analogue movement remain usable and the mode tabs/close button do not overlap.

- [ ] **Step 5: Inspect browser console and network failures**

Expected: no uncaught pointer-lock error, React state/update warning, duplicate camera-control warning, failed GLB request beyond existing handled fallbacks, or hydration error.

- [ ] **Step 6: Review the final diff and commit any verification-only repair**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files. If Steps 1–5 required a scoped repair, rerun the failing command/browser check and commit only that repair:

```bash
git add apps/web/src/app/floor-plan-3d apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/_components/ListingDetailView.tsx apps/web/src/app/globals.css apps/web/property-shell.spec.mjs
git commit -m "fix: stabilize 3d simulation walk mode"
```
