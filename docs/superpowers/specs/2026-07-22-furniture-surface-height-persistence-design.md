# Furniture Surface Height Persistence Design

## Problem

Furniture placed on top of another item is correct in the furnishing editor, but drops to the floor after the listing is saved. The editor persists both the elevated Y coordinate and attachment metadata such as `{ mode: "surface", supportFurnitureId: "desk-id" }`. The trade API currently normalizes furniture into a narrower shape that omits `placement`. When the listing detail reloads the saved floor plan, the web viewer treats a GLB without attachment metadata as legacy floor furniture and resets its Y coordinate to the floor.

## Design

Extend the trade floor-plan furniture contract with the existing three placement modes: `floor`, `surface`, and `wall`. During untrusted listing input normalization, retain only valid placement metadata:

- `floor` requires no reference.
- `surface` requires a non-empty `supportFurnitureId`.
- `wall` requires a non-empty `wallId`.
- Missing or malformed metadata is omitted for backward compatibility.

The stored Y coordinate remains unchanged. The web viewer can then distinguish elevated and wall-mounted furniture from legacy floor furniture and will not normalize it to floor height.

## Data Flow

1. The furnishing editor calculates an elevated Y coordinate and attachment metadata.
2. The owner page submits the floor-plan snapshot with both values.
3. The trade API validates and persists the attachment metadata alongside the transform.
4. Listing retrieval returns the same metadata after process restart.
5. The listing 3D viewer preserves the stored Y coordinate for non-floor furniture.

## Error Handling

Malformed attachment metadata is dropped instead of being trusted. The furniture itself remains valid and renders using the existing legacy behavior, matching current compatibility behavior.

## Verification

Add an API regression test that creates a listing with furniture on a support, restarts the file-backed service, and asserts that both the elevated Y coordinate and the complete surface attachment survive. Run the focused API test and the repository verification script before committing and pushing main.
