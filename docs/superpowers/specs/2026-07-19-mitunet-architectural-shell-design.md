# MitUNet architectural workspace shell

## Goal

Recompose the MitUNet floor-plan-to-3D viewer around the approved Plan2Scene reference: a persistent top application bar, a slim left tool rail, a large centered work surface, a contextual step card, and a bottom-centered view switcher. The existing upload, segmentation, review editing, 3D rendering, furniture placement, JSON export, and RoomLog completion behavior remain unchanged.

## Layout

Desktop uses five visual layers over the existing scene canvas.

1. A full-width top bar carries the RoomLog product mark, the current floor-plan workflow name, and the existing save actions.
2. A slim left rail exposes existing editing actions as icon-first controls. The rail does not introduce new commands; it groups existing `#editor-tools` buttons.
3. A contextual card at the upper left presents the current stage. In upload mode it emphasizes the existing file picker and sample selector. In review and furnishing modes it surfaces the existing status and stage actions.
4. The central viewport remains the existing `canvas#scene` or `#review-canvas`. Upload mode adds a prominent centred drop target that delegates to the existing `#upload-btn` / file input.
5. The existing view segmented control moves into a bottom-centred pill. Furniture catalog and selected-object toolbar retain their existing right-side and object-anchored positions.

At widths at or below 720px, the header reduces to essential actions, the rail becomes horizontally scrollable, the context card becomes a compact sheet, and the bottom switcher remains reachable above the viewport edge.

## Component and state mapping

| Existing control | Architectural-shell role |
| --- | --- |
| `#ui` | Contextual stage card and existing upload/stage actions |
| `#editor-tools` | Icon-first tool rail with expandable review controls |
| `#view-switch` | Bottom-centred view switcher |
| `#furniture-panel` | Existing right-side catalog panel |
| `#furniture-floating-toolbar` | Existing object-anchored command pill |
| `#status` | Stage status line, including save success/error feedback |
| `canvas#scene`, `#review-canvas` | Unchanged central work surface |

The shell is driven entirely by the existing body state classes: `view-3d`, `view-original`, `view-furnishing`, `view-transitioning`, `is-busy`, and `dragging`. No new application state, request, storage, or exported payload is added.

## Visual direction

The structure follows the Plan2Scene reference, while visual tokens remain RoomLog Cosmic: midnight scene canvas, lavender/white glass surfaces, `#5747cf` indigo for primary actions, NanumSquareRound typography, 20px panel corners, and soft indigo shadows. The main viewport takes visual precedence; controls are smaller, separated, and spaced from the screen edges.

## Safety and verification

Implementation may add layout-only wrappers, labels, and icon containers where needed, but must preserve every existing id, `data-*` attribute, button, input, script, proxy request string, and event listener contract. The viewer style test will cover the shell selectors and existing integration hooks. The MitUNet JS suite, property-shell suite, and a browser pass over upload, original-plan, 3D, furnishing, and save states will verify the change.
