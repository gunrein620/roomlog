import {
  buildDimensionStructureMask,
  classifyEmptyRegions,
} from "./wall-dimensions.mjs";

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

  const structure = buildDimensionStructureMask(wallMask, openings, width, height);
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
