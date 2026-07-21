# Furniture Surface Height Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve surface and wall attachment metadata through listing API persistence so elevated furniture remains at its saved height.

**Architecture:** Keep the editor and renderer coordinate conventions unchanged. Expand the trade API's normalized furniture contract and validate the existing placement metadata at the server boundary before storing it.

**Tech Stack:** TypeScript, NestJS service domain, Node test runner, file-backed trade persistence.

## Global Constraints

- Preserve elevated `position[1]` exactly as submitted when it is finite.
- Accept only `floor`, `surface`, and `wall` placement modes.
- Require `supportFurnitureId` for `surface` and `wallId` for `wall`.
- Keep legacy furniture without placement metadata valid.

---

### Task 1: Lock the persistence regression

**Files:**
- Modify: `apps/api/src/trade/trade-mitunet-persistence.spec.ts`

**Interfaces:**
- Consumes: `TradeService.createListing()` and `TradeService.listListings()`.
- Produces: A regression assertion for the persisted `ListingFloorPlanFurniture.placement` contract.

- [ ] **Step 1: Write the failing test**

Create a listing containing a desk and a monitor with `position: [1, 0.754, 2]` and `placement: { mode: "surface", supportFurnitureId: "desk-1" }`. Restart `TradeService` from the same store path and assert that both fields are unchanged.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --dir apps/api exec node --test -r ts-node/register src/trade/trade-mitunet-persistence.spec.ts`

Expected: FAIL because the saved furniture has no `placement` property.

### Task 2: Preserve validated attachment metadata

**Files:**
- Modify: `apps/api/src/trade/trade.service.ts`

**Interfaces:**
- Produces: `ListingFloorPlanFurniture.placement?: ListingFloorPlanFurniturePlacement` where surface and wall references are validated non-empty strings.

- [ ] **Step 1: Add the placement types and normalizer**

Define the three placement shapes and a helper that returns a sanitized placement or `undefined`.

- [ ] **Step 2: Include the normalized placement in each stored furniture**

Spread `{ placement }` only when validation succeeds so legacy data remains unchanged.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `pnpm --dir apps/api exec node --test -r ts-node/register src/trade/trade-mitunet-persistence.spec.ts`

Expected: all tests pass.

### Task 3: Verify and publish

**Files:**
- Verify all modified files.

**Interfaces:**
- Produces: a verified commit pushed to `origin/main`.

- [ ] **Step 1: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: exit code 0.

- [ ] **Step 2: Inspect the final diff and whitespace**

Run: `git diff --check && git status -sb && git diff --stat`

Expected: no whitespace errors and only scoped files changed.

- [ ] **Step 3: Commit and push main**

Commit the design, plan, test, and implementation with a focused fix message, then run `git push origin main`.
