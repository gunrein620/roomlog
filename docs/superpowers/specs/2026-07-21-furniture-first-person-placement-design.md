# Furniture First-Person Placement Controls

## Goal

Replace the full-screen `3D 시뮬레이션 > 가구 배치` mode's orbit-style mouse interaction with a desktop first-person placement workflow. The mouse controls the view, WASD moves through the scene at twice the current furniture-mode speed, `E` enters furniture interaction or picks up an aimed existing item, and `Q` fixes the carried item at the current target position.

`워킹뷰` and the separate first-person splat viewer remain unchanged. The passive listing preview, registration views, and touch-device controls also keep their current behavior.

## Desktop Interaction States

The furniture simulation uses three explicit states so camera look and furniture manipulation never compete for the same pointer movement.

### Explore

- The canvas owns pointer lock, the cursor is hidden, and raw mouse movement changes yaw and pitch.
- WASD and arrow keys move relative to the camera's horizontal heading.
- Furniture-mode movement speed is `6 m/s`, twice the existing `3 m/s` orbit-keyboard speed.
- A centered reticle indicates the current aim.
- If the reticle targets an already placed furniture item, pressing `E` picks it up immediately and enters Carry.
- If no placed furniture is targeted, pressing `E` releases pointer lock, shows the cursor, and enters Select.

### Select

- The existing furniture drawer and controls remain clickable with a visible cursor.
- Selecting a catalog item creates a pending furniture draft, restores pointer lock from that user gesture, and enters Carry.
- Clicking an existing placed item may still select it for the existing toolbar actions as a mouse-accessible fallback.
- Clicking the 3D canvas without choosing an item returns to Explore and requests pointer lock.
- Pressing `E` or `Esc` returns to Explore without creating a pending item.

### Carry

- Pointer lock and first-person mouse look are active.
- Each frame, a ray from the screen centre is intersected with the room placement surface. The pending furniture follows the valid X/Z intersection while preserving its current Y position and rotation.
- Existing wall-crossing and placement guards remain authoritative. An invalid ray or blocked move leaves the furniture at its last valid position.
- Pressing `Q` finalizes the pending item at its current valid position and returns to Explore. Until the item has received at least one valid center-ray placement point, `Q` is ignored and the hint asks the user to aim at the floor.
- Pressing `Esc` cancels a new item or restores a moved existing item to its original state, then returns to Explore.
- Existing rotate, delete, cancel, and confirm toolbar buttons remain available after entering Select as a fallback. `Q` invokes the same confirmation path as the current check button.

## Existing Furniture Repositioning

Placed furniture participates in center-screen aiming while in Explore. The nearest visible furniture hit by the center ray is highlighted. `E` calls the existing reopen/move path for that item, preserving its source and original state for cancellation. `Q` then uses the same finalization path as a newly selected catalog item.

Aim selection is limited to placed furniture. Floors and walls do not become selectable objects, and furniture hidden behind a closer wall is not considered aimed because the ray uses the scene's nearest visible intersection.

## Architecture

### First-person furniture controller

Add a dedicated controller for the full-screen desktop furniture mode rather than extending `OrbitControls` further. It owns:

- pointer-lock lifecycle and mouse-look yaw/pitch;
- WASD/arrow held-key state and frame-delta-bounded movement;
- center-screen raycasting for the placement point and aimed furniture;
- `E`, `Q`, and `Esc` dispatch according to the current interaction state;
- cleanup of pointer lock, listeners, and held keys on mode changes or unmount.

The controller reports semantic events to `ListingTourRoom3D`: enter/leave Select, pick up an aimed furniture ID, update a pending placement point, confirm, and cancel. Furniture data mutation remains in `ListingTourRoom3D`, where the current placement, collision, source-preservation, and persistence rules already live.

Pure keyboard/state helpers should be separated from React Three Fiber bindings so transition and input rules can be unit tested directly.

### Viewer and scene wiring

`RoomlogThreeFloorPlanView` receives an explicit furniture first-person flag and the semantic callbacks required by the controller. The new controller replaces `RoomOrbitControls` only when all of these are true:

