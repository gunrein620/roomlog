const SAMPLE_OFFSETS = [-0.25, 0, 0.25];
const ENTRANCE_LABEL = /현관|entrance|foyer/i;
const BALCONY_LABEL = /발코니|베란다|balcony|veranda/i;
const MIN_CONFIDENCE = 0.60;
const MAX_COMPONENT_RATIO = 0.15;
const MIN_AREA_MM2 = 800_000;
const MAX_AREA_MM2 = 6_000_000;

function maskValue(mask, width, height, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return 0;
  return mask[py * width + px] ? 1 : 0;
}

function openingGeometry(opening) {
  const horizontal = opening?.axis === "horizontal";
  const center = { x: Number(opening?.center_x), y: Number(opening?.center_y) };
  const spanPixels = horizontal ? Number(opening?.width) : Number(opening?.height);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(spanPixels) || spanPixels < 2) {
    return null;
  }
  return {
    center,
    normal: horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 },
    spanPixels,
    tangent: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
  };
}

function sideHits(geometry, sign, interiorMask, width, height) {
  const distance = Math.max(3, Math.round(geometry.spanPixels * 0.35));
  return SAMPLE_OFFSETS.reduce((sum, offset) => {
    const x = geometry.center.x
      + geometry.tangent.x * geometry.spanPixels * offset
      + geometry.normal.x * distance * sign;
    const y = geometry.center.y
      + geometry.tangent.y * geometry.spanPixels * offset
      + geometry.normal.y * distance * sign;
    return sum + maskValue(interiorMask, width, height, x, y);
  }, 0);
}

function clearanceScore(geometry, inward, interiorMask, width, height) {
  let score = 0;
  for (let depth = 0.5; depth <= 3; depth += 0.5) {
    for (let tangent = -1.5; tangent <= 1.5; tangent += 0.5) {
      const x = geometry.center.x
        + inward.x * geometry.spanPixels * depth
        + geometry.tangent.x * geometry.spanPixels * tangent;
      const y = geometry.center.y
        + inward.y * geometry.spanPixels * depth
        + geometry.tangent.y * geometry.spanPixels * tangent;
      score += maskValue(interiorMask, width, height, x, y);
    }
  }
  return score;
}

function normalizedRing(polygon, width, height) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 16) return null;
  const ring = polygon.map((point) => [Number(point?.x) / 1000 * width, Number(point?.y) / 1000 * height]);
  return ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) ? ring : null;
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

function pixelsInRing(ring, labels, baseLabel, interiorMask, permanentSolid, width, height) {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const pixels = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y += 1) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(width - 1, Math.ceil(Math.max(...xs))); x += 1) {
      const index = y * width + x;
      if (labels[index] === baseLabel && interiorMask[index] && !permanentSolid[index] && pointInRing(x + 0.5, y + 0.5, ring)) {
        pixels.push(index);
      }
    }
  }
  return pixels;
}

function nearestLabel(labels, point, width, height) {
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let y = Math.max(0, point.y - radius); y <= Math.min(height - 1, point.y + radius); y += 1) {
      for (let x = Math.max(0, point.x - radius); x <= Math.min(width - 1, point.x + radius); x += 1) {
        const value = labels[y * width + x];
        if (value) return value;
      }
    }
  }
  return 0;
}

function connectedLabelComponentPixelCount(labels, baseLabel, seed, width, height) {
  const pixels = [];
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === baseLabel) pixels.push(index);
  }
  return connectedPixelsContainingSeed(pixels, seed, width, height).length;
}

function validArea(pixels, componentSize, millimetersPerPixel) {
  if (!pixels.length || pixels.length > componentSize * MAX_COMPONENT_RATIO) return false;
  const scale = Number(millimetersPerPixel);
  if (!Number.isFinite(scale) || scale <= 0) return true;
  const areaMm2 = pixels.length * scale * scale;
  return areaMm2 >= MIN_AREA_MM2 && areaMm2 <= MAX_AREA_MM2;
}

