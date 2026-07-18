# Window Wall Snap And Opening Editing Design

## Goal

Make Roboflow windows sit directly on the nearest compatible MitUNet wall while preserving the detected window's longitudinal position and length. Keep doors and windows editable before the user switches to the 3D view.

## Selected Approach

Use persistent RoomLog-style snapping. The corrected opening geometry is stored in the review document and is therefore shared by the 2D review overlay and the generated 3D scene.

Alternatives rejected:

- Visual-only snapping would make the review overlay disagree with the 3D result.
- Clipping the full window box to wall-mask pixels would distort detected lengths around noisy or broken wall masks.

## Alignment Rules

1. Preserve the detector's opening length and longitudinal center.
2. Find the nearest wall segment with the same horizontal or vertical orientation.
3. Require the opening and wall to overlap, or be separated by only a small longitudinal gap.
4. Snap the opening's cross-axis center and thickness to the matched wall.
5. If no compatible wall is close enough, keep the original detection as an invalid, editable candidate instead of cutting an unrelated wall.
6. Process higher-confidence detections first. Overlapping lower-confidence candidates remain available for review but do not cut the same wall footprint automatically.

## Review Editing

Reuse the existing review editor interactions:

- Select and drag an opening.
- Resize its length with endpoint handles.
- Change Door to Window or Window to Door.
- Delete, undo, redo, and add openings manually.
- Recalculate wall contact after every edit and show invalid candidates distinctly.

The edited geometry is the source for Show 3D. Switching between Show Original and Show 3D must not restore the original Roboflow box.

## Scope

- Roboflow remains responsible only for door/window detections.
- MitUNet remains the only source of wall geometry.
- Door alignment keeps its current behavior unless shared snapping code requires a compatible internal refactor.
- No detector retraining and no threshold changes are included.

## Verification

- Unit-test horizontal and vertical window snapping.
- Verify detected length and longitudinal center are preserved.
- Verify the snapped center and thickness match the wall.
- Verify a distant window stays invalid and editable.
- Verify editing persists into the compose API and 3D result.
- Run the focused Python and JavaScript opening-editor tests.