1. the listing simulation is open;
2. `가구 배치` is active;
3. the device has a fine pointer and keyboard;
4. the view is not a passive preview.

Other orbit-camera consumers retain the current controls. The existing furniture mesh pointer handlers and floating toolbars remain active in Select/fallback interaction but must not consume locked-pointer look movements.

### Camera and movement

Movement translates only the camera on X/Z at `6 m/s`; eye height remains fixed during first-person furniture control. Diagonal input is normalized and frame delta is capped to prevent background-tab jumps. This editor camera remains unconstrained by wall or furniture collision, matching the current furniture-mode movement policy.

Pitch is clamped below vertical singularities. The initial camera orientation is derived from the current room-fit camera and remains stable across Explore, Select, and Carry transitions.

## Input Guardrails

- Shortcuts do nothing while focus is in an input, textarea, select, button, link, or content-editable element.
- `E` and `Q` suppress browser defaults only when the furniture controller consumes them.
- Key auto-repeat does not cause duplicate pick-up or confirmation actions.
- Held movement keys clear on blur, pointer-lock loss, mode change, controller disable, and unmount.
- Pointer lock is requested only from a user gesture, including a canvas click or catalog-item click.
- Failure or denial of pointer lock leaves Select mode usable with the current mouse-based controls and displays a concise fallback instruction.
- Coarse-pointer devices keep the current drag/orbit and touch placement flow; keyboard-first instructions are not shown there.

## Presentation

- Explore displays a small centered reticle and the hint `WASD 이동 · 마우스 시점 · E 가구 선택`.
- When an existing item is aimed, its highlight and hint make `E` discoverable.
- Carry displays `Q 고정 · Esc 취소` and keeps the pending furniture visually distinct.
- Select displays the normal cursor and the existing furniture drawer.
- Existing token-based styles are reused; no raw color values are introduced.

## Verification

### Unit tests

- Explore + `E` with an aimed furniture ID emits pick-up and enters Carry.
- Explore + `E` without an aimed item enters Select.
- Select + `E` or `Esc` returns to Explore.
- Carry + `Q` emits confirm and returns to Explore.
- Carry + `Esc` emits cancel/restore and returns to Explore.
- Repeated shortcut keydown events do not duplicate actions.
- Editable elements suppress shortcuts.
- Furniture movement speed is exactly `6 m/s`; diagonal input and frame-delta bounds remain correct.

### Component tests

- The dedicated controller mounts only in the full-screen desktop furniture mode.
- Pointer-lock mouse movement updates camera yaw and pitch.
- Center ray reports the nearest visible placed furniture and a valid floor placement point.
- Pending furniture follows valid ray points without bypassing the existing wall-crossing guard.
- Catalog selection transitions Select to Carry and requests pointer lock from the selection gesture.
- Existing item `E` pick-up preserves origin/source, while `Esc` restores it and `Q` finalizes it.
- Hints and reticle reflect Explore, Select, and Carry states.
- Walk mode, passive previews, and coarse-pointer behavior do not change.

### Manual Docker verification

- Start the standard Docker Compose stack and open a listing's full-screen 3D simulation.
- Enter furniture mode and verify pointer-lock free look, fixed-height WASD movement, and the doubled speed.
- Press `E` on empty space, choose a catalog item, aim at several valid positions, and press `Q` to fix it.
- Aim at an existing item, press `E`, move it, test both `Esc` restore and `Q` confirmation.
- Verify walls occlude furniture aim and blocked placement keeps the last valid position.
- Type into catalog search and verify shortcuts do not fire.
- Verify the existing button workflow still works in Select and touch/orbit behavior remains unchanged.
- Finish with focused web tests, a web production build, and `bash scripts/verify.sh`.

## Non-goals

- Changing `워킹뷰`, splat-viewer controls, furniture persistence, catalog data, or server APIs.
- Adding physics, gravity, jumping, running, wall collision, or vertical flight to furniture mode.
- Replacing the existing touch workflow with keyboard controls.
- Adding multiplayer placement or server-synchronized editing.
