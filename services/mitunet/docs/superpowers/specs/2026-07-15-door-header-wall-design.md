# Door header wall design

## Goal

Render every detected door as a wall opening: the passage stays open from the
floor to the configured door height, while the original wall continues across
the same opening from that height to the ceiling.

## Rendering boundary

- Door detection supplies only the opening footprint.
- The 3D wall renderer creates the upper wall section using that footprint,
  the current wall material, and the current wall height.
- The door branch does not create a door leaf, frame, or a standalone object.
- Window rendering remains unchanged.

## Geometry

For an opening with a door footprint, emit a wall section from `doorHeight` to
`wallHeight`.  Door height is `2.1 m` when calibrated; without calibration it
uses the existing proportional equivalent.  The lower part, from floor to
door height, emits no geometry, producing a connected wall opening with a
header above it.

## Validation

- A viewer-shell regression test verifies that doors emit the upper wall
  section and do not create a door material.
- Browser tests verify the door is still an opening rather than a door mesh.
- Run the full Python and JavaScript test suites after the change.
