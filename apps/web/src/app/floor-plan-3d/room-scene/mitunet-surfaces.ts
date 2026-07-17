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
  const scale = pixelWidth > 0
    ? layout.bounds.width / pixelWidth
    : layout.bounds.depth / pixelDepth;
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
