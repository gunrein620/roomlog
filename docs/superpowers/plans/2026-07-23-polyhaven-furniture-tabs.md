# Poly Haven Furniture Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `내가구 | 등록된 가구 | 폴리` source tabs to every Roomlog furniture placement surface and make all 519 preloaded Poly Haven models searchable, thumbnail-visible, and placeable.

**Architecture:** Keep the existing 600-item catalog and the new 519-item Poly Haven catalog as independent S3 manifests. A shared lazy loader normalizes the Poly manifest into `FurnitureCatalogItem` records, while each placement surface owns only selected-source state and reuses its existing search, category, placement, and persistence paths.

**Tech Stack:** Next.js 16, React 19, TypeScript, Three.js, Node test runner, Node.js offline catalog tooling, AWS S3.

## Global Constraints

- Source tabs are ordered and labelled exactly `내가구 | 등록된 가구 | 폴리`.
- Apply the tabs to listing/owner 3D, floor-plan editor, and Splat tour.
- Show all 519 Poly Haven models; do not exclude large assets.
- Models at or above 50 MiB display a `대용량` warning but remain selectable.
- Poly thumbnails use S3 snapshots with `object-fit: contain`; the browser does not call the Poly Haven API.
- Preserve the existing registered catalog of 600 items.
- Use existing CSS tokens; do not add raw hex values.
- Finish on `main` with local commits only; do not push.

---

### Task 1: Generate a Poly Haven placement catalog

**Files:**
- Create: `scripts/build-polyhaven-catalog.mjs`
- Create: `scripts/build-polyhaven-catalog.test.mjs`

**Interfaces:**
- Consumes: local Poly Haven GLB directory and `GET https://api.polyhaven.com/assets?t=models`
- Produces: `buildPolyhavenCatalog({ sourceRoot, apiAssets, thumbnailBaseUrl })` and a `catalog.json` with 519 placement records

- [ ] **Step 1: Write failing tests for category mapping, metadata, dimensions, and large-file flags**

Test a synthetic GLB JSON chunk and API record. Assert the output contains:

```js
{
  assetId: "ArmChair_01",
  relativePath: "polyhaven-cc0/ArmChair_01.glb",
  thumbnailPath: "polyhaven-cc0/thumbnails/ArmChair_01.png",
  sizeMm: { width: 1000, height: 800, depth: 700 },
  bytes: 52428800,
  catalogCategoryLabel: "소파·의자",
  license: "CC0-1.0"
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/build-polyhaven-catalog.test.mjs
```

Expected: FAIL because `build-polyhaven-catalog.mjs` does not exist.

- [ ] **Step 3: Implement the minimal catalog builder**

The script must:

- read GLB header/JSON chunks without decoding texture binaries;
- combine accessor bounds through node transforms into millimetre bounds;
- match all local filenames to Poly Haven API asset IDs case-insensitively;
- map category/tags to Roomlog categories;
- emit stable relative paths, S3 thumbnail paths, source URL, tags, bytes, and license;
- download 256px thumbnails with `User-Agent: RoomlogCatalog/1.0 (https://woo-zu.com)`;
- support `--source`, `--output`, and `--thumbnail-output`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/build-polyhaven-catalog.test.mjs
```

Expected: PASS.

### Task 2: Add the shared lazy Poly catalog loader

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-model/types.ts`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/catalog-sources.ts`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/polyhaven-catalog.ts`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/polyhaven-catalog.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/furniture-placement/index.ts`

**Interfaces:**
- Produces:

```ts
type FurnitureCatalogSource = "mine" | "catalog" | "poly";
const FURNITURE_CATALOG_SOURCE_TABS: ReadonlyArray<{ id: FurnitureCatalogSource; label: string }>;
function loadPolyhavenCatalog(fetcher?: typeof fetch): Promise<FurnitureCatalogItem[]>;
function resetPolyhavenCatalogCache(): void;
function isLargeFurnitureAsset(item: FurnitureCatalogItem): boolean;
```

- [ ] **Step 1: Write failing loader tests**

Cover valid normalization, invalid-record filtering, S3 base URL resolution, promise caching, cache reset/retry, tags, bytes, and `placementCapability`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @roomlog/web exec tsx --test src/app/floor-plan-3d/furniture-placement/polyhaven-catalog.spec.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal source contract and lazy loader**

Extend `FurnitureCatalogItem` with:

```ts
assetBytes?: number;
tags?: string[];
```

Resolve `polyhaven-cc0/catalog.json` beneath the existing configured furniture base URL and normalize every valid record to a placeable item.

- [ ] **Step 4: Run focused catalog tests and verify GREEN**

Run:

```bash
pnpm --filter @roomlog/web exec tsx --test \
  src/app/floor-plan-3d/furniture-placement/polyhaven-catalog.spec.ts \
  src/app/floor-plan-3d/furniture-placement/catalog.spec.ts \
  src/app/floor-plan-3d/furniture-placement/glb-dataset-catalog.spec.ts
