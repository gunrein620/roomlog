const EXTERIOR_IMAGE_REGION_ID = -2;

const BOUNDARY_TEMPLATES = Object.freeze([
  { neighborX: 0, neighborY: -1, startX: 0, startY: 0, endX: 1, endY: 0, direction: 0 },
  { neighborX: 1, neighborY: 0, startX: 1, startY: 0, endX: 1, endY: 1, direction: 1 },
  { neighborX: 0, neighborY: 1, startX: 1, startY: 1, endX: 0, endY: 1, direction: 2 },
  { neighborX: -1, neighborY: 0, startX: 0, startY: 1, endX: 0, endY: 0, direction: 3 },
]);

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const validateMask = (mask, width, height) => {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Wall-mask dimensions must be positive integers");
  }
  if (!mask || typeof mask.length !== "number" || mask.length < width * height) {
    throw new RangeError("Wall mask is smaller than its declared dimensions");
  }
};

const fillClippedRectangle = (mask, width, height, left, top, right, bottom) => {
  const clippedLeft = clamp(Math.floor(left), 0, width);
  const clippedTop = clamp(Math.floor(top), 0, height);
  const clippedRight = clamp(Math.ceil(right), 0, width);
  const clippedBottom = clamp(Math.ceil(bottom), 0, height);
  for (let y = clippedTop; y < clippedBottom; y += 1) {
    const rowOffset = y * width;
    for (let x = clippedLeft; x < clippedRight; x += 1) {
      mask[rowOffset + x] = 1;
    }
  }
};

export function buildDimensionStructureMask(
  wallMask,
  openings,
  width,
  height,
  { bridgeMarginPixels = 2 } = {},
) {
  validateMask(wallMask, width, height);
  const bridgeMargin = Number(bridgeMarginPixels);
  if (!Number.isFinite(bridgeMargin) || bridgeMargin < 0) {
    throw new RangeError("Opening bridge margin must be a non-negative number");
  }

  const structure = Uint8Array.from(wallMask, value => value ? 1 : 0);
  for (const opening of openings ?? []) {
    if (opening?.valid !== true) continue;
    const centerX = Number(opening.center_x);
    const centerY = Number(opening.center_y);
    const openingWidth = Number(opening.width);
    const openingHeight = Number(opening.height);
    if (
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      !Number.isFinite(openingWidth) ||
      !Number.isFinite(openingHeight) ||
      openingWidth <= 0 ||
      openingHeight <= 0
    ) continue;

    const alongHorizontal = opening.axis === "horizontal" ||
      (opening.axis !== "vertical" && openingWidth >= openingHeight);
    const halfWidth = Math.max(1, openingWidth / 2);
    const halfHeight = Math.max(1, openingHeight / 2);
    const left = centerX - halfWidth - (alongHorizontal ? bridgeMargin : 0);
    const right = centerX + halfWidth + (alongHorizontal ? bridgeMargin : 0);
    const top = centerY - halfHeight - (alongHorizontal ? 0 : bridgeMargin);
    const bottom = centerY + halfHeight + (alongHorizontal ? 0 : bridgeMargin);
    fillClippedRectangle(structure, width, height, left, top, right, bottom);
  }
  return structure;
}

export function classifyEmptyRegions(structureMask, width, height) {
  validateMask(structureMask, width, height);
  const pixelCount = width * height;
  const regionIds = new Int32Array(pixelCount);
  regionIds.fill(-1);
  const queue = new Int32Array(pixelCount);
  const regions = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (structureMask[start] || regionIds[start] >= 0) continue;
    const id = regions.length;
    let head = 0;
    let tail = 0;
    let exterior = false;
    queue[tail] = start;
    tail += 1;
    regionIds[start] = id;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        exterior = true;
      }

      if (y > 0) {
        const north = index - width;
        if (!structureMask[north] && regionIds[north] < 0) {
          regionIds[north] = id;
          queue[tail] = north;
          tail += 1;
        }
      }
      if (x < width - 1) {
        const east = index + 1;
        if (!structureMask[east] && regionIds[east] < 0) {
          regionIds[east] = id;
          queue[tail] = east;
          tail += 1;
        }
      }
      if (y < height - 1) {
        const south = index + width;
        if (!structureMask[south] && regionIds[south] < 0) {
          regionIds[south] = id;
          queue[tail] = south;
          tail += 1;
        }
      }
      if (x > 0) {
        const west = index - 1;
        if (!structureMask[west] && regionIds[west] < 0) {
          regionIds[west] = id;
          queue[tail] = west;
          tail += 1;
        }
      }
    }
    regions.push({ id, exterior });
  }

  return { regionIds, regions };
}

