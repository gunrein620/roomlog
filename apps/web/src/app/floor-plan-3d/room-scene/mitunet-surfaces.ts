import type {
  MitunetFloorMaterialMap,
  MitunetFloorPlan,
  MitunetPolygon,
  MitunetPolygonGroups
} from "@/lib/mitunet-floor-plan";
import type { MitunetSceneLayout } from "./mitunet-geometry";

export const MITUNET_RENDER_STYLE = {
  // 밤하늘 안개색 — CSS 하늘의 55%(#101a38)와 지평선(#26355e) 스톱 사이 값.
  // 뷰어 index.html의 COLOR_BG(0x1b284b)와 반드시 동일하게 유지(룩 패리티).
  background: 0x1b284b,
  // 어두운 밤 잔디 마당 베이스 — 뷰어 index.html의 COLOR_CONCRETE(0x3d5433)와 동일(룩 패리티).
  // 밤하늘에서 잔디만 밝지 않도록 낮추되, 너무 어둡다는 피드백으로 휘도 ~74로 살짝 올림.
  // (키 이름 concrete는 스펙 검사 식별자라 유지.)
  concrete: 0x3d5433,
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
  const scale = pixelWidth > 0
    ? layout.bounds.width / pixelWidth
    : layout.bounds.depth / pixelDepth;
  const centerPixelX = (minX + maxX) / 2;
  const centerPixelY = (minY + maxY) / 2;

  return {
    centerX: layout.bounds.centerX + (plan.canvasSize[0] / 2 - centerPixelX) * scale,
    centerZ: layout.bounds.centerZ + (plan.canvasSize[1] / 2 - centerPixelY) * scale,
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
        if (polygonContains(x + 0.5, y + 0.5, polygon)) {
          blocked[y * width + x] = 1;
        }
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

function dilateSquare(mask: Uint8Array, width: number, height: number, radius: number) {
  const horizontal = new Uint8Array(mask.length);
  const dilated = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x += 1) count += mask[row + x];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = count > 0 ? 1 : 0;
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) count -= mask[row + removeX];
      if (addX < width) count += mask[row + addX];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= Math.min(radius, height - 1); y += 1) count += horizontal[y * width + x];
    for (let y = 0; y < height; y += 1) {
      dilated[y * width + x] = count > 0 ? 1 : 0;
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) count -= horizontal[removeY * width + x];
      if (addY < height) count += horizontal[addY * width + x];
    }
  }
  return dilated;
}

function erodeSquare(mask: Uint8Array, width: number, height: number, radius: number) {
  const horizontal = new Uint8Array(mask.length);
  const eroded = new Uint8Array(mask.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x += 1) count += mask[row + x];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = x - radius >= 0 && x + radius < width && count === windowSize ? 1 : 0;
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) count -= mask[row + removeX];
      if (addX < width) count += mask[row + addX];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= Math.min(radius, height - 1); y += 1) count += horizontal[y * width + x];
    for (let y = 0; y < height; y += 1) {
      eroded[y * width + x] = y - radius >= 0 && y + radius < height && count === windowSize ? 1 : 0;
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) count -= horizontal[removeY * width + x];
      if (addY < height) count += horizontal[addY * width + x];
    }
  }
  return eroded;
}

function closeRasterGapsFast(mask: Uint8Array, width: number, height: number, radius: number) {
  const safeRadius = Math.max(0, Math.floor(radius));
  if (safeRadius === 0) return mask.slice();
  return erodeSquare(dilateSquare(mask, width, height, safeRadius), width, height, safeRadius);
}

