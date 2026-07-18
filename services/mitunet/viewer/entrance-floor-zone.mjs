const SAMPLE_OFFSETS = [-0.25, 0, 0.25];

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
