# Floor-Origin Rise Animation Design

## Problem

The 3D viewer currently constructs each window section at its final vertical offset and animates only `mesh.scale.z`. The lower wall starts at the floor, but the glass starts at the sill and the upper wall starts at the lintel, so those two sections visibly grow while floating in the air.

## Goals

- Make every animated wall and window section visibly emerge from floor level.
- Slow the per-section rise duration from 900 ms to 1200 ms.
- Preserve the existing cubic-out easing and stagger timing.
- Replay the same floor-origin animation whenever the user returns to the 3D view.
- Preserve immediate final placement for reduced-motion users.

## Non-Goals

- Do not change wall polygons, extrusion depth, wall height, window sill height, window top height, materials, or detection results.
- Do not add door headers or other door geometry.
- Do not change camera animation, 2D review behavior, inference, or composition requests.

## Chosen Approach

Store each section's final vertical offset as animation metadata. During a normal replay, reset the section to floor level and its non-degenerate collapsed scale. During each frame, apply the same cubic-out progress to both properties:

- `mesh.position.y = finalBottom * eased`
- `mesh.scale.z = max(0.001, eased)`

Ordinary walls and lower window walls have `finalBottom = 0`, so their visible behavior remains unchanged. Window glass and upper window walls move from floor level to their existing final offsets while growing to their existing final heights. This changes animation state only; the mesh geometry and its final placement remain unchanged.

## Replay and Reduced Motion

`replayRiseAnimations` resets both scale and vertical position. A normal replay sets position to zero and scale to `0.001`. Reduced motion sets position directly to `finalBottom` and scale to `1`, while preserving the current completed-start-time behavior.

## Boundaries and Compatibility

- Missing or non-finite `finalBottom` values fall back to the mesh's current finite Y position, then to zero. This keeps existing animation entries safe.
- The rise loop owns only `position.y` and `scale.z` for registered animation meshes.
- Final values must be exact at progress `1`: original vertical offset and scale `1`.

## Verification

- Add unit tests proving normal replay resets a raised section to floor level.
- Add unit tests proving reduced motion restores the final vertical offset immediately.
- Add unit tests proving an intermediate animation frame advances both position and scale and a completed frame restores exact final values.
- Run the focused transition tests, all JavaScript tests, and the existing Python suite.
- Verify the live 3000 viewer uses the updated assets and visually confirm window glass and the upper wall emerge from the floor without changing final wall geometry.
