# RoomLog MitUNet 3D Style Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved MitUNet plans use the same RoomLog 3D materials, lighting, wood interior, and concrete exterior as the MitUNet furnishing view while keeping the exterior ground only 12% beyond the plan's long side.

**Architecture:** Keep the saved `MitunetFloorPlan` payload and all polygon geometry unchanged. Add pure surface-calculation helpers and browser-only texture factories, then let `RoomlogThreeFloorPlanView` select the styled scene only when `mitunetPlan` is present; legacy `walls3D` rendering retains its current appearance.

**Tech Stack:** TypeScript, React 19, React Three Fiber, Drei, Three.js 0.185, Node test runner with `ts-node/register`, Next.js 16.

## Global Constraints

- Exterior padding is `max(planWidth, planDepth) * 0.12` on each side.
- Camera auto-fit continues to use wall bounds only; decorative ground never changes camera distance.
- Do not modify wall, door, or window polygons, heights, openings, detection, or saved payloads.
- Doors remain fully open with no header geometry; the existing three window layers remain unchanged.
- Furniture GLB materials, placement controls, and completion behavior remain unchanged.
- Decorative floor meshes must not intercept furniture pointer events.
- Existing uncommitted changes are user-owned. Never stage or overwrite unrelated hunks, especially in `RoomlogThreeFloorPlanView.tsx`.

---

## File Structure

- Create `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.ts`: pure scene bounds, interior mask, wood pixels, and texture-plane placement.
- Create `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts`: pure helper tests.
- Create `apps/web/src/app/floor-plan-3d/room-scene/mitunet-textures.ts`: browser `CanvasTexture` factories and disposal-friendly return values.
- Create `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts`: source-level regression assertions for material and lighting parity.
- Modify `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx`: styled MitUNet scene, decorative floors, material selection, and unchanged interaction layer.

### Task 1: Pure surface calculations

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.ts`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts`

**Interfaces:**
- Consumes: `MitunetFloorPlan`, `MitunetPolygonGroups`, and `MitunetSceneLayout`.
- Produces: `MITUNET_RENDER_STYLE`, `calculateMitunetGroundBounds`, `calculateMitunetTexturePlane`, `buildInteriorMask`, `maskContains`, and `buildWoodRgba`.

- [ ] **Step 1: Write the failing pure-helper tests**

Create `mitunet-surfaces.spec.ts` with concrete assertions:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { createMitunetSceneLayout } from "./mitunet-geometry";
import {
  buildInteriorMask,
  buildWoodRgba,
  calculateMitunetGroundBounds,
  calculateMitunetTexturePlane,
  maskContains
} from "./mitunet-surfaces";

const rectangle = (x1: number, y1: number, x2: number, y2: number) => ({
  outer: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as [number, number][],
  holes: [] as [number, number][][]
});

const plan: MitunetFloorPlan = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "surface-test",
  canvasSize: [16, 16],
  contentRect: [0, 0, 16, 16],
  millimetersPerPixel: null,
  polygons: {
    wall: [
      rectangle(2, 2, 7, 3), rectangle(9, 2, 14, 3),
      rectangle(2, 13, 14, 14), rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14)
    ],
    door: [rectangle(7, 2, 9, 3)],
    window: []
  }
};

