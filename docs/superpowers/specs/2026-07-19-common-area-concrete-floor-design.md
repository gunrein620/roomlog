# Common-Area Concrete Floor Design

## Goal

When a floor plan includes circulation space outside the private unit, classify that space separately and render it with a concrete finish. Private rooms keep their existing materials, and the entry door remains the boundary between the private entry tile and the shared concrete floor.

## Scope

- Recognize shared corridors, elevator halls, stair halls, and similar circulation outside the private unit as `COMMON_AREA`.
- Add `CONCRETE` as a persisted floor-material kind.
- Render confirmed common-area pixels with a deterministic grey concrete finish in both the MitUNet furniture viewer and the saved RoomLog 3D view.
- Preserve existing saved plans and the current fallback behavior.
- Do not change wall, door, window, opening, animation, measurement, or furniture geometry.

## Approaches Considered

### A. Semantic common-area type plus concrete material (selected)

The room-analysis response identifies common space explicitly as `COMMON_AREA`. The existing wall-constrained floor-zone builder converts that type to `CONCRETE` and persists it in the floor-material map.

This is explicit, testable, and stable after saving. It also avoids treating every unclassified region as shared space.

### B. Paint every unowned interior pixel as concrete

This requires no new room type, but an OCR or seed failure could turn an ordinary bedroom into concrete. The ambiguity is too risky.

### C. Grow concrete outward from the front door without semantic classification

This can work on clean plans, but a missing wall or door may let concrete leak into the private unit. It is less reliable than combining semantic classification with confirmed structure.

## Data Contract

- Add `COMMON_AREA` to the room-structure response enum.
- Add `CONCRETE` to the floor-material kind enum.
- Existing maps remain valid because the new material is additive.
- Existing plans without `COMMON_AREA` or `CONCRETE` render exactly as before.

## Classification Rules

- Shared corridor, elevator hall, stair hall, and communal landing outside the private entrance are `COMMON_AREA`.
- The private entry floor immediately inside the unit remains `ENTRY`.
- The model must not merge `COMMON_AREA` with `ENTRY`, `LIVING_ROOM`, or `KITCHEN_DINING`.
- A common-area polygon must remain on the exterior side of the main entrance door.
- If the common area cannot be distinguished confidently, omit it instead of converting unknown private space to concrete.

## Floor-Zone Generation

1. Room analysis supplies a `COMMON_AREA` seed and polygon.
2. Existing wall and window masks remain permanent barriers.
3. Existing detected door masks temporarily close openings during region growth.
4. `COMMON_AREA` maps to `CONCRETE` only when its stable seed is separated safely from private-room seeds by the structural barrier graph.
5. If safe separation cannot be established, the common-area zone is skipped while all private zones remain unchanged.
6. No structural polygon is added, removed, resized, or bridged.

## Rendering

- The furniture-placement viewer adds a deterministic cool-grey concrete material pattern.
- The saved RoomLog Three.js view decodes and renders the same `CONCRETE` zone.
- The pattern reuses the visual language of the existing exterior concrete ground, but remains aligned to source-image pixel space like other room finishes.
- Entry stone tile, bathroom tile, balcony tile, and wood remain unchanged.

## Error Handling

- Missing or low-confidence `COMMON_AREA`: keep the current floor result.
- Invalid common-area seed or unsafe connection to private space: omit only the concrete zone.
- Legacy or malformed optional material map: preserve the existing wood fallback.
- The feature must never block 3D conversion.

## Testing

- Prompt tests require `COMMON_AREA` and the private-entry/common-area distinction.
- API schema tests accept `COMMON_AREA`.
- Material-mapping tests map `COMMON_AREA` to `CONCRETE`.
- Region-growth tests prove a detected entrance door prevents concrete from entering the private unit.
- Failure-path tests prove an unsafe common-area seed is skipped.
- Texture tests verify deterministic concrete output in both viewer implementations.
- Payload tests accept new maps and continue accepting legacy maps.
- Existing wall, door, window, entrance, floor, save/reopen, and renderer tests remain unchanged and pass.

## Success Criteria

- Shared circulation shown in the supplied plan renders as grey concrete.
- The private entry immediately inside the front door remains entry tile.
- Concrete never crosses the entrance boundary into the living room, kitchen, bedroom, bathroom, or utility room.
- Saved and reopened plans preserve the same common-area finish.
- Wall, door, and window geometry is byte-for-byte unchanged by this feature.
