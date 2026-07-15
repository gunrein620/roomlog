# MitUNet Listing Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a MitUNet conversion travel through the normal RoomLog listing lifecycle: registration draft → floor-plan payload → listing card/detail → Three.js 3D tour.

**Architecture:** RoomLog serves MitUNet through its internal proxy. The proxy stores canonical `roomlog-mitunet-floor-plan` JSON in `roomlogListingFloorPlan3D` and returns to `/?flow=listing#my-page`; registration includes that snapshot in the trade payload. Listing projection treats either populated legacy `walls3D` or a MitUNet payload as a 3D plan, while the shared Three.js tour renderer consumes either representation.

**Tech Stack:** Next.js route handlers and client components, TypeScript, Node test runner, MitUNet viewer modules, Three.js via React Three Fiber.

## Global Constraints

- Keep the external MitUNet project unmodified; integration code belongs in RoomLog.
- Keep the editor route inside RoomLog and the conversion request proxied to the existing MitUNet server.
- Treat `mitunet` data as a valid 3D plan even when `walls3D` is empty.
- Preserve existing populated `walls3D` plans unchanged.
- Do not show 3D tour entry controls for listings without a connected plan.
- Do not create a git commit unless the user requests one.

---

### Task 1: Keep registration state across the internal editor round trip

**Files:**

- Modify: `apps/web/src/lib/owner-draft.ts`
- Modify: `apps/web/src/lib/owner-draft.spec.ts`
- Modify: `apps/web/src/app/my/flows/LandlordMyPage.tsx`

**Interfaces:**

- Produces `saveOwnerDraft(storage, state, savedAt?): string`.
- Consumes the current form, photo count, 3D connection state, status, and draft listing summaries.

- [ ] **Step 1: Write the failing synchronous-draft test**

```ts
const returnedSavedAt = saveOwnerDraft(storage, sampleState, savedAt);
assert.equal(returnedSavedAt, savedAt);
assert.equal(parseOwnerDraft(entries.get(OWNER_DRAFT_STORAGE_KEY)!).ownerForm.title, sampleState.ownerForm.title);
```

- [ ] **Step 2: Run the test and verify the missing writer fails**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/lib/owner-draft.spec.ts`

Expected: TypeScript reports that `saveOwnerDraft` is not exported.

- [ ] **Step 3: Implement the writer and call it before navigation**

```ts
export function saveOwnerDraft(storage, state, savedAt = new Date().toISOString()) {
  storage.setItem(OWNER_DRAFT_STORAGE_KEY, serializeOwnerDraft(state, savedAt));
  return savedAt;
}
```

Call it synchronously in `openMitunetEditor` before the photo persistence await and internal `window.location.href` assignment. Reuse it in the existing autosave effect.

- [ ] **Step 4: Run the draft test and verify it passes**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/lib/owner-draft.spec.ts`

Expected: all owner-draft tests pass.

### Task 2: Project both plan representations into a RoomLog tour

**Files:**

- Create: `apps/web/src/lib/listing-catalog.spec.ts`
- Modify: `apps/web/src/lib/listing-catalog.ts`
- Modify: `apps/web/src/app/_components/ListingDetailView.tsx`

**Interfaces:**

- Consumes `TradeListing.floorPlan?: { walls3D, furnitures, mitunet? }`.
- Produces `Listing.has3DTour`, `Listing.floorPlan3D`, card badges/tags, and gated detail-page tour controls.

- [ ] **Step 1: Write a failing MitUNet-only mapper test**

```ts
const card = tradeListingToCard(createListing({ walls3D: [], furnitures: [], mitunet: mitunetPlan }));
assert.equal(card.has3DTour, true);
assert.equal(card.floorPlan3D?.mitunet, mitunetPlan);
assert.ok(card.badges.includes("3D 투어"));
```

Also test that populated `walls3D` remains a 3D tour and no plan remains non-tour.

- [ ] **Step 2: Run the mapper test and verify the MitUNet case fails**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/lib/listing-catalog.spec.ts`

Expected: the MitUNet-only card initially has `has3DTour === false`.

- [ ] **Step 3: Recognize both data shapes and gate the detail controls**

```ts
export function hasSavedFloorPlan3D(floorPlan): floorPlan is ListingFloorPlan3D {
  return Boolean(floorPlan) && (floorPlan.walls3D.length > 0 || floorPlan.mitunet !== undefined);
}
```

Use it inside `tradeListingToCard`. Use the mapped `has3DTour` flag to conditionally render the quick-action button, fixed-bar button, and tour sheet. Leave `ListingTourRoom3D` as the renderer so a MitUNet plan reaches the existing Three.js path.

- [ ] **Step 4: Run mapper and control-visibility tests**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/lib/listing-catalog.spec.ts`

Expected: MitUNet-only and legacy `walls3D` cards are tours; no-plan cards are not; tour controls require a connected tour flag.

### Task 3: Verify the full registration path and internal server behavior

**Files:**

- Test: `apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts`
- Test: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`
- Test: `apps/web/src/app/my/flows/landlord-mitunet-entry.spec.ts`
- Test: `apps/web/src/lib/mitunet-floor-plan.spec.ts`
- Test: `apps/api/src/trade/mitunet-floor-plan.spec.ts`
- Test: `apps/api/src/trade/trade-mitunet-persistence.spec.ts`

- [ ] **Step 1: Run focused web and API tests**

Run:

```powershell
$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'
node --test -r ts-node/register src/app/floor-plan-3d/mitunet-proxy.spec.ts src/app/floor-plan-3d/mitunet-internal-page.spec.ts src/app/my/flows/landlord-mitunet-entry.spec.ts src/lib/mitunet-floor-plan.spec.ts src/lib/owner-draft.spec.ts src/lib/listing-catalog.spec.ts
node --test -r ts-node/register src/trade/mitunet-floor-plan.spec.ts src/trade/trade-mitunet-persistence.spec.ts
```

Expected: all tests pass.

- [ ] **Step 2: Build and live-check the RoomLog route**

Run: `node scripts/next-with-root-env.mjs build`

Expected: exit code 0. Restart the local RoomLog server, then fetch the internal editor, transformed integration module, registration route, and MitUNet health proxy. Confirm the editor is internal, save/return persists `roomlogListingFloorPlan3D`, and the returned route is the listing registration page.