```

Expected: PASS.

### Task 3: Integrate source tabs into the shared listing/owner 3D drawer

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts`
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.catalog.spec.ts`

**Interfaces:**
- Consumes: `FurnitureCatalogSource`, `loadPolyhavenCatalog`, `isLargeFurnitureAsset`
- Produces: three source tabs, lazy Poly load/retry, readable thumbnail fallback, and existing placement selection

- [ ] **Step 1: Add failing source-tab and lazy-loading contract tests**

Assert exact tab order, labels, Poly load only from the Poly selection handler/effect, 50 MiB badge, retry action, and `object-fit: contain`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @roomlog/web exec tsx --test \
  src/app/_components/listing-tour-room3d-owner.spec.ts \
  src/app/_components/ListingTourRoom3D.catalog.spec.ts
```

- [ ] **Step 3: Implement the three-source drawer**

Keep `mine` handling intact, rename `등록 가구` to `등록된 가구`, add `폴리`, and select either registered or Poly arrays before existing filtering and placement.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Use the same command as Step 2; expected PASS.

### Task 4: Integrate source tabs into the floor-plan editor

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/editor-source-tabs.spec.ts`

**Interfaces:**
- Consumes: tenant furniture API, registered catalog, Poly lazy loader
- Produces: the same three tabs and source-specific item selection in the floor-plan drawer

- [ ] **Step 1: Write a failing editor source-tabs contract test**
- [ ] **Step 2: Run it and verify RED**
- [ ] **Step 3: Add tenant furniture loading, source tabs, Poly retry/loading state, and shared card metadata**
- [ ] **Step 4: Run the test and existing floor-plan catalog tests; verify GREEN**

Commands:

```bash
pnpm --filter @roomlog/web exec tsx --test \
  src/app/floor-plan-3d/furniture-placement/editor-source-tabs.spec.ts \
  src/app/floor-plan-3d/furniture-placement/catalog.spec.ts
```

### Task 5: Integrate source tabs into the Splat tour drawer

**Files:**
- Modify: `apps/web/src/app/splat-tour/tour-viewer.tsx`
- Modify: `apps/web/src/app/splat-tour/splat-furniture-editor.ts`
- Modify: `apps/web/src/app/splat-tour/splat-furniture-editor-ui.spec.ts`

**Interfaces:**
- Consumes: the same three catalog sources
- Produces: source tabs whose selected items continue through `beginTourFurnitureDraft`

- [ ] **Step 1: Add failing tests for exact source-tab order and Poly placement**
- [ ] **Step 2: Run the focused tests and verify RED**
- [ ] **Step 3: Implement source state, tenant furniture conversion, Poly lazy load, and thumbnail/large badge UI**
- [ ] **Step 4: Run Splat furniture tests and verify GREEN**

Run:

```bash
pnpm --filter @roomlog/web exec tsx --test \
  src/app/splat-tour/splat-furniture-editor-ui.spec.ts \
  src/app/splat-tour/splat-furniture.spec.ts
```

### Task 6: Build and publish the S3 catalog snapshot

**Files:**
- Generated outside Git: local `polyhaven-cc0/catalog.json` and `polyhaven-cc0/thumbnails/*.png`

**Interfaces:**
- Consumes: Task 1 script and `/Users/kunwoopark/Desktop/우주-룸로그자료/polyhaven-cc0`
- Produces: 519-record S3 catalog and 519 S3 thumbnails

- [ ] **Step 1: Run the builder against the local dataset**
- [ ] **Step 2: Validate 519 records, positive dimensions, 519 unique GLB paths, and 519 thumbnails**
- [ ] **Step 3: Stream/upload thumbnails and `catalog.json` through the EC2 AWS credentials**
- [ ] **Step 4: Verify S3 object counts, bytes, content types, public CORS, and that `furniture/catalog.json` remains 600 items**

### Task 7: Full verification and local main commit

**Files:**
- Verify all modified files

- [ ] **Step 1: Run focused tests**
- [ ] **Step 2: Run `pnpm test:web`**
- [ ] **Step 3: Run `bash scripts/verify.sh`**
- [ ] **Step 4: Check `git diff --check` and review the complete diff**
- [ ] **Step 5: Commit on `main` without pushing**

Suggested commit:

```bash
git add apps/web scripts docs/superpowers/plans/2026-07-23-polyhaven-furniture-tabs.md
git commit -m "feat(web): add Poly Haven furniture source tabs"
```