function connectedPixelsContainingSeed(pixels, seed, width, height) {
  if (!pixels.length) return [];
  const allowed = new Uint8Array(width * height);
  for (const index of pixels) allowed[index] = 1;
  let start = pixels[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of pixels) {
    const x = index % width;
    const y = Math.floor(index / width);
    const distance = Math.hypot(x - seed.x, y - seed.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      start = index;
    }
  }
  const visited = new Uint8Array(width * height);
  const queue = [start];
  const connected = [];
  visited[start] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    connected.push(index);
    const x = index % width;
    const y = Math.floor(index / width);
    for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
      if (next >= 0 && allowed[next] && !visited[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
  return connected;
}

function ringArea(ring) {
  let doubleArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    doubleArea += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubleArea) / 2;
}

function segmentsIntersect([ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  const cross = (x1, y1, x2, y2) => x1 * y2 - y1 * x2;
  const onSegment = (x, y, startX, startY, endX, endY) => x >= Math.min(startX, endX)
    && x <= Math.max(startX, endX) && y >= Math.min(startY, endY) && y <= Math.max(startY, endY);
  const abx = bx - ax;
  const aby = by - ay;
  const acx = cx - ax;
  const acy = cy - ay;
  const adx = dx - ax;
  const ady = dy - ay;
  const cdx = dx - cx;
  const cdy = dy - cy;
  const cax = ax - cx;
  const cay = ay - cy;
  const cbx = bx - cx;
  const cby = by - cy;
  const first = cross(abx, aby, acx, acy);
  const second = cross(abx, aby, adx, ady);
  const third = cross(cdx, cdy, cax, cay);
  const fourth = cross(cdx, cdy, cbx, cby);
  if (first === 0 && onSegment(cx, cy, ax, ay, bx, by)) return true;
  if (second === 0 && onSegment(dx, dy, ax, ay, bx, by)) return true;
  if (third === 0 && onSegment(ax, ay, cx, cy, dx, dy)) return true;
  if (fourth === 0 && onSegment(bx, by, cx, cy, dx, dy)) return true;
  return (first > 0) !== (second > 0) && (third > 0) !== (fourth > 0);
}

function ringsOverlap(left, right) {
  if (left.some(([x, y]) => pointInRing(x, y, right)) || right.some(([x, y]) => pointInRing(x, y, left))) return true;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftNext = (leftIndex + 1) % left.length;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightNext = (rightIndex + 1) % right.length;
      if (segmentsIntersect(left[leftIndex], left[leftNext], right[rightIndex], right[rightNext])) return true;
    }
  }
  return false;
}

function rectangleRing(candidate, millimetersPerPixel) {
  const scale = Number(millimetersPerPixel);
  const physical = Number.isFinite(scale) && scale > 0;
  const depth = physical ? 1350 / scale : candidate.spanPixels * 1.5;
  const width = physical
    ? Math.min(2400 / scale, Math.max(1200 / scale, candidate.spanPixels + 600 / scale))
    : candidate.spanPixels * 1.67;
  const start = candidate.inwardPoint;
  const end = { x: start.x + candidate.inward.x * depth, y: start.y + candidate.inward.y * depth };
  const half = width / 2;
  return [
    [start.x - candidate.tangent.x * half, start.y - candidate.tangent.y * half],
    [start.x + candidate.tangent.x * half, start.y + candidate.tangent.y * half],
    [end.x + candidate.tangent.x * half, end.y + candidate.tangent.y * half],
    [end.x - candidate.tangent.x * half, end.y - candidate.tangent.y * half],
  ];
}

function effectiveMillimetersPerPixel(millimetersPerPixel, candidate) {
  const calibrated = Number(millimetersPerPixel);
  if (Number.isFinite(calibrated) && calibrated > 0) return calibrated;
  return Number.isFinite(candidate?.spanPixels) && candidate.spanPixels > 0 ? 900 / candidate.spanPixels : null;
}