const vertexKey = point => `${point.x}:${point.y}`;
const outgoingKey = (regionId, point) => `${regionId}|${vertexKey(point)}`;

const collectBoundaryEdges = (structure, width, height, classification) => {
  const edges = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!structure[y * width + x]) continue;
      for (const template of BOUNDARY_TEMPLATES) {
        const neighborX = x + template.neighborX;
        const neighborY = y + template.neighborY;
        const inside = neighborX >= 0 && neighborX < width && neighborY >= 0 && neighborY < height;
        if (inside && structure[neighborY * width + neighborX]) continue;

        let regionId = EXTERIOR_IMAGE_REGION_ID;
        let exterior = true;
        if (inside) {
          regionId = classification.regionIds[neighborY * width + neighborX];
          if (regionId < 0) continue;
          exterior = Boolean(classification.regions[regionId]?.exterior);
        }
        edges.push({
          start: { x: x + template.startX, y: y + template.startY },
          end: { x: x + template.endX, y: y + template.endY },
          direction: template.direction,
          regionId,
          face: exterior ? "exterior" : "interior",
        });
      }
    }
  }
  return edges;
};

const TURN_PRIORITY = Object.freeze(new Map([
  [1, 0],
  [0, 1],
  [3, 2],
  [2, 3],
]));

const traceBoundaryPaths = edges => {
  const outgoing = new Map();
  edges.forEach((edge, index) => {
    const key = outgoingKey(edge.regionId, edge.start);
    const candidates = outgoing.get(key) ?? [];
    candidates.push(index);
    outgoing.set(key, candidates);
  });
  const used = new Uint8Array(edges.length);
  const paths = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex]) continue;
    const first = edges[startIndex];
    const points = [{ ...first.start }, { ...first.end }];
    used[startIndex] = 1;
    let current = first;
    let steps = 1;

    while (steps <= edges.length) {
      const candidates = (outgoing.get(outgoingKey(current.regionId, current.end)) ?? [])
        .filter(index => !used[index]);
      if (candidates.length === 0) break;
      candidates.sort((firstCandidate, secondCandidate) => {
        const firstTurn = (edges[firstCandidate].direction - current.direction + 4) % 4;
        const secondTurn = (edges[secondCandidate].direction - current.direction + 4) % 4;
        return TURN_PRIORITY.get(firstTurn) - TURN_PRIORITY.get(secondTurn);
      });
      const nextIndex = candidates[0];
      used[nextIndex] = 1;
      current = edges[nextIndex];
      points.push({ ...current.end });
      steps += 1;
      if (vertexKey(current.end) === vertexKey(first.start)) break;
    }

    paths.push({
      points,
      closed: vertexKey(points[0]) === vertexKey(points.at(-1)),
      regionId: first.regionId,
      face: first.face,
    });
  }
  return paths;
};

const distanceToLine = (point, start, end) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const denominator = deltaX * deltaX + deltaY * deltaY;
  if (denominator === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = clamp(
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / denominator,
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY),
  );
};

