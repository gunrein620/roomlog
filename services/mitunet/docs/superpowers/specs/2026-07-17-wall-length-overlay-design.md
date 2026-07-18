# Interior And Exterior Wall Dimension Overlay Design

## Goal

After the user selects two points and applies a real length in millimeters, show architectural arrow dimensions for the building's exterior wall faces and for both room-facing sides of interior walls.

## Selected Approach

Build a dimension-only structural mask from the current editable wall mask. For measurement only, bridge every valid door or window that is attached to a wall so `wall - opening - wall` remains one continuous run. Extract the faces between that virtual structure and adjacent empty space, classify each face as exterior or interior, and draw an offset arrow dimension for every meaningful straight run.

This approach is preferred because:

- Offsetting the previous centerline result would not represent the actual inner and outer wall-face lengths at corners.
- Measuring the original wall polygons would become stale after wall edits and would still split runs at detected openings.
- A separate virtual mask follows current wall and opening edits without changing the real mask or the 3D geometry.

## Dimension-Only Opening Bridging

1. Start with a copy of the current editable wall mask.
2. Include doors and windows only when they are valid and attached to the wall.
3. Fill the opening span along the local wall direction using the opening footprint and the supported wall thickness.
4. Use the filled span only while calculating dimensions.
5. Never write it back to `ReviewDocument.wallMask`, the compose request, saved project data, or 3D polygons.
6. Both doors and windows preserve continuity. A wall run does not end at either opening.

## Exterior And Interior Classification

1. Flood-fill empty pixels connected to the 1024 x 1024 image border as exterior space.
2. Treat enclosed empty components as interior room space after attached doors and windows have been bridged for dimension calculation.
3. A structure boundary adjacent to exterior space is an exterior wall face.
4. A structure boundary adjacent to an enclosed component is an interior wall face.
5. An interior partition normally exposes two room-facing faces; both faces receive independent dimensions.
6. Split face runs at corners and wall junctions, then merge collinear pieces across bridged doors and windows.
7. Filter very short contour artifacts so wall thickness, text noise, and isolated pixels do not become dimensions.

## Rendering

- Exterior dimensions are offset toward the outside of the building.
- Interior dimensions are offset into the room adjacent to that wall face.
- Each dimension uses two short extension marks, inward-facing arrowheads shaped like `<` and `>`, and a centered millimeter label.
- Dimension line and arrow sizes remain fixed in screen pixels while their endpoints follow image coordinates through pan and zoom.
- Labels use a white plate and dark text; dimension geometry uses a high-contrast cyan distinct from wall, door, and window overlays.
- The previous wall-centerline overlay is removed.

## Calibration And Update Lifecycle

- Dimensions appear only after a manual two-point calibration is applied.
- The automatic 900 mm door-width estimate never shows dimensions.
- Recalculate after manual calibration and after committed wall draw, erase, undo, redo, or reset operations.
- Because openings now affect continuity, also recalculate after a door/window add, move, resize, type change, delete, undo, redo, or reset operation.
- Do not recalculate during pointer movement; update after the edit transaction commits.
- Clearing or replacing the manual scale immediately removes the overlay.

## Scope Boundaries

- Do not modify wall detection, the accepted wall mask, wall polygons, opening alignment, compose payloads, saved plans, or 3D wall generation.
- Do not add a server dependency or make a GPU request for dimension calculation.
- Do not show the dimension overlay in the 3D view.
- Do not infer measurements before the user applies manual scale calibration.

## Error Handling

- Ignore invalid or detached openings instead of bridging unrelated structures.
- Ignore empty masks and unclassifiable or sub-threshold fragments without changing the review document.
- If an edited opening becomes detached, the next committed edit removes its continuity bridge and recalculates the affected dimensions.

## Verification

- Unit-test exterior faces of a closed rectangle.
- Unit-test both room-facing sides of an interior partition.
- Unit-test that attached windows and doors preserve one continuous dimension run.
- Unit-test that detached or invalid openings do not bridge walls.
- Unit-test corner and junction splitting, short-artifact filtering, and millimeter formatting.
- Verify dimensions are hidden for estimated or cleared calibration.
- Verify wall and opening commits refresh the cached dimensions without altering the source wall mask.
- Run the focused JavaScript regression suite.
- Load the supplied floor plan through the RoomLog 3000 workflow and confirm the arrow dimensions appear only in 2D while the 3D wall result remains unchanged.
