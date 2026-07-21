# Furniture Orbit WASD Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add camera-relative WASD/arrow translation to the full-screen listing furniture-placement orbit camera while preserving its drag rotation and furniture interactions.

**Architecture:** Reuse the existing walk-input action mapping and camera-relative vector math through a small orbit-specific pure module that adds frame-delta limiting and interactive-target protection. Extend the existing `RoomOrbitControls` to own held keys and translate both camera and orbit target, then enable it explicitly only from the full-screen furniture simulation.

**Tech Stack:** Next.js 16, React 19, React Three Fiber, Drei OrbitControls, Three.js, Node test runner, TypeScript.

## Global Constraints

- Enable keyboard translation only in full-screen `3D 시뮬레이션 > 가구 배치`.
- Preserve the current pointer-lock/collision controller and copy in `워킹뷰`.
- Preserve furniture selection, placement, drag, rotate, delete, restore, and save behavior.
- Pause camera input whenever the existing `controlsEnabled` prop is false during active furniture dragging.
- Move only on X/Z; keep camera height, pitch, yaw, zoom distance, and camera-to-target offset unchanged.
- Do not add collision, pointer lock, vertical flight, mobile joystick, dependencies, server APIs, or persistence changes.
- Do not consume movement keys from inputs, textareas, selects, buttons, links, or content-editable elements.
- Use the existing `.floor-3d-hint` styling and UI tokens; add no raw visual values.

---

### Task 1: Pure orbit keyboard movement

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/room-scene/orbit-keyboard-movement.ts`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/orbit-keyboard-movement.spec.ts`

**Interfaces:**
- Consumes: `WalkAction`, `WalkPoint`, `combineWalkInput`, and `cameraRelativeWalkDelta` from the existing walk modules.
- Produces: `ORBIT_MOVE_SPEED_METERS_PER_SECOND`, `ORBIT_MAX_FRAME_DELTA_SECONDS`, `isOrbitKeyboardInteractiveTarget(target)`, and `orbitKeyboardMovementDelta(keys, forward, frameDeltaSeconds)`.

- [ ] **Step 1: Write the failing pure tests**

Test the wished-for API with Node's real assertion library:

```ts
assert.deepEqual(
  orbitKeyboardMovementDelta(new Set(["forward"]), { x: 0, z: -1 }, 0.5),
  { x: 0, z: -ORBIT_MOVE_SPEED_METERS_PER_SECOND * ORBIT_MAX_FRAME_DELTA_SECONDS }
);

const diagonal = orbitKeyboardMovementDelta(new Set(["forward", "right"]), { x: 0, z: -1 }, 0.1);
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - ORBIT_MOVE_SPEED_METERS_PER_SECOND * 0.1) < 1e-9);

assert.deepEqual(
  orbitKeyboardMovementDelta(new Set(["forward", "backward"]), { x: 0, z: -1 }, 0.1),
  { x: 0, z: 0 }
);

assert.equal(isOrbitKeyboardInteractiveTarget({ tagName: "INPUT" }), true);
assert.equal(isOrbitKeyboardInteractiveTarget({ tagName: "BUTTON" }), true);
assert.equal(isOrbitKeyboardInteractiveTarget({ isContentEditable: true }), true);
assert.equal(isOrbitKeyboardInteractiveTarget({ tagName: "CANVAS" }), false);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --require ts-node/register --test src/app/floor-plan-3d/room-scene/orbit-keyboard-movement.spec.ts
```

Expected: FAIL because `./orbit-keyboard-movement` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Implement the constants and functions using the existing walk math:

```ts
export const ORBIT_MOVE_SPEED_METERS_PER_SECOND = 3;
export const ORBIT_MAX_FRAME_DELTA_SECONDS = 0.1;

export function orbitKeyboardMovementDelta(
  keys: ReadonlySet<WalkAction>,
  forward: WalkPoint,
  frameDeltaSeconds: number
): WalkPoint {
  const input = combineWalkInput(keys, null);
  const distance = ORBIT_MOVE_SPEED_METERS_PER_SECOND
    * Math.min(Math.max(frameDeltaSeconds, 0), ORBIT_MAX_FRAME_DELTA_SECONDS);
  return cameraRelativeWalkDelta(input, forward, distance);
}
```

