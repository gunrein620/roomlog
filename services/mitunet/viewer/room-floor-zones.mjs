const MAX_DIMENSION = 4096;
const MAX_ROOMS = 64;
const MIN_CONFIDENCE = 0.45;
const DARK_THRESHOLD = 96;

function normalizedRoomLabel(label) {
  return String(label ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function materialForRoomLabel(label) {
  const value = normalizedRoomLabel(label);
  if (/발코니|베란다|balcony|veranda/.test(value)) return "BALCONY_TILE";
  if (/욕실|화장실|bathroom|toilet/.test(value)) return "TILE";
  if (/다용도실|세탁실|utility|laundry/.test(value)) return "TILE";
  if (/주방|식당|부엌|kitchen|dining/.test(value)) return "KITCHEN_FLOOR";
  if (/현관|entrance|foyer/.test(value)) return "STONE_TILE";
  return "WOOD";
}

export function encodeRoomFloorLabels(labels, width, height) {
  if (!(labels instanceof Uint8Array) || labels.length !== width * height) {
    throw new RangeError("Room floor label dimensions do not match");
  }
  const runs = [];
  for (let start = 0; start < labels.length;) {
    const value = labels[start];
    let end = start + 1;
    while (end < labels.length && labels[end] === value) end += 1;
    runs.push(`${end - start}:${value}`);
    start = end;
  }
  return { encoding: "rle-u8", height, labels: runs.join(","), version: 1, width };
}

export function decodeRoomFloorLabels(map) {
  const width = Number(map?.width);
  const height = Number(map?.height);
  const length = width * height;
  if (
    map?.version !== 1
    || map?.encoding !== "rle-u8"
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > MAX_DIMENSION
    || height > MAX_DIMENSION
    || !Number.isSafeInteger(length)
  ) {
    throw new TypeError("Invalid room floor material map");
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const run of String(map.labels ?? "").split(",")) {
    const match = /^(\d+):(\d+)$/.exec(run);
    if (!match) throw new TypeError("Invalid room floor label run");
    const count = Number(match[1]);
    const value = Number(match[2]);
    if (!count || value > 255 || offset + count > output.length) {
      throw new RangeError("Invalid room floor label run");
    }
    output.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== output.length) throw new RangeError("Room floor label map is incomplete");
  return output;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / ((previousY - currentY) || Number.EPSILON) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContains(x, y, polygon) {
  return pointInRing(x, y, polygon?.outer ?? [])
    && !(polygon?.holes ?? []).some((hole) => pointInRing(x, y, hole));
}

function rasterize(polygons, width, height, target) {
  for (const polygon of polygons ?? []) {
    if (!Array.isArray(polygon?.outer) || polygon.outer.length < 3) continue;
    const xs = polygon.outer.map(([x]) => Number(x)).filter(Number.isFinite);
    const ys = polygon.outer.map(([, y]) => Number(y)).filter(Number.isFinite);
    if (xs.length !== polygon.outer.length || ys.length !== polygon.outer.length) continue;
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const right = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (polygonContains(x + 0.5, y + 0.5, polygon)) target[y * width + x] = 1;
      }
    }
  }
}

function markDarkPixels(sourceRgba, interiorMask, barrier) {
  if (!sourceRgba || sourceRgba.length !== interiorMask.length * 4) return;
  for (let index = 0; index < interiorMask.length; index += 1) {
    if (!interiorMask[index]) continue;
    const offset = index * 4;
    const alpha = sourceRgba[offset + 3] ?? 255;
    const luminance = (sourceRgba[offset] ?? 255) * 0.2126
      + (sourceRgba[offset + 1] ?? 255) * 0.7152
      + (sourceRgba[offset + 2] ?? 255) * 0.0722;
    if (alpha > 24 && luminance <= DARK_THRESHOLD) barrier[index] = 1;
  }
}

function closeSmallGaps(mask, width, height) {
  const output = mask.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (mask[index]) continue;
      const horizontal = mask[index - 1] && mask[index + 1];
      const vertical = mask[index - width] && mask[index + width];
      if (horizontal || vertical) output[index] = 1;
    }
  }
  return output;
}

function polygonCentroid(polygon, width, height) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 16) return null;
  const points = polygon.map((point) => ({
    x: Number(point?.x) / 1000 * width,
    y: Number(point?.y) / 1000 * height,
  }));
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  let doubleArea = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    doubleArea += cross;
    sumX += (current.x + next.x) * cross;
    sumY += (current.y + next.y) * cross;
  }
  if (Math.abs(doubleArea) < Number.EPSILON) {
    return {
      x: Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
      y: Math.round(points.reduce((sum, point) => sum + point.y, 0) / points.length),
    };
  }
  return { x: Math.round(sumX / (3 * doubleArea)), y: Math.round(sumY / (3 * doubleArea)) };
}

function polygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 16) return 0;
  let doubleArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const currentX = Number(polygon[index]?.x);
    const currentY = Number(polygon[index]?.y);
    const nextX = Number(polygon[(index + 1) % polygon.length]?.x);
    const nextY = Number(polygon[(index + 1) % polygon.length]?.y);
    if (![currentX, currentY, nextX, nextY].every(Number.isFinite)) return 0;
    doubleArea += currentX * nextY - nextX * currentY;
  }
  return Math.abs(doubleArea) / 2;
}

function roomPolygonPixels(polygon, labels, baseLabel, interiorMask, permanentSolid, width, height) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 16) return [];
  const ring = polygon.map((point) => [
    Number(point?.x) / 1000 * width,
    Number(point?.y) / 1000 * height,
  ]);
  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return [];
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const pixels = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x;
      if (
        labels[index] === baseLabel
        && interiorMask[index]
        && !permanentSolid[index]
        && pointInRing(x + 0.5, y + 0.5, ring)
      ) {
        pixels.push(index);
      }
    }
  }
  return pixels;
}

function labelComponents(interiorMask, barrier, width, height) {
  const ids = new Int32Array(interiorMask.length);
  ids.fill(-1);
  const sizes = [];
  const queue = new Int32Array(interiorMask.length);
  for (let start = 0; start < interiorMask.length; start += 1) {
    if (!interiorMask[start] || barrier[start] || ids[start] >= 0) continue;
    const componentId = sizes.length;
    let head = 0;
    let tail = 0;
    let size = 0;
    ids[start] = componentId;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || !interiorMask[next] || barrier[next] || ids[next] >= 0) continue;
        ids[next] = componentId;
        queue[tail++] = next;
      }
    }
    sizes.push(size);
  }
  return { ids, sizes };
}

function findStableSeed(seed, interiorMask, barrier, components, width, height, minimumSize) {
  const startX = Math.max(0, Math.min(width - 1, Math.round(seed.x)));
  const startY = Math.max(0, Math.min(height - 1, Math.round(seed.y)));
  const qualifies = (x, y) => {
    const index = y * width + x;
    const componentId = components.ids[index];
    return interiorMask[index]
      && !barrier[index]
      && componentId >= 0
      && components.sizes[componentId] >= minimumSize;
  };
  if (qualifies(startX, startY)) return { x: startX, y: startY };

  const maximumRadius = Math.max(width, height);
  for (let radius = 1; radius <= maximumRadius; radius += 1) {
    const left = Math.max(0, startX - radius);
    const right = Math.min(width - 1, startX + radius);
    const top = Math.max(0, startY - radius);
    const bottom = Math.min(height - 1, startY + radius);
    for (let x = left; x <= right; x += 1) {
      if (qualifies(x, top)) return { x, y: top };
      if (bottom !== top && qualifies(x, bottom)) return { x, y: bottom };
    }
    for (let y = top + 1; y < bottom; y += 1) {
      if (qualifies(left, y)) return { x: left, y };
      if (right !== left && qualifies(right, y)) return { x: right, y };
    }
  }
  return null;
}

