# Repeatable View Transition Animation

## Goal

Replay a clear transition every time the user moves between `Show Original` and `Show 3D`, without rerunning inference or rebuilding the composed plan.

## Behavior

- `Show 3D` resets every wall, door, and window section to its collapsed height and replays the existing staggered rise animation.
- `Show Original` first hides the extruded geometry, then replays the original 600 ms cubic-out camera glide to the overhead view before opening the editable canvas.
- `Show 3D` starts from the overhead camera, glides back to the perspective view over 600 ms, and replays the wall, door, and window rise.
- Repeated or rapid view changes cancel the previous visual transition and begin the newly requested one.
- The active segmented-control state, editor availability, camera controls, and cached composition behavior remain unchanged.
- Reduced-motion users receive an immediate view switch without motion.

## Implementation

- Keep the current composed Three.js meshes and store their animation metadata after construction.
- Add a replay function that assigns a fresh start time and resets mesh height before entering the 3D view.
- Reuse the original viewer's overhead position, 600 ms duration, and cubic-out interpolation in both directions.
- Do not add a canvas-level fade.

## Verification

- Add a JavaScript unit test for repeatable rise-animation state/reset behavior.
- Exercise `Original -> 3D -> Original -> 3D` in a browser and confirm that the camera glide and 3D rise replay on every switch.
- Verify rapid toggling, reduced-motion behavior, and that no additional compose request occurs for an unchanged review.
- Run the existing Python and JavaScript test suites.
