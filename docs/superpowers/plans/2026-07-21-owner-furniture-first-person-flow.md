# Owner Furniture First-Person Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the landlord's MitUNet furniture stage into the same React/R3F first-person furniture simulation used on listing detail, then save the confirmed layout back into the existing request-scoped listing snapshot.

**Architecture:** MitUNet remains the plan extraction and review surface. Its furniture-stage action serializes a request-scoped handoff and navigates to a new owner furniture route; that route renders `ListingTourRoom3D` in owner mode, using the existing first-person controller and automatic surface resolver. Owner mode supplies overview/furniture tabs and a persistence callback instead of listing-detail local storage.

**Tech Stack:** Next.js 16 App Router, React, React Three Fiber, Three.js, TypeScript, browser localStorage, Node test runner.

## Global Constraints

- Keep MitUNet plan extraction, wall review, floor materials, JSON download, and listing-return behavior intact.
- The owner furniture mode uses `W/A/S/D`, mouse look, `2`, `E`, `1`, `3`, `Q`, `R`, and `Esc` with the same meanings as listing detail.
- Only confirmed furniture is persisted; pending furniture is cancelled or restored before leaving furniture mode.
- Preserve optional `placement` metadata through the request-scoped snapshot; legacy furniture without metadata is floor placement.
- Do not enable pointer-lock furniture editing on coarse-pointer devices.
- Use the existing request key `roomlogListingFloorPlan3D:<requestId>` for the final registration snapshot.
- Do not add a second automatic surface-placement implementation to `services/mitunet/viewer/index.html`.

---

### Task 1: Define and validate the owner furniture handoff contract

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/owner-furniture-handoff.ts`
- Create: `apps/web/src/app/floor-plan-3d/owner-furniture-handoff.spec.ts`
- Modify: `services/mitunet/viewer/roomlog-integration.mjs`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts`

**Interfaces:**
- Produces: `ownerFurnitureDraftStorageKey(requestId: string): string`
- Produces: `readOwnerFurnitureDraft(storage: Storage, requestId: string): OwnerFurnitureDraft`
- Produces: `writeOwnerFurnitureDraft(storage: Storage, draft: OwnerFurnitureDraft): void`
- Produces in the viewer integration module: `beginRoomLogFurnitureSimulation(context, plan, sourceName, furnitures, previewMode, previewImageB64)`

- [ ] **Step 1: Write failing contract tests**

Test that the storage key is request-scoped, malformed drafts throw, valid MitUNet/furniture data round-trips, and `placement` metadata survives. Extend the proxy test to require the viewer integration export and owner route URL.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/owner-furniture-handoff.spec.ts src/app/floor-plan-3d/mitunet-proxy.spec.ts`

Expected: FAIL because the handoff module and `beginRoomLogFurnitureSimulation` do not exist.

- [ ] **Step 3: Implement the minimal handoff module and viewer writer**

Use this data boundary:

```ts
export type OwnerFurnitureDraft = {
  requestId: string;
  savedAt: number;
  floorPlan: ListingFloorPlan3D;
};

export const OWNER_FURNITURE_DRAFT_PREFIX = "roomlogOwnerFurnitureDraft";
```

The viewer writer must call the existing `buildRoomLogCompletion`, store `{ requestId, savedAt, floorPlan: { walls3D: [], furnitures: payload.furnitures, mitunet: payload } }`, and navigate to `/floor-plan-3d/owner-furniture?requestId=<encoded id>&returnOrigin=<encoded origin>`.

- [ ] **Step 4: Run the focused tests and confirm pass**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/owner-furniture-handoff.spec.ts src/app/floor-plan-3d/mitunet-proxy.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/floor-plan-3d/owner-furniture-handoff.ts apps/web/src/app/floor-plan-3d/owner-furniture-handoff.spec.ts services/mitunet/viewer/roomlog-integration.mjs apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts
git commit -m "feat: add owner furniture handoff contract"
```

### Task 2: Preserve placement metadata in the MitUNet RoomLog bridge

