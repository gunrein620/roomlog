# Furniture Automatic Surface Placement Design

## Goal

Restore the MitUNet viewer's wall-mounting and furniture-stacking capabilities in the listing-detail 3D simulation while preserving the current first-person controls. A carried item follows the surface under the centre reticle, reports whether that position is valid, and is confirmed with `Q`.

## User interaction

The furniture simulation keeps the current Explore, Select, and Carry states.

- `E` picks up an aimed existing furniture item.
- `2` opens or closes the furniture catalogue.
- `1` and `3` rotate the carried item left and right.
- `Q` confirms a valid placement.
- `Esc` cancels a new item or restores an existing item to its original transform.
- `R` removes a carried existing item. For a new catalogue item, `R` cancels the draft.

The centre reticle is clearly green when the current placement is valid and red when it is invalid. A short label identifies `바닥 배치`, `가구 위 배치`, `벽걸이 배치`, or `배치 불가`.

Rotation depends on the active surface. Floor and furniture-surface placements rotate around world Y in 90-degree steps. Wall placements rotate the item between portrait and landscape around the wall normal in 90-degree steps while preserving its wall alignment.

## Automatic surface resolution

The centre ray evaluates the nearest visible RoomLog placement surface. It never skips an incompatible foreground wall or furniture item to place on hidden floor behind it.

1. A compatible shallow item aimed at a wall becomes a wall placement.
2. A compatible small item aimed at a supported furniture item becomes a surface placement.
3. A floor hit becomes a floor placement.
4. An incompatible or obstructed hit leaves the draft at its last valid transform and reports an invalid placement.

Explicit catalogue placement capabilities take precedence when present:

```ts
type FurniturePlacementCapability = "floor" | "surface" | "wall" | "any";

type FurnitureCatalogItem = {
  placementCapability?: FurniturePlacementCapability;
};
```

Existing catalogue records have no capability metadata, so they use permissive heuristics:

- wall mounting is allowed when depth is at most 300 mm;
- stacking is allowed when the largest footprint side is at most 1,000 mm and height is at most 1,200 mm;
- sofas, beds, and other clearly large floor-only items remain floor-only;
- table, desk, storage, and kitchen categories can act as support surfaces.

The final decision is always geometry-based. A stacked item must fit on the support top after a small inward edge snap, and its vertical span must not collide with another item. A wall-mounted item is offset by half its depth from the wall face, aligned to the face normal, and clamped within the wall's vertical band.

## Placement result boundary

Surface picking and placement math are separated. The scene controller reports a rich hit; a pure resolver produces the next draft transform and validity.

```ts
type FurniturePlacementMode = "floor" | "surface" | "wall";

type FurniturePlacementAttachment = {
  mode: FurniturePlacementMode;
  supportFurnitureId?: string;
  wallId?: string;
};

type FurniturePlacementResult = {
  attachment: FurniturePlacementAttachment;
  furniture: PlacedFurniture;
  reason?: string;
  valid: boolean;
};
```

The shared furniture-placement module owns capability inference, support containment, wall alignment, vertical-span collision, and dependent-transform calculations. React components own raycasting, state transitions, status text, and persistence calls.

## Persistence and dependent furniture

`PlacedFurniture` gains an optional `placement` attachment. Missing metadata is treated as `{ mode: "floor" }`, preserving all existing saved layouts.

- Surface placements store `supportFurnitureId` and an absolute final transform.
- Only floor-placed furniture can act as a support. An attached child cannot become another support, which keeps stacking to one relationship level.
- Wall placements store `wallId` and an absolute final transform.
- Moving or rotating a support furniture item applies the same rigid horizontal transform to its attached children.
- Deleting a support with attached children is blocked with `위에 놓인 가구를 먼저 제거하세요`.
- Wall geometry is read-only in the listing simulator, so wall attachments do not need live wall-edit propagation.
- Local storage, listing floor-plan payloads, and saved snapshots retain the optional attachment without changing legacy records.

## Rendering conventions

GLB furniture stores its bottom/base Y, while fallback box furniture historically stores its centre Y. Placement helpers must normalize these conventions when calculating base, top, and collision spans rather than directly assuming `position[1]` has one meaning. Rendering remains unchanged and consumes the resolved persisted transform.

Pending furniture remains excluded from raycasting so it cannot select itself. Placed furniture exposes its RoomLog furniture ID and top support geometry. Both legacy wall meshes and MitUNet polygon wall meshes expose wall identity, surface kind, hit point, and world-space normal.

## Failure behavior

- No compatible surface: keep the last valid transform and show `배치 불가`.
- Item does not fit on support: keep the last valid transform and show a support-size reason.
- Wall height or collision fails: keep the last valid transform and show a wall-placement reason.
- `Q` on an invalid result does not mutate the saved furniture list.
- `R` on an attached child removes only that child.
- `R` on a support with children is blocked.

## Testing

Pure unit tests cover:

- capability metadata and permissive fallback inference;
- floor, wall, and furniture-surface resolution;
- wall offset, height clamp, and portrait/landscape rotation;
- support containment with inward snapping;
- 3D footprint plus vertical-span collision;
- support translation and rotation propagation;
- legacy data defaulting to floor placement.

Controller and component contracts cover:

- nearest visible surface ordering and no wall-through placement;
- green valid and red invalid reticle states;
- `1`, `2`, `3`, `Q`, `R`, and `Esc` routing;
- save/load preservation of attachment metadata;
- support deletion blocking and child movement.

Manual browser verification uses a real listing in desktop furniture mode: place a small item on a table, mount a shallow item on a wall, rotate and confirm both, reload the page, move the support, verify the child follows, and verify invalid placements cannot be confirmed.

## Out of scope

- Physics, gravity, free vertical movement, arbitrary object-to-object parenting, or multi-level stacks deeper than one support relationship.
- Editing walls inside the listing simulation.
- Automatic semantic classification by an external AI service.
