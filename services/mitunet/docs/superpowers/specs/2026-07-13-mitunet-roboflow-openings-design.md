# MitUNet + Roboflow Opening Integration Design

## Goal

Keep MitUNet as the only source of wall geometry and add door/window openings from the existing Roboflow model (`cubicasa5k-2-qpmsa/6`) to the Three.js result.

## Scope

- Accept one PNG or JPEG floor-plan image.
- Run the existing binary MitUNet checkpoint to produce wall polygons.
- Send the same image to Roboflow and read door/window detections.
- Ignore Roboflow wall detections so two wall models cannot create duplicate geometry.
- Attach each accepted opening to the nearest compatible MitUNet wall.
- Cut doors from floor level and windows from a fixed sill height.
- Keep wall-only rendering available when Roboflow is unavailable or returns no valid openings.

## Data Flow

1. The viewer uploads an image to the FastAPI server.
2. The server runs MitUNet and extracts wall polygons in the existing 1024 x 1024 canvas coordinates.
3. The server calls Roboflow with the original image using environment-based configuration.
4. Roboflow door/window boxes are converted to the same canvas coordinates.
5. Duplicates and low-confidence detections are removed.
6. Each remaining box is matched to the nearest wall boundary. A box outside the matching tolerance is rejected.
7. The API returns wall polygons, matched openings, rejected-opening counts, and non-fatal Roboflow status.
8. The Three.js viewer subtracts matched openings from wall meshes and shows the resulting doors and windows.

## Configuration

- `ROBOFLOW_API_KEY`: required only for opening detection.
- `ROBOFLOW_FLOOR_PLAN_MODEL`: defaults to `cubicasa5k-2-qpmsa/6`.
- Door confidence default: `0.15`.
- Window confidence default: `0.20`.
- Matching tolerance is expressed in 1024-canvas pixels and kept in one server-side constant.

Secrets are never returned to the browser or stored in source files.

## Failure Behavior

- Missing API key: return MitUNet walls and report opening detection as disabled.
- Roboflow timeout or HTTP failure: return MitUNet walls and a non-fatal warning.
- No matching wall: reject that opening instead of cutting an unrelated wall.
- Empty MitUNet output: return no 3D geometry and an explicit wall-extraction error.

## Verification

- Unit-test Roboflow response parsing, confidence filtering, duplicate removal, coordinate conversion, and nearest-wall matching.
- Unit-test door and window cut dimensions separately.
- API-test wall-only fallback when the Roboflow key is absent or the call fails.
- Run one real AIHub image through both models and visually verify that doors begin at floor level, windows remain above the floor, and no unrelated wall is cut.

## Out of Scope

- Training a new door/window detector.
- Using Roboflow wall boxes to replace or merge with MitUNet walls.
- Inferring real-world opening height or floor-plan scale from the image.
