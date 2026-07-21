# Furniture Orbit WASD Movement

## Goal

Add keyboard translation to the full-screen `3D 시뮬레이션 > 가구 배치` mode so users can move around the room with `WASD` or the arrow keys without losing the existing orbit camera and furniture editing workflow.

This is an extension of furniture mode, not a second first-person controller. `워킹뷰` keeps its pointer-lock camera, eye height, and collision behavior. Furniture mode keeps drag-to-rotate, zoom, furniture selection, and floor placement.

## User Experience

- In full-screen furniture mode, `W`/`S` move the viewpoint forward/backward and `A`/`D` move it left/right relative to the camera's horizontal heading.
- The arrow keys mirror WASD.
- Keyboard movement translates the camera position and the orbit target by the same X/Z delta. Camera height, camera-to-target distance, orbit pitch, and orbit yaw therefore remain unchanged.
- Mouse or touch drag continues to rotate the orbit camera around its current target. Existing furniture click, select, move, rotate, delete, confirm, cancel, restore, and save interactions remain unchanged.
- While a furniture item is actively being dragged across the floor, keyboard camera movement pauses along with the existing orbit rotation lock. It resumes when the drag ends.
- Movement keys do nothing while focus is in an `input`, `textarea`, `select`, `button`, link, or content-editable element, so catalog search and other controls keep normal keyboard behavior.
- The furniture-mode hint reads `WASD 이동 · 드래그 회전`. Walk-mode instructions remain unchanged.

## Scope

Keyboard orbit translation is enabled only when all of the following are true:

1. The listing's full-screen 3D simulation is open.
2. `가구 배치` is the selected simulation mode.
3. Scene controls are enabled.
4. Focus is not inside an editable control.

The embedded listing preview and registration/editor surfaces keep their current camera behavior. This prevents page-level arrow keys or WASD from moving a passive preview.

## Recommended Architecture

### Orbit movement controller

Extend `RoomOrbitControls` with an explicit `keyboardMoveEnabled` input and keep the behavior colocated with the orbit controller that owns its target.

- Hold a ref to the Drei `OrbitControls` instance.
- Treat the room-centre target passed by the viewer as an initialization/reset target, not as a value to reapply on every unrelated React render. Furniture selection and catalog state changes must not snap a keyboard-translated camera back to the room centre.
- Track pressed movement keys with window `keydown`, `keyup`, and `blur` listeners only while keyboard movement is enabled.
- In `useFrame`, derive the camera's forward direction, project it onto the X/Z plane, normalize it, and derive its perpendicular right vector.
- Combine forward and strafe input, normalize diagonal input, and multiply it by a fixed metres-per-second speed and the bounded frame delta.
- Apply the resulting X/Z delta to both `camera.position` and `controls.target`, call `controls.update()`, and invalidate the demand-rendered canvas.

The movement-vector calculation and editable-target guard should live in a small pure module so they can be unit tested without React, Three.js rendering, or browser pointer events.

### State wiring

`ListingTourRoom3D` already supplies `controlMode="orbit"` in furniture mode and sets `controlsEnabled={!isFurnitureDragging}`. It will additionally tell the viewer whether the full-screen furniture mode is active. The viewer passes that flag to `RoomOrbitControls`.

The existing `controlsEnabled` gate remains authoritative for both orbit rotation and keyboard translation. No new duplicate furniture-drag state is introduced inside the camera controller.

### Camera boundaries

Furniture-mode keyboard translation is intentionally free on the X/Z plane:

- no wall or furniture collision;
- no automatic room-bound clamping;
- no vertical flight;
- no pointer lock;
- no automatic camera-height or pitch changes.

This matches an editing camera: users may move outside a wall to inspect furniture from another angle, while `워킹뷰` remains the physically constrained walkthrough.

## Input and Lifecycle Guardrails

- Prevent the browser's default arrow-key scrolling only when the furniture camera actually consumes that key.
- Ignore key auto-repeat as an additional state transition; held-key state drives movement per frame.
- Clear all pressed keys on window blur, mode change, control disable, and unmount to prevent stuck movement.
- Clamp animation-frame delta before applying movement so a background-tab pause cannot cause a large camera jump.
- If the projected forward vector is nearly vertical, retain the last valid horizontal heading or use a deterministic forward fallback.
- Do not attach pointer-lock handlers or reuse walk-mode status overlays in furniture mode.

## Accessibility

- Keyboard translation supplements rather than replaces mouse/touch orbit controls.
- Search fields, buttons, links, selects, and content-editable controls retain their normal keyboard behavior.
- The visible hint advertises the two primary camera inputs without obscuring furniture actions.
- No new colors or raw visual values are required; any hint styling continues to use the existing UI tokens and component classes.

## Failure Handling

- If the orbit-controls ref is not ready, movement input is ignored for that frame.
- If the camera direction cannot produce a valid horizontal vector, use the deterministic fallback rather than writing `NaN` positions.
- Disabling controls immediately clears held movement keys.
- A camera-input failure must not block furniture selection or placement; the existing mouse/touch workflow remains the fallback.

## Verification

### Pure unit tests

- WASD and arrow keys map to forward/strafe state.
- Opposing keys cancel one another.
- Diagonal movement is normalized.
- Camera-relative forward and right vectors produce the expected X/Z delta.
- Frame delta is capped.
- Editable targets are ignored.

### Component and source-contract tests

- Keyboard orbit movement is enabled only for the full-screen furniture mode.
- `controlsEnabled=false` disables both orbit rotation and keyboard translation.
- The orbit controller moves camera position and target together.
- Unrelated furniture/catalog rerenders do not reset the translated orbit target.
- Window blur and controller cleanup clear held keys.
- Furniture mode displays `WASD 이동 · 드래그 회전`.
- Walk mode still mounts only `FloorPlanWalkControls` and retains its existing instructions.
- Embedded previews do not consume WASD or arrow keys.

### Manual Docker verification

- Open a listing's `3D 시뮬레이션`, switch to `가구 배치`, and verify camera-relative WASD/arrows while changing orbit angle.
- Verify height, pitch, zoom distance, and drag rotation remain stable during keyboard movement.
- Search in the furniture catalog and confirm typing or arrow-key cursor behavior does not move the scene.
- Drag a furniture item and confirm the camera pauses until the drag ends.
- Switch repeatedly between `워킹뷰` and `가구 배치` and confirm neither controller leaks held keys into the other.
- Verify the passive listing preview does not consume page keyboard input.
- Finish with focused web tests, a web build, and `bash scripts/verify.sh`.

## Non-goals

- Replacing furniture mode with pointer-lock first-person controls.
- Adding collision, gravity, jumping, running, or vertical movement to furniture mode.
- Changing the splat viewer, walk-mode collision, furniture persistence, catalog data, or server APIs.
- Adding mobile virtual joysticks to furniture mode in this change.