const simplifyPath = (points, tolerance) => {
  if (points.length <= 2) return points.map(point => ({ ...point }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop();
    let farthestIndex = -1;
    let farthestDistance = tolerance;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToLine(points[index], points[startIndex], points[endIndex]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex < 0) continue;
    keep[farthestIndex] = 1;
    stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
  }
  return points.filter((_, index) => keep[index]).map(point => ({ ...point }));
};

const cyclicArc = (ring, startIndex, endIndex) => {
  const result = [{ ...ring[startIndex] }];
  let index = startIndex;
  while (index !== endIndex) {
    index = (index + 1) % ring.length;
    result.push({ ...ring[index] });
  }
  return result;
};

const simplifyBoundaryPath = (path, tolerance) => {
  if (!path.closed) return [simplifyPath(path.points, tolerance)];
  const ring = path.points.slice(0, -1);
  if (ring.length < 3) return [simplifyPath(path.points, tolerance)];

  let firstIndex = 0;
  let farthestIndex = 1;
  let farthestDistance = -1;
  for (let index = 1; index < ring.length; index += 1) {
    const distance = Math.hypot(ring[index].x - ring[0].x, ring[index].y - ring[0].y);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  firstIndex = farthestIndex;
  let secondIndex = firstIndex === 0 ? 1 : 0;
  farthestDistance = -1;
  for (let index = 0; index < ring.length; index += 1) {
    const distance = Math.hypot(
      ring[index].x - ring[firstIndex].x,
      ring[index].y - ring[firstIndex].y,
    );
    if (distance > farthestDistance) {
      farthestDistance = distance;
      secondIndex = index;
    }
  }
  return [
    simplifyPath(cyclicArc(ring, firstIndex, secondIndex), tolerance),
    simplifyPath(cyclicArc(ring, secondIndex, firstIndex), tolerance),
  ];
};

const makeSegment = (start, end, face, regionId) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthPixels = Math.hypot(deltaX, deltaY);
  if (lengthPixels <= 0) return null;
  return {
    start: { ...start },
    end: { ...end },
    normal: { x: deltaY / lengthPixels, y: -deltaX / lengthPixels },
    lengthPixels,
    face,
    regionId,
  };
};

const pointsNear = (first, second, tolerance = 0.01) =>
  Math.hypot(first.x - second.x, first.y - second.y) <= tolerance;

const mergeCollinearSegments = segments => {
  let result = segments.filter(Boolean);
  let changed = true;
  while (changed) {
    changed = false;
    for (let firstIndex = 0; firstIndex < result.length && !changed; firstIndex += 1) {
      for (let secondIndex = 0; secondIndex < result.length; secondIndex += 1) {
        if (firstIndex === secondIndex) continue;
        const first = result[firstIndex];
        const second = result[secondIndex];
        if (
          first.face !== second.face ||
          first.regionId !== second.regionId ||
          !pointsNear(first.end, second.start)
        ) continue;
        const firstDirection = {
          x: (first.end.x - first.start.x) / first.lengthPixels,
          y: (first.end.y - first.start.y) / first.lengthPixels,
        };
        const secondDirection = {
          x: (second.end.x - second.start.x) / second.lengthPixels,
          y: (second.end.y - second.start.y) / second.lengthPixels,
        };
        const directionDot = firstDirection.x * secondDirection.x + firstDirection.y * secondDirection.y;
        const normalDot = first.normal.x * second.normal.x + first.normal.y * second.normal.y;
        if (directionDot < 0.995 || normalDot < 0.995) continue;

        const merged = makeSegment(first.start, second.end, first.face, first.regionId);
        result = result.filter((_, index) => index !== firstIndex && index !== secondIndex);
        result.push(merged);
        changed = true;
        break;
      }
    }
  }
  return result;
};

export function extractWallFaceDimensions(
  wallMask,
  openings,
  width,
  height,
  { minimumLengthPixels = 24, simplifyTolerancePixels = 2, bridgeMarginPixels = 2 } = {},
) {
  const minimumLength = Number(minimumLengthPixels);
  const simplifyTolerance = Number(simplifyTolerancePixels);
  if (!Number.isFinite(minimumLength) || minimumLength < 0) {
    throw new RangeError("Minimum wall-face length must be a non-negative number");
  }
  if (!Number.isFinite(simplifyTolerance) || simplifyTolerance < 0) {
    throw new RangeError("Wall-face simplification tolerance must be a non-negative number");
  }

  const structure = buildDimensionStructureMask(
    wallMask,
    openings,
    width,
    height,
    { bridgeMarginPixels },
  );
  const classification = classifyEmptyRegions(structure, width, height);
  const edges = collectBoundaryEdges(structure, width, height, classification);
  const paths = traceBoundaryPaths(edges);
  const segments = [];

  for (const path of paths) {
    for (const simplified of simplifyBoundaryPath(path, simplifyTolerance)) {
      for (let index = 0; index < simplified.length - 1; index += 1) {
        segments.push(makeSegment(
          simplified[index],
          simplified[index + 1],
          path.face,
          path.regionId,
        ));
      }
    }
  }

  return mergeCollinearSegments(segments)
    .filter(segment => segment && segment.lengthPixels >= minimumLength)
    .sort((first, second) => {
      if (first.face !== second.face) return first.face === "exterior" ? -1 : 1;
      return second.lengthPixels - first.lengthPixels;
    });
}

export function formatWallLength(millimeters) {
  const numeric = Number(millimeters);
  if (!Number.isFinite(numeric) || numeric < 0) return "";
  return `${Math.round(numeric).toLocaleString("en-US")} mm`;
}
