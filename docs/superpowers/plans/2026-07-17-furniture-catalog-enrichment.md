# Furniture Catalog Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and consume a Korean, image-backed logical catalog for the 1,680 locally served furniture GLBs.

**Architecture:** A dependency-free Node builder enriches the existing runtime `manifest.json` from the source thumbnail cache and a durable Korean-name cache. The web catalog adapter consumes optional enriched fields but preserves the current manifest fallback contract.

**Tech Stack:** Node.js built-in modules, TypeScript, Node test runner, Next.js runtime asset route.

## Global Constraints

- Preserve existing GLB paths, dimensions, and user changes.
- Use only one thumbnail URL per catalog item; do not copy the scraper's page-wide image lists.
- Fetch Korean product names only from official IKEA Korea URLs and cache every successful response.
- Do not move, rename, or delete GLB files.

---

### Task 1: Define and test deterministic catalog enrichment

**Files:**
- Create: `scripts/furniture-catalog-builder.mjs`
- Create: `scripts/furniture-catalog-builder.test.mjs`

**Interfaces:**
- Produces: `enrichManifest(manifest, thumbnailCache, nameCache): { manifest, summary }`
- Produces: `classifyCatalogItem(relativePath): { key, label, included }`

- [ ] **Step 1: Write failing tests** for the wireless charger fixture, a sofa-bed fixture, and a cabinet-part fixture. Assert Korean category labels, product thumbnail matching by product ID, Korean URL conversion, and exclusion behavior.
- [ ] **Step 2: Run `node --test scripts/furniture-catalog-builder.test.mjs`** and confirm failure because the builder does not exist.
- [ ] **Step 3: Implement only the pure enrichment helpers** and run the same command until all fixtures pass.

### Task 2: Build the repeatable manifest generator

**Files:**
- Modify: `scripts/furniture-catalog-builder.mjs`
- Modify: `scripts/furniture-catalog-builder.test.mjs`

**Interfaces:**
- Consumes: runtime manifest, `thumbnail-cache.json`, Korean-name cache.
- Produces: enriched runtime manifest and a `furniture-name-ko-cache.json` cache.

- [ ] **Step 1: Add a failing CLI test** that verifies only `thumbnailUrl` is persisted and unresolved products receive a Korean fallback.
- [ ] **Step 2: Run the targeted test and confirm the missing CLI behavior fails.**
- [ ] **Step 3: Implement JSON reads/writes, `--fetch-korean-names`, bounded concurrent requests to official IKEA Korea pages, and durable name-cache updates.**
- [ ] **Step 4: Run all builder tests.**

### Task 3: Consume enriched fields in the placement catalog

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/furniture-placement/glb-dataset-catalog.ts`
- Create: `apps/web/src/app/floor-plan-3d/furniture-placement/glb-dataset-catalog.spec.ts`

**Interfaces:**
- Consumes: `displayNameKo`, `catalogCategoryLabel`, `thumbnailUrl`, `imageUrls`, and `sourceUrl` from manifest items.
- Produces: `FurnitureCatalogItem` with Korean card text and product image metadata.

- [ ] **Step 1: Write a failing adapter test** that expects enriched fields to override filename/category fallbacks.
- [ ] **Step 2: Run the web unit-test runner and confirm the expected failure.**
- [ ] **Step 3: Extend the manifest item type and adapter with the smallest fallback-safe change.**
- [ ] **Step 4: Run the targeted adapter test and `pnpm test:web`.**

### Task 4: Generate and verify live catalog data

**Files:**
- Modify: `runtime-assets/furniture-glb-dataset/manifest.json` (ignored runtime asset)
- Create: `runtime-assets/furniture-glb-dataset/furniture-name-ko-cache.json` (ignored runtime asset)

- [ ] **Step 1: Run the builder against the RoomLog runtime manifest and the E-drive source thumbnail cache.**
- [ ] **Step 2: Validate item count, Korean-name coverage, thumbnail coverage, and the known NORDMÄRKE item.**
- [ ] **Step 3: Run `pnpm test:web` and `pnpm build:web` to verify the web consumer.**
