# Room-Type Floor Classification Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not delegate or modify wall, door, window, mesh, or animation code.

**Goal:** Reuse the proven OpenAI room-type classification contract from `openai-floorplan-room-test` in RoomLog, then map its stable room type to the existing wall-constrained floor material map.

**Architecture:** The RoomLog API will request a typed `roomType` for every AI room result while preserving the original Korean label and polygon. The viewer will choose a material from `roomType` first and retain label mapping only as a compatibility fallback. Existing MitUNet geometry remains the sole source of floor boundaries.

**Tech Stack:** NestJS API, Next.js BFF, ES modules, Node test runner.

## Global Constraints

- Do not modify wall detection, post-processing, wall/door/window polygons, mesh generation, or animation files.
- Keep the existing `floor_materials` RLE format and whole-interior WOOD fallback.
- Keep the current product decision: kitchen/dining renders as `WOOD`, even when its semantic room type is `KITCHEN_DINING`.
- Do not call the live OpenAI API during automated tests.

---

### Task 1: Preserve typed room classification through the API

**Files:**

- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**

- Produces `FloorPlanAiRoomStructure.roomType` using `LIVING_ROOM`, `BEDROOM`, `DRESS_ROOM`, `KITCHEN_DINING`, `BATHROOM`, `LAUNDRY_UTILITY`, `BALCONY`, `ENTRY`, `HALLWAY`, or `UNKNOWN`.
- Preserves `label`, `confidence`, and normalized `polygon`.

- [ ] Write a service test whose mocked structured OpenAI response contains `roomType: "BATHROOM"` and expects it in `result.rooms[0]`.
- [ ] Run the focused service test and confirm it fails because `roomType` is not returned.
- [ ] Add the strict schema field, validation, type, and semantic-classifier instructions.
- [ ] Re-run the focused service test and confirm it passes.

### Task 2: Forward the type and map it before label fallback

**Files:**

- Modify: `apps/web/src/app/floor-plan-3d/room-materials/route.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-materials/route.spec.ts`
- Modify: `services/mitunet/viewer/room-floor-zones.mjs`
- Modify: `services/mitunet/tests_js/room-floor-zones.test.mjs`

**Interfaces:**

- BFF response room has optional `roomType`.
- `materialForRoom(room)` chooses a known room type over a missing or generic label; old payloads still use `materialForRoomLabel(label)`.

- [ ] Write a viewer test that expects `{ label: "방 1", roomType: "BATHROOM" }` to use `TILE`, and a BFF contract test that requires forwarding `roomType`.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Add the type forwarding and type-first material mapping.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Regression verification

**Files:**

- Test only: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Test only: `apps/web/src/app/floor-plan-3d/room-materials/route.spec.ts`
- Test only: `services/mitunet/tests_js/room-floor-zones.test.mjs`

- [ ] Run API, BFF, and viewer tests together.
- [ ] Inspect the diff to verify no wall, door, window, mesh, or animation path changed.
- [ ] Do not claim live classification quality until a user-authorized real API request is compared against `openai-floorplan-room-test/output/naver_125_86_63.98/result.json`.
