import { decodeRoomFloorLabels } from "./room-floor-zones.mjs";

function pointInRing(x, y, ring) {
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

function polygonContains(x, y, polygon) {
  if (!pointInRing(x, y, polygon.outer ?? [])) return false;
  return !(polygon.holes ?? []).some(hole => pointInRing(x, y, hole));
}

function rasterize(polygons, width, height, blocked) {
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

function closeRasterGaps(mask, width, height, radius) {
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let blocked = false;
      for (let dy = -radius; dy <= radius && !blocked; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px]) {
            blocked = true;
            break;
          }
        }
      }
      dilated[y * width + x] = blocked ? 1 : 0;
    }
  }

  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let blocked = true;
      for (let dy = -radius; dy <= radius && blocked; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height || !dilated[py * width + px]) {
            blocked = false;
            break;
          }
        }
      }
      closed[y * width + x] = blocked ? 1 : 0;
    }
  }
  return closed;
}

// Chessboard distance to the nearest set pixel, computed with the classic
// two-pass chamfer sweep so large closing radii stay O(width * height).
function chessboardDistance(mask, width, height) {
  const INF = 1 << 29;
  const distance = new Int32Array(mask.length).fill(INF);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) { distance[index] = 0; continue; }
      let best = INF;
      if (x > 0) best = Math.min(best, distance[index - 1] + 1);
      if (y > 0) {
        best = Math.min(best, distance[index - width] + 1);
        if (x > 0) best = Math.min(best, distance[index - width - 1] + 1);
        if (x + 1 < width) best = Math.min(best, distance[index - width + 1] + 1);
      }
      distance[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let best = distance[index];
      if (x + 1 < width) best = Math.min(best, distance[index + 1] + 1);
      if (y + 1 < height) {
        best = Math.min(best, distance[index + width] + 1);
        if (x + 1 < width) best = Math.min(best, distance[index + width + 1] + 1);
        if (x > 0) best = Math.min(best, distance[index + width - 1] + 1);
      }
      distance[index] = best;
    }
  }
  return distance;
}

// Morphological closing of the flood barrier: a doorway the detector missed is
// still a hole the outside flood pours through, misclassifying whole open
// living areas as exterior. Closing with a door-sized radius bridges such
// gaps without changing the rendered wall pixels at all.
function sealWideGaps(barrier, width, height, radius) {
  if (radius < 1) return barrier;
  const toBarrier = chessboardDistance(barrier, width, height);
  const dilated = new Uint8Array(barrier.length);
  for (let index = 0; index < barrier.length; index += 1) {
    dilated[index] = toBarrier[index] <= radius ? 0 : 1; // complement of dilation
  }
  const toOpen = chessboardDistance(dilated, width, height);
  const sealed = new Uint8Array(barrier.length);
  for (let index = 0; index < barrier.length; index += 1) {
    sealed[index] = barrier[index] || toOpen[index] > radius ? 1 : 0;
  }
  return sealed;
}

// The sealing radius comes from the doors the detector did find: a doorway is
// about 900mm, so half the widest plausible entrance (~1300mm) in pixels seals
// missed door gaps while staying far too small to bridge real open frontage.
function doorGapSealRadius(openings) {
  const spans = (Array.isArray(openings) ? openings : [])
    .filter(opening => opening?.kind === "door" && opening?.valid !== false)
    .map(opening => (opening?.axis === "horizontal" ? Number(opening?.width) : Number(opening?.height)))
    .filter(span => Number.isFinite(span) && span >= 2)
    .sort((left, right) => left - right);
  if (!spans.length) return 0;
  const median = spans[Math.floor(spans.length / 2)];
  return Math.max(4, Math.min(64, Math.round(median * 0.72)));
}

// A doorway is a gap in the wall mask whether or not opening alignment accepted
// the detection, so a rejected door still leaks the flood fill into the rooms
// behind it. Sealing those gaps needs the detection footprint alone, not a
// wall-aligned one — but only when the detector was actually sure: the same
// confidence floor the server applies to doors keeps false positives from
// walling off genuinely open space.
const MIN_BARRIER_DOOR_CONFIDENCE = 0.6;

function rejectedDoorBarriers(openings) {
  return openings
    .filter(opening => (
      opening?.valid === false
      && opening.kind === "door"
      && Number(opening.confidence) >= MIN_BARRIER_DOOR_CONFIDENCE
      && Array.isArray(opening.mask_polygon)
      && opening.mask_polygon.length >= 3
    ))
    .map(opening => ({ outer: opening.mask_polygon, holes: [] }));
}

