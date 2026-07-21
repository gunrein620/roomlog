# Furniture Number-Key Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `2` open furniture selection, `1/3` rotate a carried item, and make catalog furniture reliably acquire a valid position before `Q` confirmation.

**Architecture:** Extend the pure shortcut resolver first, then let the first-person controller report the latest valid floor aim and semantic rotation commands. `ListingTourRoom3D` stores that point and reuses its existing collision-aware placement, rotation, cancel/restore, and confirm functions.

**Tech Stack:** React 19, TypeScript 5.9, React Three Fiber, Three.js, Node test runner.

## Global Constraints

- Desktop full-screen furniture mode only; keep walk, splat, passive preview, and touch flows unchanged.
- Support both top-row and numpad `1`, `2`, and `3`.
- `E` picks up only an aimed existing furniture item.
- `2` during Carry cancels/restores before opening Select.
- Do not confirm a draft without a valid floor placement point.
- Reuse existing 90-degree rotation and wall-crossing logic.

---

### Task 1: Number-key shortcut contract

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-input.ts`

**Interfaces:**
- Produces `rotate-left` and `rotate-right` shortcut actions and state-aware `Digit1/2/3` plus `Numpad1/2/3` mappings.

- [ ] Add failing tests asserting Explore `2 -> open-select`, Select `2 -> close-select`, Carry `2 -> open-select`, Carry `1/3 -> rotate-left/right`, numpad parity, and empty-space `E -> null`.
- [ ] Run the single spec directly and verify the new assertions fail.
- [ ] Extend `FurnitureShortcutAction` and `resolveFurnitureShortcut` with the exact mappings while retaining repeat/editable-target guards.
- [ ] Run the spec and verify all assertions pass.
- [ ] Commit with `feat: add furniture number-key shortcuts`.

### Task 2: Retain floor aim and connect rotation

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/FurnitureFirstPersonControls.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`

**Interfaces:**
- Add `onLatestPlacementPoint(point)`, `onRotateLeft()`, and `onRotateRight()` semantic callbacks through controller and viewer props.

- [ ] Add failing source-contract assertions for the three callbacks, `open-select` cancelling Carry before opening Select, and the new state-specific hints.
- [ ] Run the controller spec and verify the new assertions fail.
- [ ] During every active frame, report the first valid non-occluded floor point through `onLatestPlacementPoint`; keep moving the pending draft only in Carry.
- [ ] Dispatch `rotate-left/right` from the controller, and dispatch Carry `open-select` as `onCancel()` followed by `onOpenSelect()`.
- [ ] Wire the callbacks and update hints in `RoomlogThreeFloorPlanView`.
- [ ] Run input/controller specs and verify they pass.
- [ ] Commit with `feat: add number-key furniture controls`.

### Task 3: Seed catalog drafts and verify

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts`
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`

**Interfaces:**
- Store `lastFurniturePlacementPointRef` and provide parent handlers to Task 2 callbacks.

- [ ] Add failing assertions that both catalog handlers seed through a dedicated helper using `lastFurniturePlacementPointRef`, rotation callbacks reuse `rotatePendingFurniture`, and Carry `2` uses cancel/restore before Select.
- [ ] Run the focused integration spec and verify failure.
- [ ] Extract `startCatalogFurnitureCarry(draft)` to set the pending draft, apply the stored point through the same collision-aware move calculation, set placement validity, enter Carry, and request pointer lock.
- [ ] Wire latest-point and rotation props; update save messages to describe `1/2/3/Q` controls.
- [ ] Run the focused 3D regression suite and verify it passes.
- [ ] Run `pnpm --filter web build` and `bash scripts/verify.sh`.
- [ ] Commit any verification fix, confirm clean `main`, fetch `origin/main`, and push only when the remote is not ahead.
