import {
  buildDimensionStructureMask,
  classifyEmptyRegions,
} from "./wall-dimensions.mjs";

const MIN_REJECTED_DOOR_CONFIDENCE = 0.6;

const pointInRing = (x, y, ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY))
        / ((previousY - currentY) || Number.EPSILON) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
};

const addRejectedDoorBarriers = (structure, openings, width, height) => {
  const bridgeCandidates = [];
  for (const opening of openings ?? []) {
    const ring = opening?.mask_polygon;
    const confidence = Number(opening?.confidence);
    if (
      opening?.valid !== false
      || opening.kind !== "door"
      || !Number.isFinite(confidence)
      || confidence < MIN_REJECTED_DOOR_CONFIDENCE
      || !Array.isArray(ring)
      || ring.length < 3
    ) continue;
    bridgeCandidates.push({ ...opening, valid: true });

    const xs = ring.map(point => Number(point?.[0])).filter(Number.isFinite);
    const ys = ring.map(point => Number(point?.[1])).filter(Number.isFinite);
    if (xs.length !== ring.length || ys.length !== ring.length) continue;
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const right = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (pointInRing(x + 0.5, y + 0.5, ring)) structure[y * width + x] = 1;
      }
    }
  }
  return buildDimensionStructureMask(structure, bridgeCandidates, width, height);
};

const validateScale = millimetersPerPixel => {
  const numeric = Number(millimetersPerPixel);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new RangeError("Millimeters per pixel must be a positive number");
  }
  return numeric;
};

export function extractRoomAreas(
  wallMask,
  openings,
  width,
  height,
  millimetersPerPixel,
  { minimumAreaM2 = 1 } = {},
) {
  const scale = validateScale(millimetersPerPixel);
  const minimum = Number(minimumAreaM2);
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new RangeError("Minimum room area must be a non-negative number");
  }

  const structure = addRejectedDoorBarriers(
    buildDimensionStructureMask(wallMask, openings, width, height),
    openings,
    width,
    height,
  );
  const classification = classifyEmptyRegions(structure, width, height);
  const aggregates = new Map();

  for (let index = 0; index < classification.regionIds.length; index += 1) {
    const regionId = classification.regionIds[index];
    if (regionId < 0 || classification.regions[regionId]?.exterior) continue;
    const current = aggregates.get(regionId) ?? {
      regionId,
      pixelCount: 0,
      sumX: 0,
      sumY: 0,
    };
    current.pixelCount += 1;
    current.sumX += index % width;
    current.sumY += Math.floor(index / width);
    aggregates.set(regionId, current);
  }

  const squareMetersPerPixel = scale * scale / 1_000_000;
  const accepted = new Map();
  for (const aggregate of aggregates.values()) {
    const areaM2 = aggregate.pixelCount * squareMetersPerPixel;
    if (areaM2 < minimum) continue;
    accepted.set(aggregate.regionId, {
      regionId: aggregate.regionId,
      pixelCount: aggregate.pixelCount,
      areaM2,
      centroidX: aggregate.sumX / aggregate.pixelCount,
      centroidY: aggregate.sumY / aggregate.pixelCount,
      bestDistance: Number.POSITIVE_INFINITY,
      anchor: null,
    });
  }

  for (let index = 0; index < classification.regionIds.length; index += 1) {
    const room = accepted.get(classification.regionIds[index]);
    if (!room) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const distance = (x - room.centroidX) ** 2 + (y - room.centroidY) ** 2;
    if (distance < room.bestDistance) {
      room.bestDistance = distance;
      room.anchor = { x, y };
    }
  }

  return [...accepted.values()]
    .map(({ centroidX, centroidY, bestDistance, ...room }) => room)
    .sort((first, second) => first.regionId - second.regionId);
}

export function formatRoomArea(areaM2) {
  const numeric = Number(areaM2);
  if (!Number.isFinite(numeric) || numeric < 0) return "";
  return `${numeric.toFixed(1)} m²`;
}