export function buildInteriorMask(polygons = {}, width, height, openings = []) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Interior mask dimensions must be positive integers");
  }
  const permanentSolid = new Uint8Array(width * height);
  rasterize([
    ...(polygons.wall ?? []),
    ...(polygons.window ?? []),
  ], width, height, permanentSolid);

  // Doors seal gaps only while classifying the enclosed region. They are open
  // passages in the rendered structure, so their pixels become floor again in
  // the final mask instead of leaving door-shaped holes in the wood finish.
  const floodBlocked = permanentSolid.slice();
  rasterize([
    ...(polygons.door ?? []),
    ...rejectedDoorBarriers(Array.isArray(openings) ? openings : []),
  ], width, height, floodBlocked);
  // Corrected polygon fragments can share vector endpoints while leaving a
  // narrow seam after pixel-center rasterization. Close only this temporary
  // flood barrier; the rendered geometry and final solid pixels stay exact.
  const floodBarrier = sealWideGaps(
    closeRasterGaps(floodBlocked, width, height, 2),
    width,
    height,
    doorGapSealRadius(openings),
  );

  const outside = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
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

export function maskContains(mask, width, height, x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  return mask[py * width + px] === 1;
}

export function worldToMaskPixel(point, { scale, cx, cy }) {
  return {
    x: Math.round(point.x / scale + cx),
    y: Math.round(point.z / scale + cy),
  };
}

function woodColor(x, y) {
  const plankHeight = 18;
  const plankWidth = 132;
  const plankRow = Math.floor(y / plankHeight);
  const stagger = (plankRow % 2) * Math.floor(plankWidth / 2);
  const plankCol = Math.floor((x + stagger) / plankWidth);
  const seam = y % plankHeight === 0 || (x + stagger) % plankWidth === 0;
  const hash = Math.sin(plankRow * 127.1 + plankCol * 311.7) * 43758.5453;
  const tone = Math.round(20 * ((hash - Math.floor(hash)) - 0.5));
  const grain = Math.round(
    4 * Math.sin(x * 0.11 + plankRow * 0.8)
    + 2 * Math.sin(x * 0.31 + plankRow * 2.3),
  );
  return seam
    ? [146, 114, 78]
    : [196 + tone + grain, 158 + tone + grain, 112 + Math.round((tone + grain) * 0.6)];
}

function materialColor(material, x, y) {
  if (material === "KITCHEN_FLOOR") return woodColor(x, y);
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
  if (material === "STONE_TILE") {
    const grid = x % 60 <= 1 || y % 38 <= 1;
    if (grid) return [128, 130, 133];
    // Per-slab tone plus a soft diagonal vein for a natural cool-grey stone read.
    const hash = Math.sin(Math.floor(x / 60) * 71.3 + Math.floor(y / 38) * 191.7) * 43758.5453;
    const tone = Math.round(8 * ((hash - Math.floor(hash)) - 0.5));
    const vein = Math.round(6 * Math.sin((x + y) * 0.18 + Math.floor(x / 60) * 2.1) + 3 * Math.sin((x - y) * 0.37));
    const shade = tone + vein;
    return [212 + shade, 214 + shade, 216 + shade];
  }
  return woodColor(x, y);
}

export function buildFloorFinishRgba({ floorMaterials, height, interiorMask, width }) {
  if (
    !(interiorMask instanceof Uint8Array)
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || interiorMask.length !== width * height
  ) {
    throw new RangeError("Floor finish dimensions do not match the interior mask");
  }

  let labels = null;
  let zones = [];
  if (floorMaterials) {
    try {
      labels = decodeRoomFloorLabels(floorMaterials);
      zones = Array.isArray(floorMaterials.zones) ? floorMaterials.zones : [];
      if (labels.length !== interiorMask.length) labels = null;
    } catch {
      labels = null;
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < interiorMask.length; index += 1) {
    if (!interiorMask[index]) continue;
    const zoneLabel = labels ? labels[index] : 1;
    if (labels && zoneLabel === 0) continue;
    const material = labels ? zones[zoneLabel - 1]?.material : "WOOD";
    const x = index % width;
    const y = Math.floor(index / width);
    const [red, green, blue] = materialColor(material, x, y);
    const offset = index * 4;
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = 255;
  }
  return pixels;
}