function classifyInterior(
  permanentSolid: Uint8Array,
  floodBarrier: Uint8Array,
  width: number,
  height: number
) {
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (floodBarrier[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  const interior = new Uint8Array(width * height);
  for (let index = 0; index < interior.length; index += 1) {
    interior[index] = permanentSolid[index] || outside[index] ? 0 : 1;
  }
  return interior;
}

function polygonBoundsArea(polygons: MitunetPolygonGroups) {
  const points = [...polygons.wall, ...polygons.door, ...polygons.window]
    .flatMap((polygon) => polygon.outer);
  if (points.length === 0) return 0;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return Math.max(0, Math.max(...xs) - Math.min(...xs))
    * Math.max(0, Math.max(...ys) - Math.min(...ys));
}

function polygonLongSide(polygon: MitunetPolygon) {
  const xs = polygon.outer.map(([x]) => x);
  const ys = polygon.outer.map(([, y]) => y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
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
  return classifyInterior(permanentSolid, floodBarrier, width, height);
}

export function buildRoomlogInteriorMask(
  polygons: MitunetPolygonGroups,
  width: number,
  height: number
) {
  const exact = buildInteriorMask(polygons, width, height);
  const boundsArea = polygonBoundsArea(polygons);
  const exactCount = exact.reduce((sum, value) => sum + value, 0);
  const targetRatio = 0.55;
  if (boundsArea <= 0 || exactCount / boundsArea >= targetRatio || polygons.door.length === 0) {
    return exact;
  }

  const permanentSolid = new Uint8Array(width * height);
  rasterize([...polygons.wall, ...polygons.window], width, height, permanentSolid);
  const floodBlocked = permanentSolid.slice();
  rasterize(polygons.door, width, height, floodBlocked);

  const doorLengths = polygons.door.map(polygonLongSide).sort((a, b) => a - b);
  const referenceDoorLength = doorLengths[Math.min(
    doorLengths.length - 1,
    Math.floor(doorLengths.length * 0.75)
  )];
  const maxRadius = Math.max(2, Math.min(
    64,
    Math.floor(Math.min(width, height) / 4),
    Math.ceil(referenceDoorLength * 0.7)
  ));
  const radii = [...new Set(
    [4, 8, 12, 16, 24, 32, 48, 64, maxRadius]
      .filter((radius) => radius > 2 && radius <= maxRadius)
      .sort((a, b) => a - b)
  )];

  let best = exact;
  let bestCount = exactCount;
  for (const radius of radii) {
    const barrier = closeRasterGapsFast(floodBlocked, width, height, radius);
    const candidate = classifyInterior(permanentSolid, barrier, width, height);
    const candidateCount = candidate.reduce((sum, value) => sum + value, 0);
    if (candidateCount > bestCount) {
      best = candidate;
      bestCount = candidateCount;
    }
    if (candidateCount / boundsArea >= targetRatio) return candidate;
  }
  return best;
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
      const grain = Math.round(
        4 * Math.sin(x * 0.11 + row * 0.8)
        + 2 * Math.sin(x * 0.31 + row * 2.3)
      );
      rgba[offset] = seam ? 146 : 196 + tone + grain;
      rgba[offset + 1] = seam ? 114 : 158 + tone + grain;
      rgba[offset + 2] = seam ? 78 : 112 + Math.round((tone + grain) * 0.6);
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function decodeFloorMaterialLabels(
  floorMaterials: MitunetFloorMaterialMap,
  width: number,
  height: number
) {
  if (floorMaterials.width !== width || floorMaterials.height !== height) return null;
  const labels = new Uint8Array(width * height);
  let offset = 0;
  for (const run of floorMaterials.labels.split(",")) {
    const match = /^(\d+):(\d+)$/.exec(run);
    if (!match) return null;
    const count = Number(match[1]);
    const label = Number(match[2]);
    if (
      !Number.isSafeInteger(count)
      || count < 1
      || label < 0
      || label > floorMaterials.zones.length
      || offset + count > labels.length
    ) {
      return null;
    }
    labels.fill(label, offset, offset + count);
    offset += count;
  }
  return offset === labels.length ? labels : null;
}

function nonWoodMaterialColor(material: string, x: number, y: number) {
  if (material === "TILE") {
    const grid = x % 28 <= 1 || y % 28 <= 1;
    if (grid) return [188, 196, 202];
    // Faint per-tile tone shift so the white porcelain does not read as one flat sheet.
    const hash = Math.sin(Math.floor(x / 28) * 127.1 + Math.floor(y / 28) * 311.7) * 43758.5453;
    const tone = Math.round(7 * ((hash - Math.floor(hash)) - 0.5));
    return [238 + tone, 240 + tone, 242 + tone];
  }
  if (material === "BALCONY_TILE") {
    const grid = x % 22 <= 1 || y % 22 <= 1;
    return grid ? [105, 112, 120] : [215, 219, 224];
  }
  const grid = x % 60 <= 1 || y % 38 <= 1;
  if (grid) return [128, 130, 133];
  // Per-slab tone plus a soft diagonal vein for a natural cool-grey stone read.
  const hash = Math.sin(Math.floor(x / 60) * 71.3 + Math.floor(y / 38) * 191.7) * 43758.5453;
  const tone = Math.round(8 * ((hash - Math.floor(hash)) - 0.5));
  const vein = Math.round(6 * Math.sin((x + y) * 0.18 + Math.floor(x / 60) * 2.1) + 3 * Math.sin((x - y) * 0.37));
  const shade = tone + vein;
  return [212 + shade, 214 + shade, 216 + shade];
}

export function buildFloorMaterialRgba(
  mask: Uint8Array,
  width: number,
  height: number,
  floorMaterials?: MitunetFloorMaterialMap
) {
  const wood = buildWoodRgba(mask, width, height);
  if (!floorMaterials) return wood;

  const labels = decodeFloorMaterialLabels(floorMaterials, width, height);
  if (!labels) return wood;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const label = labels[index];
    if (label === 0) continue;
    const material = floorMaterials.zones[label - 1]?.material;
    const offset = index * 4;
    if (!material || material === "WOOD" || material === "KITCHEN_FLOOR") {
      rgba.set(wood.subarray(offset, offset + 4), offset);
      continue;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    const [red, green, blue] = nonWoodMaterialColor(material, x, y);
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = 255;
  }
  return rgba;
}