**Files:**
- Modify: `services/mitunet/viewer/roomlog-integration.mjs`
- Modify: `services/mitunet/viewer/roomlog-integration.test.mjs`

**Interfaces:**
- Consumes: raw viewer furniture with optional `placement`
- Produces: mapped listing furniture with validated `placement?: { mode: "floor" | "surface" | "wall"; supportFurnitureId?: string; wallId?: string }`

- [ ] **Step 1: Add failing mapper tests**

Cover floor, surface, wall, legacy missing metadata, invalid mode, missing surface support ID, and missing wall ID.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test services/mitunet/viewer/roomlog-integration.test.mjs`

Expected: FAIL because `mapFurniturePlacements` currently drops `placement`.

- [ ] **Step 3: Add strict optional attachment validation**

Implement `validatedFurniturePlacement(value, index)` so missing values return `undefined`, valid values are copied, and inconsistent references throw via `invalidFurniture`.

- [ ] **Step 4: Run tests and confirm pass**

Run: `node --test services/mitunet/viewer/roomlog-integration.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/mitunet/viewer/roomlog-integration.mjs services/mitunet/viewer/roomlog-integration.test.mjs
git commit -m "fix: preserve owner furniture attachments"
```

### Task 3: Make the shared listing simulation support an owner adapter

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.catalog.spec.ts`
- Create: `apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts`

**Interfaces:**
- Adds props:

```ts
type ListingTourRoom3DProps = {
  floorPlan: ListingFloorPlan3D;
  simulationOpen?: boolean;
  listingId: string;
  variant?: "sheet" | "hero";
  experience?: "listing" | "owner";
  initialSimulationMode?: "overview" | "walk" | "furniture";
  onOwnerFurnitureSave?: (furnitures: ListingFloorPlanFurniture[]) => void;
};
```

- Owner `overview` renders orbit controls; owner `furniture` renders `FurnitureFirstPersonControls`.
- Listing behavior and storage keys remain unchanged when `experience` is omitted.

- [ ] **Step 1: Add failing source-contract tests**

Require owner props, `전체보기`/`가구 배치` tab labels, owner callback use, `initialSimulationMode="furniture"`, and the absence of listing-tour storage writes in the owner save branch.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/_components/listing-tour-room3d-owner.spec.ts src/app/_components/ListingTourRoom3D.catalog.spec.ts`

Expected: FAIL because owner props and overview mode do not exist.

- [ ] **Step 3: Generalize modes and persistence without duplicating placement state**

Keep the existing state machine and handlers. Add `overview` as an orbit-control mode, initialize from the prop, render owner tab copy, and route the save button to `onOwnerFurnitureSave` with the confirmed furniture list. Before switching from furniture to overview, call the existing pending cancellation path.

- [ ] **Step 4: Run tests and confirm pass**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/_components/listing-tour-room3d-owner.spec.ts src/app/_components/ListingTourRoom3D.catalog.spec.ts src/app/floor-plan-3d/room-scene/furniture-first-person-controls.spec.ts src/app/floor-plan-3d/furniture-placement/surface-placement.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/_components/ListingTourRoom3D.catalog.spec.ts apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts
git commit -m "refactor: share furniture simulation with owners"
```

### Task 4: Add the owner furniture route and final registration save

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/owner-furniture/page.tsx`
- Create: `apps/web/src/app/floor-plan-3d/owner-furniture/OwnerFurnitureSimulation.tsx`
- Create: `apps/web/src/app/floor-plan-3d/owner-furniture/owner-furniture.css`
- Create: `apps/web/src/app/floor-plan-3d/owner-furniture/owner-furniture-page.spec.ts`

**Interfaces:**
- Consumes: `requestId` and `returnOrigin` query parameters plus `OwnerFurnitureDraft`
- Consumes: `ListingTourRoom3D` owner adapter
- Produces: `roomlogListingFloorPlan3D:<requestId>` with confirmed furniture and redirects to `/?flow=listing&floorPlanRequestId=<requestId>#my-page`