function fillTemporaryBarriers(labels, interiorMask, permanentSolid, width, height) {
  const queue = new Int32Array(labels.length);
  let head = 0;
  let tail = 0;
  const queued = new Uint8Array(labels.length);
  const enqueueIfFillable = (index) => {
    if (index < 0 || index >= labels.length || queued[index] || labels[index] || !interiorMask[index] || permanentSolid[index]) return;
    queued[index] = 1;
    queue[tail++] = index;
  };
  for (let index = 0; index < labels.length; index += 1) {
    if (!labels[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueueIfFillable(index - 1);
    if (x + 1 < width) enqueueIfFillable(index + 1);
    if (y > 0) enqueueIfFillable(index - width);
    if (y + 1 < height) enqueueIfFillable(index + width);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    const label = neighbors.reduce((value, next) => value || (next >= 0 ? labels[next] : 0), 0);
    if (!label) continue;
    labels[index] = label;
    for (const next of neighbors) enqueueIfFillable(next);
  }
}

export function buildRoomFloorMaterialMap({
  height,
  interiorMask,
  polygons = {},
  rooms,
  sourceRgba,
  width,
}) {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > MAX_DIMENSION
    || height > MAX_DIMENSION
    || !(interiorMask instanceof Uint8Array)
    || interiorMask.length !== width * height
  ) {
    throw new RangeError("Invalid room floor dimensions");
  }
  if (!Array.isArray(rooms) || rooms.length < 1 || rooms.length > MAX_ROOMS) {
    throw new RangeError("Room floor analysis requires between 1 and 64 rooms");
  }

  const permanentSolid = new Uint8Array(interiorMask.length);
  rasterize([...(polygons.wall ?? []), ...(polygons.window ?? [])], width, height, permanentSolid);
  const doorBarrier = new Uint8Array(interiorMask.length);
  rasterize(polygons.door ?? [], width, height, doorBarrier);
  const temporaryBarrier = permanentSolid.slice();
  markDarkPixels(sourceRgba, interiorMask, temporaryBarrier);
  for (let index = 0; index < temporaryBarrier.length; index += 1) {
    if (doorBarrier[index]) temporaryBarrier[index] = 1;
  }
  const barrier = closeSmallGaps(temporaryBarrier, width, height);
  const components = labelComponents(interiorMask, barrier, width, height);
  const interiorArea = interiorMask.reduce((sum, value) => sum + value, 0);
  const minimumSize = Math.max(64, Math.round(interiorArea * 0.006));
  const validRooms = rooms
    .map((room) => ({
      area: polygonArea(room?.polygon),
      room,
      centroid: polygonCentroid(room?.polygon, width, height),
    }))
    .filter(({ room, centroid }) => centroid && Number(room?.confidence) >= MIN_CONFIDENCE);
  if (!validRooms.length) throw new Error("Room floor analysis returned no usable rooms");

  const labels = new Uint8Array(interiorMask.length);
  const queue = new Int32Array(interiorMask.length);
  let head = 0;
  let tail = 0;
  const zones = [];
  const roomByComponent = new Map();
  const roomCandidatesByComponent = new Map();
  for (const { area, room, centroid } of validRooms) {
    const seed = findStableSeed(centroid, interiorMask, barrier, components, width, height, minimumSize);
    if (!seed) continue;
    const componentId = components.ids[seed.y * width + seed.x];
    const candidate = { area, room, seed };
    const candidates = roomCandidatesByComponent.get(componentId) ?? [];
    candidates.push(candidate);
    roomCandidatesByComponent.set(componentId, candidates);
    const current = roomByComponent.get(componentId);
    if (
      !current
      || area > current.area
      || (area === current.area && Number(room.confidence) > Number(current.room.confidence))
    ) {
      roomByComponent.set(componentId, candidate);
    }
  }
  const baseLabelByComponent = new Map();
  for (const [componentId, { room, seed }] of roomByComponent) {
    const label = zones.length + 1;
    if (label > 255) break;
    const index = seed.y * width + seed.x;
    labels[index] = label;
    queue[tail++] = index;
    zones.push({
      confidence: Number(room.confidence),
      id: `room-${label}`,
      label: String(room.label ?? `Room ${label}`).slice(0, 80),
      material: materialForRoomLabel(room.label),
      roomType: normalizedRoomLabel(room.label).slice(0, 80) || "unknown",
      seed: [seed.x, seed.y],
    });
    baseLabelByComponent.set(componentId, label);
  }
  if (!zones.length) throw new Error("Room floor analysis produced no stable room seeds");

  while (head < tail) {
    const index = queue[head++];
    const label = labels[index];
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || labels[next] || !interiorMask[next] || barrier[next]) continue;
      labels[next] = label;
      queue[tail++] = next;
    }
  }

  fillTemporaryBarriers(labels, interiorMask, permanentSolid, width, height);
  for (const [componentId, candidates] of roomCandidatesByComponent) {
    const representative = roomByComponent.get(componentId);
    const baseLabel = baseLabelByComponent.get(componentId);
    if (!representative || !baseLabel) continue;
    for (const candidate of candidates) {
      if (candidate === representative || materialForRoomLabel(candidate.room.label) !== "STONE_TILE") continue;
      const pixels = roomPolygonPixels(
        candidate.room.polygon,
        labels,
        baseLabel,
        interiorMask,
        permanentSolid,
        width,
        height,
      );
      if (pixels.length < minimumSize || zones.length >= 255) continue;
      const label = zones.length + 1;
      for (const index of pixels) labels[index] = label;
      zones.push({
        confidence: Number(candidate.room.confidence),
        id: `room-${label}`,
        label: String(candidate.room.label ?? `Room ${label}`).slice(0, 80),
        material: "STONE_TILE",
        roomType: normalizedRoomLabel(candidate.room.label).slice(0, 80) || "unknown",
        seed: [candidate.seed.x, candidate.seed.y],
      });
    }
  }
  const encoded = encodeRoomFloorLabels(labels, width, height);
  return { ...encoded, zones };
}