describe("MitUNet surfaces", () => {
  it("adds twelve percent of the long side on every ground edge", () => {
    assert.deepEqual(
      calculateMitunetGroundBounds({ centerX: 3, centerZ: -2, width: 20, depth: 10 }),
      { centerX: 3, centerZ: -2, width: 24.8, depth: 14.8, padding: 2.4 }
    );
  });

  it("temporarily seals doors while preserving doorway floor", () => {
    const mask = buildInteriorMask(plan.polygons, 16, 16);
    assert.equal(maskContains(mask, 16, 16, 8, 8), true);
    assert.equal(maskContains(mask, 16, 16, 8, 2), true);
    assert.equal(maskContains(mask, 16, 16, 0, 0), false);
  });

  it("emits opaque wood only for interior pixels", () => {
    const mask = buildInteriorMask(plan.polygons, 16, 16);
    const rgba = buildWoodRgba(mask, 16, 16);
    assert.equal(rgba[(8 * 16 + 8) * 4 + 3], 255);
    assert.equal(rgba[3], 0);
    assert.deepEqual(buildWoodRgba(mask, 16, 16), rgba);
  });

  it("aligns the full texture canvas with the centered polygon layout", () => {
    const layout = createMitunetSceneLayout(plan);
    const plane = calculateMitunetTexturePlane(plan, layout);
    assert.ok(plane.width > layout.bounds.width);
    assert.ok(plane.depth > layout.bounds.depth);
    assert.equal(Number.isFinite(plane.centerX), true);
    assert.equal(Number.isFinite(plane.centerZ), true);
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run from `C:\Users\smoun\Jungle\woo-zu\roomlog`:

```powershell
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts
```

Expected: FAIL because `./mitunet-surfaces` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `mitunet-surfaces.ts`. Use the same point-in-polygon, two-pixel flood-barrier closing, and flood-fill rules as `floorplan-to-3d-mitunet/viewer/floor-finishes.mjs`. Export these exact public values and signatures:

```ts
import type { MitunetFloorPlan, MitunetPolygon, MitunetPolygonGroups } from "@/lib/mitunet-floor-plan";
import type { MitunetSceneLayout } from "./mitunet-geometry";

export const MITUNET_RENDER_STYLE = {
  background: 0xdce8f2,
  concrete: 0x85878c,
  glass: 0xdbe6ec,
  wallCap: 0x111111,
  wallSide: 0xffffff,
  groundPaddingRatio: 0.12,
  concreteTileWorldSize: 2.5
} as const;

export type MitunetGroundBounds = {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  padding: number;
};

export function calculateMitunetGroundBounds(
  bounds: { centerX: number; centerZ: number; width: number; depth: number }
): MitunetGroundBounds {
  const padding = Math.max(bounds.width, bounds.depth) * MITUNET_RENDER_STYLE.groundPaddingRatio;
  return {
    centerX: bounds.centerX,
    centerZ: bounds.centerZ,
    width: bounds.width + padding * 2,
    depth: bounds.depth + padding * 2,
    padding
  };
}

function allOuterPoints(plan: MitunetFloorPlan) {
  return [plan.polygons.wall, plan.polygons.door, plan.polygons.window]
    .flatMap((polygons) => polygons)
    .flatMap((polygon) => polygon.outer);
}

export function calculateMitunetTexturePlane(plan: MitunetFloorPlan, layout: MitunetSceneLayout) {
  const points = allOuterPoints(plan);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pixelWidth = maxX - minX;
  const pixelDepth = maxY - minY;
  const scale = pixelWidth > 0 ? layout.bounds.width / pixelWidth : layout.bounds.depth / pixelDepth;
  const centerPixelX = (minX + maxX) / 2;
  const centerPixelY = (minY + maxY) / 2;
  return {
    centerX: layout.bounds.centerX + (plan.canvasSize[0] / 2 - centerPixelX) * scale,
    centerZ: layout.bounds.centerZ - (plan.canvasSize[1] / 2 - centerPixelY) * scale,
    width: plan.canvasSize[0] * scale,
    depth: plan.canvasSize[1] * scale
  };
}

function pointInRing(x: number, y: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContains(x: number, y: number, polygon: MitunetPolygon) {
  return pointInRing(x, y, polygon.outer)
    && !polygon.holes.some((hole) => pointInRing(x, y, hole));
}

function rasterize(polygons: MitunetPolygon[], width: number, height: number, blocked: Uint8Array) {
  for (const polygon of polygons) {
    const xs = polygon.outer.map(([x]) => x);
    const ys = polygon.outer.map(([, y]) => y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (polygonContains(x + 0.5, y + 0.5, polygon)) blocked[y * width + x] = 1;
      }
    }
  }
}

function closeRasterGaps(mask: Uint8Array, width: number, height: number, radius: number) {
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let dy = -radius; dy <= radius && value === 0; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px]) {
            value = 1;
            break;
          }
        }
      }
      dilated[y * width + x] = value;
    }
  }
  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 1;
      for (let dy = -radius; dy <= radius && value === 1; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height || !dilated[py * width + px]) {
            value = 0;
            break;
          }
        }
      }
      closed[y * width + x] = value;
    }
  }
  return closed;
}

export function buildInteriorMask(polygons: MitunetPolygonGroups, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Interior mask dimensions must be positive integers");
  }
  const permanentSolid = new Uint8Array(width * height);
  rasterize([...polygons.wall, ...polygons.window], width, height, permanentSolid);
  const floodBlocked = permanentSolid.slice();
  rasterize(polygons.door, width, height, floodBlocked);
  const floodBarrier = closeRasterGaps(floodBlocked, width, height, 2);
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (floodBarrier[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  const interior = new Uint8Array(width * height);
  for (let index = 0; index < interior.length; index += 1) {
    interior[index] = permanentSolid[index] || outside[index] ? 0 : 1;
  }
  return interior;
}

export function maskContains(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  return mask[py * width + px] === 1;
}

export function buildWoodRgba(mask: Uint8Array, width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const plankHeight = 18;
  const plankWidth = 132;
  const plankTone = (row: number, col: number) => {
    const hash = Math.sin(row * 127.1 + col * 311.7) * 43758.5453;
    return hash - Math.floor(hash) - 0.5;
  };
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / plankHeight);
    const stagger = (row % 2) * Math.floor(plankWidth / 2);
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      const offset = pixel * 4;
      const col = Math.floor((x + stagger) / plankWidth);
      const seam = y % plankHeight === 0 || (x + stagger) % plankWidth === 0;
      const tone = Math.round(20 * plankTone(row, col));
      const grain = Math.round(4 * Math.sin(x * 0.11 + row * 0.8) + 2 * Math.sin(x * 0.31 + row * 2.3));
      rgba[offset] = seam ? 146 : 196 + tone + grain;
      rgba[offset + 1] = seam ? 114 : 158 + tone + grain;
      rgba[offset + 2] = seam ? 78 : 112 + Math.round((tone + grain) * 0.6);
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit only the new pure helper and test**

```powershell
git add -- apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts
git diff --cached --check
git commit -m "feat(floor-plan): MitUNet 표면 계산 추가"
```

Expected: the cached diff contains only the two new files.

### Task 2: Browser texture factories and styled MitUNet scene

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-textures.ts`
- Create: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx:6-160,448-525`

**Interfaces:**
- Consumes: all exports from Task 1 plus `MitunetFloorPlan`, `MitunetSceneLayout`, and Three.js `CanvasTexture`.
- Produces: `createConcreteTexture(width, depth)`, `createWoodTexture(plan)`, `MitunetSceneLook`, `MitunetDecorativeFloor`, and wall/glass material rendering.

- [ ] **Step 1: Write the failing source-parity test**

Create `mitunet-surface-style-parity.spec.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx"),
  "utf8"
);

describe("MitUNet saved-view surface parity", () => {
  it("uses the MitUNet environment and four-light rig only for MitUNet plans", () => {
    assert.match(source, /RoomEnvironment/);
    assert.match(source, /ACESFilmicToneMapping/);
    assert.match(source, /hemisphereLight/);
    assert.match(source, /position=\{\[0, -6, 0\]\}/);
  });

  it("uses separate cap, side, and physical glass materials", () => {
    assert.match(source, /attach="material-0"/);
    assert.match(source, /attach="material-1"/);
    assert.match(source, /meshPhysicalMaterial/);
    assert.match(source, /transmission=\{0\.12\}/);
  });

  it("uses dynamic decorative floors without changing the interaction floor", () => {
    assert.match(source, /calculateMitunetGroundBounds/);
    assert.match(source, /MitunetDecorativeFloor/);
    assert.match(source, /raycast=\{\(\) => null\}/);
    assert.match(source, /RoomFloor/);
  });
});
```

- [ ] **Step 2: Run the parity test and verify it fails**

Run:

```powershell
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts
```

Expected: FAIL because the renderer still uses flat Lambert materials and has no styled floor components.

- [ ] **Step 3: Add browser texture factories**

Create `mitunet-textures.ts` with these complete exports:

```ts
import * as THREE from "three";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { buildInteriorMask, buildWoodRgba, MITUNET_RENDER_STYLE } from "./mitunet-surfaces";

export function createConcreteTexture(worldWidth: number, worldDepth: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = `#${MITUNET_RENDER_STYLE.concrete.toString(16).padStart(6, "0")}`;
  context.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 1400; index += 1) {
    const shade = 120 + Math.floor(Math.random() * 40);
    context.fillStyle = `rgba(${shade},${shade - 1},${shade - 4},0.30)`;
    context.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  context.fillStyle = "rgba(0, 0, 0, 0.10)";
  context.fillRect(0, 0, 256, 2);
  context.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    Math.max(1, worldWidth / MITUNET_RENDER_STYLE.concreteTileWorldSize),
    Math.max(1, worldDepth / MITUNET_RENDER_STYLE.concreteTileWorldSize)
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWoodTexture(plan: MitunetFloorPlan) {
  const [width, height] = plan.canvasSize;
  const mask = buildInteriorMask(plan.polygons, width, height);
  const pixels = buildWoodRgba(mask, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 4: Integrate the MitUNet-only scene look**

Modify `RoomlogThreeFloorPlanView.tsx` as follows:

1. Import `RoomEnvironment`, the Task 1 helpers, and the Task 2 texture factories.
2. Extend `MitunetExtrudedLayer` with `surface: "wall" | "glass"`; preserve its geometry creation and all existing height arguments.
3. For wall layers, attach cap and side `meshStandardMaterial` instances to material slots 0 and 1. For glass, use `meshPhysicalMaterial` with opacity `0.72`, roughness `0.08`, transmission `0.12`, and IOR `1.45`.
4. Add `MitunetSceneLook` that sets and restores environment, fog, ACES tone mapping, and exposure inside an effect. Render the four MitUNet lights when active; render the existing two legacy lights otherwise.
5. Add `MitunetDecorativeFloor` that memoizes concrete and wood textures, disposes them on replacement/unmount, centers the concrete plane on the wall bounds, and aligns the full transparent wood plane through `calculateMitunetTexturePlane`.
6. Set `raycast={() => null}` on both decorative floor meshes. Keep the existing `RoomFloor` at the original wall bounds to receive pointer handlers; when a MitUNet plan is active its material is transparent with `opacity={0}` and `depthWrite={false}`.
7. Use the styled background and scene only when `mitunetLayout && mitunetPlan` are present. Keep legacy background, Lambert walls, and beige floor behavior unchanged.

The wall/glass material branch must have this exact JSX shape:

```tsx
<mesh castShadow geometry={geometry} position={[0, y, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
  {surface === "wall" ? (
    <>
      <meshStandardMaterial
        attach="material-0"
        color={MITUNET_RENDER_STYLE.wallCap}
        metalness={0}
        roughness={0.88}
      />
      <meshStandardMaterial
        attach="material-1"
        color={MITUNET_RENDER_STYLE.wallSide}
        metalness={0}
        roughness={0.82}
      />
    </>
  ) : (
    <meshPhysicalMaterial
      color={MITUNET_RENDER_STYLE.glass}
      ior={1.45}
      metalness={0}
      opacity={0.72}
      roughness={0.08}
      transmission={0.12}
      transparent
    />
  )}
</mesh>
```

The dynamic floor calculation must be memoized from `layout.bounds`, never included in `RoomCameraAutoFit`, and use `y=-0.01` for concrete and `y=0.004` for wood.

- [ ] **Step 5: Run focused geometry and surface tests**

Run:

```powershell
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts src/app/floor-plan-3d/room-scene/mitunet-renderer-parity.spec.ts src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts
```

Expected: all surface tests and the existing 4 geometry-parity tests PASS.

- [ ] **Step 6: Inspect the renderer diff without staging user-owned changes**

Run:

```powershell
git diff -- apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx
git diff --check -- apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/src/app/floor-plan-3d/room-scene/mitunet-textures.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts
```

Expected: no wall/door/window height or polygon changes beyond the pre-existing working-tree diff. Do not commit `RoomlogThreeFloorPlanView.tsx` in this task because it already contains user-owned uncommitted changes.

### Task 3: Full regression and live saved-view comparison

**Files:**
- Verify only; no additional source files.

**Interfaces:**
- Consumes: completed Task 1 and Task 2 renderer.
- Produces: test/build evidence and a live comparison of MitUNet furnishing view versus RoomLog saved preview.

- [ ] **Step 1: Run the complete web unit suite**

```powershell
pnpm --filter web run test:unit
```

Expected: all TypeScript unit tests PASS, including geometry and surface parity.

- [ ] **Step 2: Run the production web build**

```powershell
pnpm --filter web run build
```

Expected: Next.js production build exits with code 0 and no TypeScript errors.

- [ ] **Step 3: Verify the active local routes**

```powershell
$urls=@('http://localhost:3000/','http://localhost:3000/floor-plan-3d/mitunet'); foreach($url in $urls){$response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10; "$url $($response.StatusCode)"}
```

Expected: both URLs return `200`.

- [ ] **Step 4: Compare the same saved plan in the browser**

Open the RoomLog-integrated MitUNet editor, render the existing apartment image, enter furnishing mode, save the plan, and inspect the RoomLog registration preview. Verify all of the following:

- background, white wall sides, black wall caps, glass, oak floor, and concrete have the same visual treatment;
- the concrete border is limited to the computed 12% padding and the building remains visually prominent;
- saving does not change wall, door, or window count and positions;
- furniture remains clickable and movable only on the original interaction floor;
- the registration preview and listing-detail 3D use the same shared renderer.

- [ ] **Step 5: Report changes without committing overlapping user work**

Run:

```powershell
git status --short
git diff --check
```

Report the exact files changed, tests run, build result, and visual comparison result. Leave the overlapping renderer change uncommitted unless the user explicitly requests a commit after reviewing the final diff.