- [ ] **Step 1: Add failing route contract tests**

Require the client component, request validation, owner experience props, initial furniture mode, final snapshot key, and registration return URL.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/owner-furniture/owner-furniture-page.spec.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route and client adapter**

The client loads the draft after mount, renders a clear recovery state for missing/corrupt data, and calls:

```tsx
<ListingTourRoom3D
  experience="owner"
  floorPlan={draft.floorPlan}
  initialSimulationMode="furniture"
  listingId={draft.requestId}
  onOwnerFurnitureSave={saveAndReturn}
  simulationOpen
  variant="hero"
/>
```

`saveAndReturn` writes `{ name, savedAt, walls3D, furnitures, mitunet }` to the established request-scoped key, updates the handoff draft, and redirects only after both writes succeed.

- [ ] **Step 4: Run focused tests and TypeScript check**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/owner-furniture/owner-furniture-page.spec.ts src/app/floor-plan-3d/owner-furniture-handoff.spec.ts && pnpm --filter web exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/floor-plan-3d/owner-furniture
git commit -m "feat: add owner first-person furniture route"
```

### Task 5: Connect the MitUNet furniture-stage action

**Files:**
- Modify: `services/mitunet/viewer/index.html`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-session-bridge.spec.ts`

**Interfaces:**
- Consumes: `beginRoomLogFurnitureSimulation`
- Owner RoomLog flow: the `Floor`/`가구 배치` action hands off to the shared route.
- Standalone non-RoomLog demo flow: existing in-view MitUNet furnishing behavior remains intact.

- [ ] **Step 1: Add failing integration assertions**

Require a RoomLog-only branch in `enterFurnishingStage`, current plan/furniture serialization, and a fallback to the existing furnishing stage for non-integrated usage.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/mitunet-proxy.spec.ts src/app/floor-plan-3d/mitunet-session-bridge.spec.ts`

Expected: FAIL because the button still opens the legacy furniture panel in RoomLog mode.

- [ ] **Step 3: Wire the RoomLog-only handoff**

At the start of `enterFurnishingStage`, validate `roomLogContext`, call `beginRoomLogFurnitureSimulation` with `currentComposedPlan`, `currentSourceName`, and `currentFurniturePlacements()`, then return. Keep the existing function body for non-RoomLog sessions.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/mitunet-proxy.spec.ts src/app/floor-plan-3d/mitunet-session-bridge.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/mitunet/viewer/index.html apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts apps/web/src/app/floor-plan-3d/mitunet-session-bridge.spec.ts
git commit -m "feat: open shared owner furniture simulation"
```

### Task 6: End-to-end verification and documentation

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/README.md`
- Modify: `docs/superpowers/plans/2026-07-21-owner-furniture-first-person-flow.md`

**Interfaces:**
- Documents the owner handoff route, storage boundaries, and verification sequence.

- [ ] **Step 1: Run the complete automated verification**

Run: `pnpm test:web`

Expected: PASS.

Run: `bash scripts/verify.sh`

Expected: PASS for types, UI, web, API build, and API smoke.

- [ ] **Step 2: Rebuild the standard Docker web service**

Run: `docker compose up -d --build web`

Expected: the `web` container is healthy and serves port 3000.

- [ ] **Step 3: Perform browser verification**

Verify the registration flow: upload or load a plan, enter `가구 배치`, use `2` to select a catalogue item, place with `Q`, rotate with `1/3`, pick with `E`, remove/cancel with `R`/`Esc`, test floor/surface/wall targeting, switch to `전체보기`, save, return to registration, reopen, and confirm persistence.

- [ ] **Step 4: Document the shared boundary and mark this plan complete**

Add the route, storage keys, and shared-control ownership to the floor-plan README. Check completed plan steps only after their commands pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/floor-plan-3d/README.md docs/superpowers/plans/2026-07-21-owner-furniture-first-person-flow.md
git commit -m "docs: document owner furniture simulation flow"
```
