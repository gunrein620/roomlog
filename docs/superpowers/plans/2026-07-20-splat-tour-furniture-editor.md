# Splat Tour Furniture Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/splat-tour` open the shared 500-item furniture catalog and add, place, move, rotate, delete, and browser-save furniture without leaving the tour.

**Architecture:** Reuse the existing GLB catalog loader and furniture placement helpers. Add a focused Splat-tour editor helper for bounds, filtering, draft transitions, and save payloads. `TourViewer` owns the drawer and state, while `SplatFurnitureLayer` emits floor and furniture pointer callbacks only in edit mode.

**Tech Stack:** Next.js 16, React 19, TypeScript, React Three Fiber, Drei GLTF loader, Node built-in test runner.

## Global Constraints

- Use `loadGlbDatasetCatalog`; do not create another manifest or catalog.
- Preserve registered-asset versus browser-local furniture source priority.
- Persist only to `roomlogListingTourFurnitureLatest`; do not mutate a registered server asset.
- Keep normal WASD and drag-to-look behavior unchanged with no pending furniture.
- Use shared Korean category labels and all 500 valid GLB catalog entries.

---

## File Structure

- Create `apps/web/src/app/splat-tour/splat-furniture-editor.ts`: pure placement bounds, catalog query, draft transitions, and save payloads.
- Create `apps/web/src/app/splat-tour/splat-furniture-editor.spec.ts`: Node tests for the pure helpers.
- Modify `apps/web/src/app/splat-tour/splat-furniture-layer.tsx`: emit floor and furniture pointer callbacks and highlight a pending model.
- Modify `apps/web/src/app/splat-tour/tour-viewer.tsx`: load the GLB catalog, render the drawer, and persist local edits.
- Create `apps/web/src/app/splat-tour/splat-furniture-editor-ui.spec.ts`: regression test for the drawer contract.

### Task 1: Pure Splat Tour Editor State

**Files:**

- Create: `apps/web/src/app/splat-tour/splat-furniture-editor.ts`
- Create: `apps/web/src/app/splat-tour/splat-furniture-editor.spec.ts`

**Interfaces:**

- Consumes: `FurnitureCatalogItem`, `PlacedFurniture`, `createFurnitureModel`, `moveFurnitureDraftToPoint`, `reopenFurnitureDraft`, `rotateFurnitureQuarterTurn`.
- Produces: `TourFurnitureBounds`, `TourFurnitureDraft`, `clampTourFurniturePoint`, `beginTourFurnitureDraft`, `confirmTourFurnitureDraft`, `cancelTourFurnitureDraft`, `reopenTourFurnitureDraft`, `filterTourFurnitureCatalog`, and `createTourFurnitureSavePayload`.

- [ ] **Step 1: Write the failing test**

```ts
it("places a selected GLB item inside the tour bounds and keeps cancellation reversible", () => {
  const draft = beginTourFurnitureDraft(catalogItem, []);
  const placed = clampTourFurniturePoint(draft.pending!, { x: 9, z: -9 }, { minX: -2, maxX: 2, minZ: -1, maxZ: 1 });
  const cancelled = cancelTourFurnitureDraft({ placed: [], pending: placed, original: null });
  assert.deepEqual(placed.position, [2, catalogItem.length[1] / 2000, -1]);
  assert.deepEqual(cancelled, { placed: [], pending: null, original: null });
});

it("filters the shared catalog by Korean category and search text", () => {
  assert.deepEqual(filterTourFurnitureCatalog(catalog, "침대", "퀸").map((item) => item.furniture_id), ["bed-queen"]);
});

it("writes only the placed furniture into the browser-save payload", () => {
  assert.deepEqual(JSON.parse(createTourFurnitureSavePayload([placedFurniture], 10)), { savedAt: 10, furnitures: [placedFurniture] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture-editor.spec.ts`

Expected: FAIL because the helper module and its exports do not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export type TourFurnitureBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type TourFurnitureDraft = { placed: PlacedFurniture[]; pending: PlacedFurniture | null; original: PlacedFurniture | null };

export function clampTourFurniturePoint(furniture: PlacedFurniture, point: { x: number; z: number }, bounds: TourFurnitureBounds) {
  return moveFurnitureDraftToPoint(furniture, {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, point.z))
  });
}

export function beginTourFurnitureDraft(item: FurnitureCatalogItem, placed: PlacedFurniture[]): TourFurnitureDraft {
  return { placed, pending: createFurnitureModel(item), original: null };
}