export function findExteriorDoorCandidates({ height, interiorMask, openings = [], width }) {
  if (!(interiorMask instanceof Uint8Array) || interiorMask.length !== width * height) return [];
  return openings
    .filter((opening) => opening?.kind === "door" && opening?.valid !== false)
    .map((opening) => ({ geometry: openingGeometry(opening), opening }))
    .filter(({ geometry }) => geometry)
    .map(({ geometry, opening }) => {
      const positive = sideHits(geometry, 1, interiorMask, width, height);
      const negative = sideHits(geometry, -1, interiorMask, width, height);
      if (Math.max(positive, negative) < 2 || Math.min(positive, negative) > 1) return null;
      const sign = positive > negative ? 1 : -1;
      const inward = {
        x: geometry.normal.x === 0 ? 0 : geometry.normal.x * sign,
        y: geometry.normal.y === 0 ? 0 : geometry.normal.y * sign,
      };
      const distance = Math.max(3, Math.round(geometry.spanPixels * 0.35));
      return {
        opening,
        center: geometry.center,
        inward,
        inwardPoint: {
          x: Math.round(geometry.center.x + inward.x * distance),
          y: Math.round(geometry.center.y + inward.y * distance),
        },
        spanPixels: geometry.spanPixels,
        tangent: geometry.tangent,
        clearance: clearanceScore(geometry, inward, interiorMask, width, height),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.clearance - left.clearance || right.spanPixels - left.spanPixels);
}

export function buildEntranceFloorOverride({
  height,
  interiorMask,
  labels,
  millimetersPerPixel = null,
  openings = [],
  permanentSolid,
  rooms = [],
  width,
}) {
  if (!(labels instanceof Uint8Array) || labels.length !== width * height
    || !(interiorMask instanceof Uint8Array) || interiorMask.length !== width * height) return null;
  const solidMask = permanentSolid instanceof Uint8Array && permanentSolid.length === width * height
    ? permanentSolid
    : new Uint8Array(width * height);
  const candidates = findExteriorDoorCandidates({ height, interiorMask, openings, width });
  const balconyRings = rooms
    .filter((room) => BALCONY_LABEL.test(String(room?.label ?? "")))
    .map((room) => normalizedRing(room.polygon, width, height))
    .filter(Boolean);
  const entranceRooms = rooms
    .filter((room) => ENTRANCE_LABEL.test(String(room?.label ?? "")) && Number(room?.confidence) >= MIN_CONFIDENCE)
    .sort((left, right) => Number(right.confidence) - Number(left.confidence));

  const safeCandidates = candidates.filter((candidate) => {
    const fallbackRing = rectangleRing(candidate, millimetersPerPixel);
    return !balconyRings.some((ring) => pointInRing(candidate.inwardPoint.x, candidate.inwardPoint.y, ring)
      || ringsOverlap(fallbackRing, ring));
  });
  if (!safeCandidates.length) return null;

  let selected = null;
  let selectedRoom = null;
  for (const room of entranceRooms) {
    const ring = normalizedRing(room.polygon, width, height);
    if (!ring) continue;
    const matchingDoor = safeCandidates.find((candidate) => {
      const threshold = Number.isFinite(Number(millimetersPerPixel)) && Number(millimetersPerPixel) > 0
        ? 750 / Number(millimetersPerPixel)
        : candidate.spanPixels;
      return ring.some(([x, y]) => Math.hypot(x - candidate.inwardPoint.x, y - candidate.inwardPoint.y) <= threshold)
        || pointInRing(candidate.inwardPoint.x, candidate.inwardPoint.y, ring);
    });
    if (matchingDoor) {
      selected = matchingDoor;
      selectedRoom = room;
      break;
    }
  }
  if (!selectedRoom) {
    if (safeCandidates.length !== 1) return null;
    selected = safeCandidates[0];
  }

  const baseLabel = nearestLabel(labels, selected.inwardPoint, width, height);
  if (!baseLabel) return null;
  const componentSize = connectedLabelComponentPixelCount(labels, baseLabel, selected.inwardPoint, width, height);
  const areaScale = effectiveMillimetersPerPixel(millimetersPerPixel, selected);
  const semanticRing = selectedRoom ? normalizedRing(selectedRoom.polygon, width, height) : null;
  let pixels = semanticRing
    ? pixelsInRing(semanticRing, labels, baseLabel, interiorMask, solidMask, width, height)
    : [];
  pixels = connectedPixelsContainingSeed(pixels, selected.inwardPoint, width, height);

  if (!validArea(pixels, componentSize, areaScale)) {
    const fallbackRing = rectangleRing(selected, millimetersPerPixel);
    pixels = connectedPixelsContainingSeed(pixelsInRing(
      fallbackRing,
      labels,
      baseLabel,
      interiorMask,
      solidMask,
      width,
      height,
    ), selected.inwardPoint, width, height);
    if (pixels.length < ringArea(fallbackRing) * 0.5) return null;
  }
  if (!validArea(pixels, componentSize, areaScale)) return null;

  return {
    baseLabel,
    confidence: selectedRoom ? Number(selectedRoom.confidence) : 0.5,
    label: "현관",
    pixels,
    seed: [selected.inwardPoint.x, selected.inwardPoint.y],
  };
}
