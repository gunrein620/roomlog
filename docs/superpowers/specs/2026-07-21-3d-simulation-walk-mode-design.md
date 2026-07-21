# 3D Simulation Walk Mode

## Goal

Rename the listing-detail `가구배치 시뮬레이션` entry point to `3D 시뮬레이션` and make it a two-mode experience over the existing floor-plan scene:

- `워킹뷰`: the default mode, with FPS-style mouse look and keyboard movement.
- `가구 배치`: the existing furniture catalog and placement workflow.

The existing photorealistic first-person splat tour remains a separate feature and route. This change does not replace, merge, rename, or weaken the splat asset gate.

## User Experience

### Entry and naming

- Every listing-detail control, accessible label, dialog title, and supporting copy that currently names this floor-plan feature `가구배치 시뮬레이션` becomes `3D 시뮬레이션`.
- Opening `3D 시뮬레이션` continues to use the existing full-screen floor-plan simulation surface.
- A persistent two-option mode control appears inside the simulation: `워킹뷰` and `가구 배치`.
- `워킹뷰` is selected every time a newly opened simulation session starts. Reopening the simulation does not restore the mode from a previous session.

### Walk mode

- The initial camera is placed at a valid walkable point at an eye height of 1.45 metres.
- Before pointer lock, the canvas displays a concise `클릭하여 둘러보기` instruction together with the WASD and Escape controls.
- Clicking the walk viewport requests pointer lock. While locked:
  - mouse movement changes yaw and pitch without holding a mouse button;
  - `W`, `A`, `S`, and `D` move relative to the horizontal viewing direction;
  - arrow keys mirror WASD for accessibility;
  - `Escape` releases pointer lock but does not close the simulation.
- Running, jumping, crouching, vertical flight, and scroll-wheel zoom are not included.
- Pitch is clamped before the camera can flip. Movement speed is frame-rate independent and diagonal movement is normalized.
- If pointer lock is unavailable or rejected, the simulation remains open and provides the existing drag-to-look interaction with WASD movement plus a short status message.
- On touch devices, the existing analogue movement control and touch-drag look remain the input method; pointer lock is desktop-only.

### Furniture mode

- `가구 배치` preserves the existing catalog, search, filtering, placement, move, rotate, delete, restore, and save behavior.
- Selecting furniture or the room geometry is disabled in `워킹뷰`; it is view-only.
- Confirmed furniture state is shared by both modes. A placement or edit confirmed in furniture mode appears immediately when returning to walk mode.
- Switching to `워킹뷰` while an item is still pending cancels only that unconfirmed operation. Re-editing an existing item restores its last confirmed position; a newly selected unconfirmed item is removed.

### Mode changes and exit

- Changing modes releases pointer lock before changing camera controls.
- Entering furniture mode restores the existing orbit camera framing and opens the furniture tools.
- Returning to walk mode chooses a valid walk spawn near the current orbit target when possible, otherwise the deterministic room fallback spawn.
- Closing the simulation releases pointer lock and preserves the existing confirmed furniture persistence behavior.

## Recommended Architecture

### Shared scene, separate controllers

`ListingTourRoom3D` remains the owner of the simulation mode and furniture state. `RoomlogThreeFloorPlanView` continues to render one shared room scene, but accepts an explicit control mode instead of always mounting `OrbitControls`.

- `orbit` mounts the existing `RoomOrbitControls` and camera auto-fit behavior.
- `walk` mounts a new floor-plan walk controller and suppresses orbit auto-fit after the walk camera has spawned.

The reusable input and camera-motion portions of the existing splat `TourCamera` should be extracted or adapted rather than independently reimplemented. Splat-specific presets, asset bounds, and callbacks remain in the splat layer so this feature does not couple the two viewers.

### Collision model

Use a lightweight deterministic 2D collision solver over the X/Z floor plane instead of adding a general physics engine.

- Treat the visitor as a circle with a 0.22-metre radius and keep its camera at 1.45 metres.
- Treat walls as their existing oriented rectangular footprints, including wall depth.
- Treat confirmed furniture as the oriented footprints already derived from `PlacedFurniture` dimensions, scale, position, and Y rotation.
- Doorways naturally remain passable wherever the wall dataset contains a gap.
- Resolve movement in bounded substeps to prevent tunnelling through thin walls or furniture during long frames.
- When a full step collides, resolve the horizontal axes independently so the visitor slides along the obstacle instead of stopping abruptly.
- Reject or repair an invalid spawn by searching deterministic nearby floor points; if no safe point is available, keep walk mode inactive, retain orbit view, and show a Korean status message rather than placing the camera inside geometry.

Collision geometry must use the same coordinate transformations and horizontal scale as the rendered scene. The collision layer is pure logic and does not depend on Three.js scene traversal or rendered mesh raycasts.

