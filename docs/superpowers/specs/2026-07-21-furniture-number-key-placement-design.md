# Furniture Number-Key Placement Controls

## Goal

Fix catalog furniture that cannot be confirmed reliably with `Q`, and make desktop furniture placement use explicit number-key controls without removing aimed existing-furniture pickup.

## Controls

- Explore: `E` picks up only the existing furniture under the center reticle.
- Any furniture state: `2` releases pointer lock and opens the furniture sidebar with a visible cursor.
- Carry: pressing `2` first cancels a new draft or restores an existing item, then opens the sidebar.
- Select: clicking a catalog item starts Carry and requests pointer lock from that click.
- Carry: `1`/numpad `1` rotates left 90 degrees; `3`/numpad `3` rotates right 90 degrees.
- Carry: `Q` confirms the visible ghost at its last valid placement point.
- Carry: `Esc` keeps the existing cancel/restore behavior.
- Select: `2` or `Esc` returns to Explore.

Shortcut key repeats and events originating from inputs, textareas, selects, buttons, links, or content-editable elements are ignored.

## Root Cause and Fix

Catalog drafts set `pendingFurniturePlacedOnceRef` to `false`, while existing furniture picked up with `E` sets it to `true`. The `Q` shortcut rejects a draft until a center ray reports a valid floor point. A catalog selection can therefore return to Carry without a valid placement update, leaving `Q` permanently blocked until the camera happens to acquire another valid floor hit.

The controller will continuously retain the latest valid center-ray floor point while the furniture controller is active, including Explore and Select. The viewer reports that point to `ListingTourRoom3D`, which stores it in a ref. Catalog selection immediately seeds the new draft through the existing `placePendingFurniture` path using that point before requesting pointer lock. This sets the same placement-valid state that existing furniture already has without allowing an unpositioned origin draft to be confirmed.

If no valid floor point has ever been observed, the draft remains unconfirmed and the current guidance asks the user to aim at the floor. Wall occlusion and the existing wall-crossing guard remain authoritative.

## Architecture

### Pure shortcut resolver

Extend `furniture-first-person-input.ts` so it maps:

- `Digit2` and `Numpad2` to `open-select` from Explore or Carry and `close-select` from Select;
- `Digit1` and `Numpad1` to `rotate-left` only in Carry;
- `Digit3` and `Numpad3` to `rotate-right` only in Carry;
- `KeyE` to `pickup-aimed` only when Explore has an aimed furniture ID;
- `KeyQ` and `Escape` to the existing confirm/cancel commands.

The resolver remains the single source for repeat and interactive-target guards.

### Controller callbacks

`FurnitureFirstPersonControls` adds semantic callbacks for left/right rotation and latest placement-point reporting. `open-select` from Carry calls the parent cancel/restore callback before opening Select. Floor raycasting continues while active, but pending furniture movement is emitted only during Carry; the last valid floor point is emitted in all modes.

### Parent integration

`ListingTourRoom3D` stores the last valid floor point in a ref. Both default-catalog and tenant-furniture click handlers create their draft, seed it at the stored point through the existing collision-aware placement function, enter Carry, and synchronously request pointer lock. Parent rotation callbacks reuse `rotatePendingFurniture`.

No persistence format, catalog model, server API, walk mode, splat viewer, passive preview, or touch workflow changes.

## Presentation

- Explore hint: `E 기존 가구 이동 · 2 가구 선택` when aimed, otherwise `2 가구 선택 · WASD 이동 · 마우스 시점`.
- Select hint: `가구를 선택하세요 · 2 또는 Esc 닫기`.
- Carry hint: `1 왼쪽 회전 · 2 다시 선택 · 3 오른쪽 회전 · Q 고정`.
- Existing reticle, pointer-lock fallback, and token-based styling remain unchanged.

## Verification

- Pure tests cover top-row and numpad `1/2/3`, state-specific behavior, repeat suppression, editable targets, `E`, `Q`, and `Esc`.
- Integration tests verify Carry `2` cancels/restores before opening Select, catalog selection consumes the stored floor point, and `1/3` reach existing rotation logic.
- Existing first-person, orbit, walk, floating-toolbar, and listing-preview tests remain green.
- Run the focused tests, web production build, and `bash scripts/verify.sh` before pushing `main`.

## Non-goals

- Choosing catalog entries directly by number.
- Continuous free-angle rotation or changing the 90-degree rotation step.
- Confirming a catalog draft that has never received a valid placement point.
- Changing mobile/touch controls.