export function confirmTourFurnitureDraft(draft: TourFurnitureDraft): TourFurnitureDraft {
  return draft.pending ? { placed: [...draft.placed, draft.pending], pending: null, original: null } : draft;
}

export function cancelTourFurnitureDraft(draft: TourFurnitureDraft): TourFurnitureDraft {
  return { placed: draft.original ? [...draft.placed, draft.original] : draft.placed, pending: null, original: null };
}

export function reopenTourFurnitureDraft(draft: TourFurnitureDraft, id: string): TourFurnitureDraft {
  const original = draft.placed.find((item) => item.id === id) ?? null;
  return original ? { placed: draft.placed.filter((item) => item.id !== id), pending: reopenFurnitureDraft(original), original } : draft;
}

export function filterTourFurnitureCatalog(items: FurnitureCatalogItem[], category: string, query: string) {
  const needle = query.trim().toLocaleLowerCase("ko");
  return items.filter((item) => (category === "전체" || furnitureCategoryLabel(item) === category) && (!needle || `${item.name} ${item.brand} ${item.category ?? ""}`.toLocaleLowerCase("ko").includes(needle)));
}

export function createTourFurnitureSavePayload(furnitures: PlacedFurniture[], savedAt = Date.now()) {
  return JSON.stringify({ savedAt, furnitures });
}
```

Implement `deleteTourFurnitureDraft` as `{ ...draft, pending: null, original: null }` so delete only discards the selected pending item.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture-editor.spec.ts`

