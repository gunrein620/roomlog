# Recognition Review Editor Design

## Goal

Change the upload flow from immediate 3D rendering to a review-first workflow:

`upload -> AI recognition -> editable 2D review -> Show 3D`

The user can move between `Show Original` and `Show 3D` without losing edits. The 3D view always reflects the latest confirmed 2D recognition state.

## Chosen Editing Model

Use a hybrid editor because walls and openings have different source geometry:

- Walls come from the MitUNet pixel mask. Edit them with a wall brush and eraser.
- Doors and windows come from Roboflow boxes aligned to walls. Edit them as selectable boxes with drag and resize handles.

This is preferred over polygon-vertex editing, which is harder to use and would expose noisy mask contours, and over whole-object delete/add editing, which cannot repair only part of an incorrect wall.

## User Flow

1. The user uploads a PNG or JPEG floor plan.
2. MitUNet detects walls and Roboflow detects doors and windows.
3. The application opens in `Show Original` mode instead of rendering 3D immediately.
4. The original image stays visible under semi-transparent recognition overlays.
5. The user corrects false positives, missing regions, positions, sizes, and opening types.
6. Pressing `Show 3D` sends the current edited state to the server, converts it to polygons, and renders the result in Three.js.
7. Pressing `Show Original` returns to the same editor state.
8. If the user edits again, the next `Show 3D` rebuilds the model from the new state.

## Review Overlay

The 2D editor uses fixed class colors and a visible legend:

- Wall: red, semi-transparent (`#ef4444`).
- Door: amber (`#f59e0b`).
- Window: blue (`#2563eb`).
- Selected opening: white outline and square resize handles, so selection does not conflict with a class color.

The original drawing remains readable below the overlay. A class can be temporarily hidden from the legend without deleting its data.

## Editing Controls

### Walls

- `Wall brush`: add missing wall pixels.
- `Eraser`: remove falsely recognized wall pixels.
- Brush-size slider: change the correction width.

The editor does not expose individual contour vertices. The corrected wall mask is vectorized only when 3D is requested.

### Doors And Windows

- Select an existing opening.
- Drag to move it.
- Drag end handles to change its length along the wall.
- Delete it.
- Change its type between door and window.
- Add a missing door or window by dragging across a wall.

On pointer release, an opening snaps to the nearest compatible wall using the existing wall-alignment rules. An opening that cannot match a wall stays visibly invalid and is not silently applied to 3D.

The browser provides immediate visual snapping while editing. The server repeats the authoritative alignment against the edited wall mask during composition, so the 3D result cannot use stale wall geometry.

### Shared Actions

- Undo and redo.
- Reset to the original AI result.
- Zoom and pan without changing recognition data.
- `Show 3D` as the explicit conversion action.

## Frontend State

Keep one in-memory review document for the uploaded plan:

- Original 1024 x 1024 image.
- Original AI wall mask.
- Current edited wall mask.
- Original AI opening list.
- Current edited opening list.
- Undo/redo history.
- Dirty revision number.
- Last successfully rendered 3D revision.

Switching views never reruns AI and never resets this state. `Show 3D` reuses cached polygons when the revision has not changed and recomposes only when edits are newer than the last render.

History is bounded to 30 actions. One wall stroke or one completed opening drag/resize is one undo action; pointer-move events do not create separate history entries.

## API Changes

### `POST /extract-image`

Continue running both AI models, but return editable source data in addition to the existing result:

- `input_image_b64`: the exact 1024 x 1024 image used by MitUNet.
- `wall_mask_b64`: a lossless binary PNG mask.
- `openings`: stable IDs, type, confidence, aligned center, length, thickness, and wall axis.
- Existing polygon and detection metadata for compatibility and diagnostics.

### `POST /compose-edits`

Accept the edited wall mask and opening list, validate them, apply the existing opening alignment/composition rules, and return final wall/door/window polygons.

The request uses multipart form data with a lossless 1024 x 1024 PNG wall mask and one JSON field for openings. Coordinates remain in the existing 1024-canvas coordinate system.

The server remains the only place that performs mask-to-polygon conversion. This avoids duplicating OpenCV geometry behavior in browser JavaScript.

## 2D And 3D Rendering

`Show Original` and `Show 3D` are a two-option segmented view control rather than a one-way conversion button. `Show Original` displays a dedicated 2D canvas containing the original image, wall-mask overlay, and opening boxes. Three.js orbit interaction is disabled while this canvas is active.

`Show 3D` hides the editor canvas, displays the Three.js canvas, and loads polygons returned by `/compose-edits`. Returning to `Show Original` hides Three.js but preserves its camera and the complete editor state.

## Failure Behavior

- MitUNet failure: do not enter the editor; show a clear upload error.
- Roboflow unavailable: enter the editor with walls only and allow manual door/window creation.
- Invalid opening: show it as invalid in 2D and exclude it from 3D until corrected.
- Composition request failure: stay in `Show Original`, preserve all edits, and show a retryable error.
- Empty corrected wall mask: block `Show 3D` and explain that at least one wall is required.

## Testing And Verification

- Unit-test binary wall-mask serialization and restoration.
- Unit-test edited-opening validation, snapping, type changes, and invalid-opening rejection.
- API-test `/compose-edits` with wall-only, door, window, malformed mask, and empty-wall inputs.
- Browser-test upload starts in `Show Original` mode.
- Browser-test class colors, wall brush/eraser, opening move/resize/add/delete/type change, undo/redo, and reset.
- Browser-test `Show Original -> Show 3D -> Show Original` preserves edits.
- Verify that editing after a 3D render produces changed 3D geometry on the next switch.
- Capture desktop and mobile screenshots and check that both 2D and Three.js canvases are nonblank and controls do not overlap.

## Out Of Scope

- Editing arbitrary polygon vertices.
- Training or fine-tuning MitUNet or Roboflow.
- Saving review projects to a database.
- Exporting GLB, OBJ, or IFC files.
- Editing wall height, door height, window sill height, or real-world scale.
