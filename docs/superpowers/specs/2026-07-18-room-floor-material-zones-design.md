# Room Floor Material Zones Design

## Goal

After the user finishes correcting walls, doors, and windows in 2D and starts the 3D conversion, classify room usage and generate a wall-constrained floor-material map. The furniture-placement 3D view must render that saved map instead of applying one wood material to the entire interior.

## Scope

- Add room classification and floor-zone generation to the transition from the completed 2D plan to the 3D furniture-placement view.
- Use the original uploaded floor-plan image for semantic room classification.
- Use the confirmed structural geometry and dark wall boundaries for the exact material regions.
- Render wood in living rooms and bedrooms, kitchen flooring in kitchens and dining areas, and tile in bathrooms, utility rooms, and balconies.
- Persist the derived floor zones with the MitUNet/RoomLog 3D payload so reopening or saving does not repeat the analysis.
- Preserve the existing wall, door, window, animation, furniture, and measurement behavior.

## Non-goals

- Do not change wall detection, wall post-processing, or wall mesh generation.
- Do not infer or place furniture automatically.
- Do not add a separate multi-step page or require manual room labeling in this iteration.
- Do not recalculate room zones on every 3D render.

## Approaches Considered

### A. Generate and persist floor zones during the 2D-to-3D transition (selected)

The server classifies rooms once, combines room seeds with the confirmed structural boundaries, and returns compact floor-zone data with the plan. The 3D renderer consumes the saved zones.

Benefits: stable results, no repeated API call, compatible with saved listings, and isolated from wall rendering. Cost: the 3D conversion step gains one analysis phase.

### B. Classify rooms in the browser when furniture placement opens

This avoids changing the saved payload, but exposes the classification lifecycle to the browser, repeats work after reloads, and makes error recovery and API-key handling worse.

### C. Store only a pre-rendered texture image

This is simple to draw, but it is difficult to edit, validate, or remap when scale and geometry change. It also weakens the relationship between a room type and its material.

## Data Contract

Extend the MitUNet plan with an optional versioned floor-material section. Existing plans without it remain valid.

```ts
type FloorMaterialKind =
  | "WOOD"
  | "KITCHEN_FLOOR"
  | "TILE"
  | "BALCONY_TILE"
  | "STONE_TILE";

type FloorMaterialZone = {
  id: string;
  label: string;
  roomType: string;
  material: FloorMaterialKind;
  confidence: number;
  seed: [number, number];
};

type FloorMaterialMap = {
  version: 1;
  width: number;
  height: number;
  encoding: "rle-u8";
  labels: string;
  zones: FloorMaterialZone[];
};
```

The label map stores zone indices with compact run-length encoding. A zero label means no flooring. Coordinates use the same source-image pixel space as the MitUNet polygons.

## Data Flow

1. The user uploads and corrects the 2D plan.
2. The user starts 3D conversion.
3. Room classification returns room labels, types, confidence values, and seed points from the original image.
4. Floor-zone generation uses the confirmed wall/window polygons as permanent barriers and door polygons as temporary gap-closing barriers.
5. Multi-source region growth assigns only valid interior pixels to the nearest room seed without crossing a barrier.
6. The result is encoded into `floorMaterials` and saved with the existing 3D plan payload.
7. The furniture-placement renderer decodes the map once and creates a single canvas texture containing different material patterns.
8. Existing plans without `floorMaterials` continue to use the current whole-interior wood fallback.

## Rendering

- Keep the existing concrete/road-style ground outside the building.
- Replace only the current single interior wood texture.
- Reuse the existing texture plane alignment so floor zones and wall meshes share coordinates.
- Preserve walls as separate meshes above the floor; floor generation must not add, remove, resize, or bridge wall geometry.
- Use deterministic patterns so saved and reopened views look identical.

## Error Handling

- If room classification is unavailable or returns no usable rooms, continue to 3D with the current whole-interior wood floor.
- If some seeds are invalid, omit only those zones and keep other valid zones.
- If decoding a saved map fails, fall back to the current wood texture without blocking furniture placement.
- Do not persist API credentials or raw model responses in the plan payload.

## Testing

- Contract tests accept old payloads and validate new optional floor-material maps.
- Unit tests verify RLE encode/decode, wall-constrained region growth, door-gap closure, and material mapping.
- Renderer tests verify that a plan with zones uses the zoned texture and a legacy plan uses the wood fallback.
- A regression fixture based on `naver_125_86_63.98.jpg` verifies that bedrooms, bathroom, utility room, living room, kitchen, and balcony remain inside their wall boundaries.
- Existing wall/door/window parity tests must remain unchanged and pass.
- Final verification includes the relevant web tests, web build, and a local 3000 browser pass through conversion and furniture placement.

## Success Criteria

- On the tested Naver plan, the furniture-placement view shows room-specific materials aligned with the same boundaries as the approved preview.
- Transitioning away and reopening the saved plan preserves the same materials without rerunning classification.
- Existing plans still render successfully with their current wood fallback.
- Wall, door, and window counts and geometry are byte-for-byte unchanged by floor-material generation.
