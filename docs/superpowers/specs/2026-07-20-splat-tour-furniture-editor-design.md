# Splat Tour Furniture Editor

## Goal

Make the `가구` control in `/splat-tour` open the same 500-item GLB furniture catalog used by the 3D renderer. A visitor can search or filter the catalog, add an item to the current tour, place it on the room floor, then move, rotate, or delete it without leaving the tour.

## Interaction

1. Selecting `가구` opens a dismissible catalog drawer over the tour.
2. The drawer provides keyword search, the shared Korean category tabs, and paged catalog cards.
3. Selecting a card creates a translucent pending model. The next click on the floor positions it.
4. The pending model has confirm, cancel, and 90-degree rotation controls. A confirmed model can be selected again to move, rotate, or delete.
5. The drawer also lists currently placed furniture so an item can be selected for editing.

## Architecture

- `tour-viewer.tsx` owns the drawer, catalog loading, placement state, and browser persistence.
- A small pure helper module owns catalog filtering and the immutable furniture add/move/rotate/delete operations; it is covered by Node unit tests.
- `SplatFurnitureLayer` remains responsible for GLB rendering and receives edit callbacks plus the selected or pending item. It renders an invisible floor interaction plane only while placement mode is active, so normal tour movement controls stay unchanged.
- Catalog metadata and category labels come from the shared floor-plan furniture modules. No second catalog or hand-maintained counts are introduced.

## Persistence and Data Flow

- On load, the tour preserves its current source priority: registered asset furniture first, then the existing local browser save.
- Local edits update the in-memory furniture state immediately and save to `roomlogListingTourFurnitureLatest` with a timestamp. This keeps the existing listing-tour and splat-tour browser-only linkage intact.
- A registered asset is not mutated by this feature. A visitor's additions remain browser-local unless an existing server save flow explicitly publishes them.

## Guardrails

- Placement is allowed only inside the known floor-plan bounds when those bounds are available; otherwise it uses the existing clip-room bounds.
- Dragging or clicking the normal scene does not add furniture unless a catalog item is pending.
- Cancel restores the prior version of an edited item. Delete removes only the selected item.
- Loading, empty catalog, and unavailable local-storage states show a short in-panel status instead of breaking the tour.

## Verification

- Unit tests prove catalog filtering, adding an item, placement clamping, rotation, cancellation, deletion, and local-save payload creation.
- A component-level source test verifies the `가구` control opens the catalog drawer and the shared catalog loader is used.
- Run the focused Splat Tour tests and the web unit-test suite, then verify the built page on `http://localhost:3000/splat-tour`.