Implement `isOrbitKeyboardInteractiveTarget` as a structural guard for `INPUT`, `TEXTAREA`, `SELECT`, `BUTTON`, and `A`, plus `isContentEditable` and content-editable ancestors via `closest`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: all orbit keyboard movement tests PASS with no warnings.

- [ ] **Step 5: Commit the pure movement unit**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene/orbit-keyboard-movement.ts apps/web/src/app/floor-plan-3d/room-scene/orbit-keyboard-movement.spec.ts
git commit -m "test: define furniture orbit keyboard movement"
```

---

### Task 2: OrbitControls integration and full-screen furniture wiring

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/orbit-keyboard-controls.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts`

**Interfaces:**
- Consumes: Task 1's `isOrbitKeyboardInteractiveTarget` and `orbitKeyboardMovementDelta`, plus the existing `resolveWalkInputCode`.
- Produces: viewer prop `orbitKeyboardMoveEnabled?: boolean`; `RoomOrbitControls` prop `keyboardMoveEnabled?: boolean`.

- [ ] **Step 1: Write failing component/source-contract tests**

Assert the intended contracts before modifying production components:

```ts
assert.match(viewerSource, /orbitKeyboardMoveEnabled\?: boolean/);
assert.match(viewerSource, /keyboardMoveEnabled=\{orbitKeyboardMoveEnabled\}/);
assert.match(viewerSource, /camera\.position\.x \+= delta\.x/);
assert.match(viewerSource, /controls\.target\.x \+= delta\.x/);
assert.match(viewerSource, /window\.addEventListener\("blur"/);
assert.match(viewerSource, /window\.removeEventListener\("blur"/);
assert.match(listingSource, /orbitKeyboardMoveEnabled=\{simulationOpen && simulationMode === "furniture"\}/);
assert.match(viewerSource, /WASD 이동 · 드래그 회전/);
```

Retain the existing assertions proving that walk mode alone mounts `FloorPlanWalkControls` and passive previews do not opt into keyboard orbit movement.

- [ ] **Step 2: Run the focused tests and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --require ts-node/register --test src/app/floor-plan-3d/room-scene/orbit-keyboard-controls.spec.ts src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts
```

Expected: FAIL because the viewer prop, controller wiring, and furniture hint do not exist.

- [ ] **Step 3: Add held-key lifecycle to `RoomOrbitControls`**

- Add a ref to the Drei OrbitControls instance and a `Set<WalkAction>` ref.
- Add `keydown`, `keyup`, and `blur` listeners only when `enabled && keyboardMoveEnabled`.
- On keydown, resolve the action, reject interactive targets, prevent default only for consumed movement keys, and add the action.
- On keyup, remove the action regardless of current focus; on blur, disable, or cleanup, clear the set.
- In `useFrame`, obtain the camera forward vector, call `orbitKeyboardMovementDelta`, add the same X/Z delta to `camera.position` and `controls.target`, update controls, and invalidate.
- Replace the continuously controlled `target` prop with an effect keyed by target X/Y/Z primitives so unrelated furniture rerenders do not reset a translated orbit target.

- [ ] **Step 4: Wire the full-screen furniture scope and hint**

Add to the listing viewer call:

```tsx
orbitKeyboardMoveEnabled={simulationOpen && simulationMode === "furniture"}
```

Forward the optional viewer prop only to orbit controls. Render:

```tsx
{orbitKeyboardMoveEnabled ? (
  <span className="floor-3d-hint">WASD 이동 · 드래그 회전</span>
) : hideHint ? null : (
  <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>
)}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command plus Task 1's focused test.

Expected: all focused tests PASS.

- [ ] **Step 6: Run broader web and repository verification**

```bash
pnpm --filter web test:unit
pnpm --filter web build
bash scripts/verify.sh
```

Expected: all commands exit 0; `scripts/verify.sh` reports types, UI, web, API, and API smoke checks passed.

- [ ] **Step 7: Commit the integration**

```bash
git add apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/floor-plan-3d/room-scene/orbit-keyboard-controls.spec.ts apps/web/src/app/floor-plan-3d/room-scene/listing-preview-presentation.spec.ts docs/superpowers/plans/2026-07-21-furniture-orbit-wasd-movement.md
git commit -m "feat: add WASD movement to furniture camera"
```