Expected: PASS with all editor-state cases green.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/splat-tour/splat-furniture-editor.ts apps/web/src/app/splat-tour/splat-furniture-editor.spec.ts
git commit -m "feat: splat 투어 가구 편집 상태 추가"
```

### Task 2: Interactive 3D Furniture Layer

**Files:**

- Modify: `apps/web/src/app/splat-tour/splat-furniture-layer.tsx`
- Test: `apps/web/src/app/splat-tour/splat-furniture-editor.spec.ts`

**Interfaces:**

- Consumes: `TourFurnitureBounds`, `pendingFurniture`, `onFloorPointerDown`, and `onFurniturePointerDown` from `TourViewer`.
- Produces: edit-only floor hit testing and selectable furniture while retaining the existing passive display behavior.

- [ ] **Step 1: Write the failing test**

```ts
it("keeps normal rendering passive until a pending furniture draft exists", () => {
  assert.equal(shouldEnableTourFurnitureFloor(null), false);
  assert.equal(shouldEnableTourFurnitureFloor(placedFurniture), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture-editor.spec.ts`

Expected: FAIL because `shouldEnableTourFurnitureFloor` does not exist.

- [ ] **Step 3: Write the minimal implementation**

```tsx
export function shouldEnableTourFurnitureFloor(pendingFurniture: PlacedFurniture | null) {
  return pendingFurniture !== null;
}

type SplatFurnitureLayerProps = {
  furnitures: readonly PlacedFurniture[];
  pendingFurniture?: PlacedFurniture | null;
  bounds?: TourFurnitureBounds;
  onFloorPointerDown?: (point: { x: number; z: number }) => void;
  onFurniturePointerDown?: (furniture: PlacedFurniture) => void;
};

function SplatFurnitureMesh({ furniture, isPending = false, onPointerDown }: { furniture: PlacedFurniture; isPending?: boolean; onPointerDown?: (furniture: PlacedFurniture) => void }) {
  return (
    <group onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(furniture); }}>
      {furniture.modelUrl ? <SplatFurnitureGlbMesh furniture={furniture} /> : <SplatFurnitureBoxMesh furniture={furniture} />}
      {isPending ? <SplatFurnitureBoxMesh furniture={{ ...furniture, color: "#60a5fa" }} /> : null}
    </group>
  );
}

export function SplatFurnitureLayer({ furnitures, pendingFurniture = null, bounds, onFloorPointerDown, onFurniturePointerDown }: SplatFurnitureLayerProps) {
  return (
    <group>
      {furnitures.map((furniture) => <SplatFurnitureMesh furniture={furniture} key={furniture.id} onPointerDown={onFurniturePointerDown} />)}
      {pendingFurniture ? <SplatFurnitureMesh furniture={pendingFurniture} isPending key={`pending-${pendingFurniture.id}`} /> : null}
      {bounds && shouldEnableTourFurnitureFloor(pendingFurniture) ? (
        <mesh
          visible={false}
          position={[(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(event) => { event.stopPropagation(); onFloorPointerDown?.({ x: event.point.x, z: event.point.z }); }}
        >
          <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      ) : null}
    </group>
  );
}
```

The invisible floor uses `bounds` at `y=0`, stops propagation, and calls `onFloorPointerDown({ x: event.point.x, z: event.point.z })`. Existing furniture meshes are wrapped with a pointer handler that calls `onFurniturePointerDown(furniture)`. The pending GLB is rendered after confirmed furniture with a translucent blue highlight.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture-editor.spec.ts`

Expected: PASS with Task 1 and the edit-mode gate green.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/splat-tour/splat-furniture-layer.tsx apps/web/src/app/splat-tour/splat-furniture-editor.ts apps/web/src/app/splat-tour/splat-furniture-editor.spec.ts
git commit -m "feat: splat 투어 가구 배치 인터랙션 추가"
```

### Task 3: Catalog Drawer and Browser Persistence

**Files:**

- Modify: `apps/web/src/app/splat-tour/tour-viewer.tsx`
- Create: `apps/web/src/app/splat-tour/splat-furniture-editor-ui.spec.ts`

**Interfaces:**

- Consumes: Task 1 helpers, Task 2 callbacks, `loadGlbDatasetCatalog`, `listFurnitureCategoryFilters`, `furnitureCategoryLabel`, and `furnitureImageUrl`.
- Produces: an accessible `가구 카탈로그` drawer with search, category counts, cards, placed-item list, controls, and automatic browser-local save after confirm/delete.

- [ ] **Step 1: Write the failing test**

```ts
it("opens the 500-item catalog drawer from the furniture control", () => {
  const source = readFileSync(new URL("./tour-viewer.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-label="가구 카탈로그"/);
  assert.match(source, /loadGlbDatasetCatalog/);
  assert.match(source, /isFurnitureCatalogOpen/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture-editor-ui.spec.ts`

Expected: FAIL because the current `가구` control only toggles visibility and no catalog drawer exists.

- [ ] **Step 3: Write the minimal implementation**

```tsx
const [isFurnitureCatalogOpen, setIsFurnitureCatalogOpen] = useState(false);
const [catalog, setCatalog] = useState<FurnitureCatalogItem[]>(FURNITURE_CATALOG);
const [catalogQuery, setCatalogQuery] = useState("");
const [category, setCategory] = useState("전체");

useEffect(() => {
  void loadGlbDatasetCatalog().then((items) => { if (items.length) setCatalog(items); }).catch(() => undefined);
}, []);

function persist(furnitures: PlacedFurniture[]) {
  window.localStorage.setItem(LISTING_TOUR_FURNITURE_LATEST_KEY, createTourFurnitureSavePayload(furnitures));
}
```

Replace the visibility-only control with a button that opens the drawer. The drawer renders shared category tabs, search, paged cards, the placed-item list, and confirm/cancel/rotate/delete controls. Confirm and delete call `persist(nextPlaced)` and update both displayed and editor state. Close never discards a confirmed item; cancel only clears the pending draft.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture-editor-ui.spec.ts`

Expected: PASS with the drawer contract present.

- [ ] **Step 5: Run focused regression tests**

Run: `pnpm.cmd exec tsx --test src/app/splat-tour/splat-furniture*.spec.ts`

Expected: PASS with existing source-priority tests plus the new editor tests green.

- [ ] **Step 6: Build and manually verify**

Run: `pnpm.cmd run build`

Expected: exit code 0. Open `http://localhost:3000/splat-tour`, click `가구`, verify categories and search load the GLB catalog, place a model, rotate it, confirm it, reopen it, delete it, then reload and verify the confirmed layout remains in this browser.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/app/splat-tour/tour-viewer.tsx apps/web/src/app/splat-tour/splat-furniture-editor-ui.spec.ts
git commit -m "feat: splat 투어 500개 가구 카탈로그 연결"
```

## Self-Review

- Spec coverage: Task 1 covers state, bounds, cancellation, filtering, and persistence payloads; Task 2 covers the canvas interaction surface; Task 3 covers the catalog, shared loader, controls, persistence, and manual verification.
- Placeholder scan: no TBD, TODO, or unspecified validation work remains.
- Type consistency: `PlacedFurniture`, `FurnitureCatalogItem`, `TourFurnitureBounds`, and `TourFurnitureDraft` are defined before every consumer task.