### State flow

1. Listing detail opens `3D 시뮬레이션` with `mode = "walk"`.
2. The shared scene renders walls and the latest confirmed furniture.
3. The walk controller computes a safe spawn and waits for a canvas click.
4. Pointer-lock events update the instruction overlay; animation frames combine keyboard/touch input, run collision resolution, and update the camera.
5. Switching to furniture mode unlocks the pointer, cancels a pending furniture draft if necessary, restores the orbit camera, and exposes existing edit controls.
6. Confirmed furniture edits update the shared in-memory state and existing browser persistence. Switching back rebuilds collision obstacles from that current state.

## Component Boundaries

- `ListingDetailView`: owns only the listing entry point and the renamed `3D 시뮬레이션` dialog/surface copy. Splat-tour links and availability checks are unchanged.
- `ListingTourRoom3D`: owns `walk | furniture` mode, pending-draft transition policy, the mode switch UI, and shared furniture state.
- `RoomlogThreeFloorPlanView`: renders the scene and mounts exactly one camera controller for the selected mode.
- Floor-plan walk controller: owns pointer-lock lifecycle, key/touch input, eye-height camera updates, and status callbacks.
- Pure walk-collision module: owns spawn validation, circle-versus-oriented-rectangle collision, swept/substepped movement, and wall sliding.

Each boundary exposes typed inputs and callbacks; the walk-collision module can be unit tested without React, Three.js rendering, or a browser.

## Accessibility and Guardrails

- The mode control uses an actual tablist or equivalent single-selection control with clear selected state and keyboard navigation.
- Pointer lock is requested only from a direct user click and is never requested automatically on modal open or mode change.
- Instructions remain visible whenever the pointer is unlocked and disappear only while locked.
- Search inputs and other text-editing controls continue to suppress WASD handling.
- The close control remains reachable whenever the pointer is unlocked. Escape first performs the browser-standard pointer unlock; closing remains an explicit action.
- All new colors, spacing, typography, borders, and overlays use existing `@roomlog/ui` tokens; no raw color values are introduced.
- The product calls this feature `워킹뷰` within `3D 시뮬레이션`, not a photorealistic or captured-room tour. This preserves the distinction from the first-person splat viewer.

## Failure Handling

- Pointer-lock rejection: stay in walk mode, show the fallback instruction, and retain drag-to-look plus movement.
- Missing or invalid room bounds: retain orbit view and show that the room cannot currently be walked.
- Furniture model load failure: keep its authoritative footprint in collision only when the existing furniture state considers the item confirmed; rendering continues to use the existing fallback model behavior.
- Storage failure: retain the existing in-memory layout and existing save-status messaging; walking remains usable for the current session.
- A mode transition must never leave both camera controllers active or leave pointer lock held after the simulation closes.

## Verification

### Pure unit tests

- Key mapping and normalized forward/strafe vectors.
- Circle collision against axis-aligned and rotated walls.
- Collision against rotated furniture footprints.
- Passable wall gaps and blocked solid wall segments.
- Substepping prevents tunnelling through thin obstacles.
- Diagonal contact slides along an obstacle.
- Spawn selection accepts a safe point, repairs an obstructed point, and reports no-spawn failure deterministically.

### Component and behavior tests

- Listing copy and entry controls say `3D 시뮬레이션`; splat-tour copy and links remain unchanged.
- A newly opened simulation selects `워킹뷰` by default.
- Only one of orbit or walk controls is mounted for each mode.
- Canvas click requests pointer lock, lock state changes the instruction overlay, and Escape/unlock restores it.
- Switching modes releases pointer lock.
- Switching with a pending new item cancels it; switching while re-editing restores the last confirmed item.
- Confirmed furniture is visible and collidable after returning to walk mode.
- Text inputs do not trigger movement.

### Manual Docker verification

- Run the standard Docker stack and open a listing with a connected floor plan.
- Verify desktop mouse/WASD behavior, internal-wall collision, doorway passage, furniture collision, wall sliding, and Escape release.
- Verify touch joystick and look gestures at the mobile breakpoint.
- Verify furniture placement/save/restore behavior is unchanged.
- Verify a listing with a registered splat asset still opens the existing separate first-person splat viewer.
- Finish with `pnpm test:web` and `bash scripts/verify.sh`.

## Non-goals

- Changing the splat-tour viewer, splat capture pipeline, or splat asset gate.
- Photorealistic rendering of floor-plan geometry.
- Multiplayer presence, avatars, footsteps, sound, jumping, running, stairs, elevators, or multi-floor navigation.
- A general-purpose physics engine or navigation-mesh pipeline.
- Server persistence changes for visitor furniture layouts.
