const FLOOR_PLAN_OBJECT_LABELS = {
  swingDoor: "여닫이문",
  doubleSwingDoor: "양개문",
  slidingDoor: "미닫이문",
  pocketDoor: "포켓도어",
  window: "창문",
  balconyWindow: "발코니창",
  toilet: "변기",
  sink: "세면대",
  bathtub: "욕조",
  showerBooth: "샤워부스",
  floorDrain: "배수구",
  kitchenSink: "주방싱크",
  gasRange: "가스레인지",
  refrigerator: "냉장고",
  stairs: "계단",
  elevator: "엘리베이터",
  column: "기둥"
};

const OPENING_TYPES = new Set(["swingDoor", "doubleSwingDoor", "slidingDoor", "pocketDoor", "window", "balconyWindow"]);
const DOOR_TYPES = new Set(["swingDoor", "doubleSwingDoor", "slidingDoor", "pocketDoor"]);
const STRUCTURE_TYPES = new Set(["stairs", "elevator", "column"]);
const KNOWN_TYPES = new Set(Object.keys(FLOOR_PLAN_OBJECT_LABELS));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPoint(point, options, warnings, context) {
  const x = finiteNumber(point?.x);
  const y = finiteNumber(point?.y);
  if (x === null || y === null) {
    warnings.push(`${context} 좌표가 유효하지 않아 제외했습니다.`);
    return null;
  }
  const clamped = {
    x: clamp(x, 0, options.imageWidth),
    y: clamp(y, 0, options.imageHeight)
  };
  if (clamped.x !== x || clamped.y !== y) warnings.push(`${context} 좌표를 이미지 범위 안으로 보정했습니다.`);

  return clamped;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wallLength(wall) {
  return distance(wall.start, wall.end);
}

function wallAxis(wall) {
  return Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y) ? "horizontal" : "vertical";
}

function wallAngle(wall) {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

function offAxisAngle(wall) {
  const angle = Math.atan2(Math.abs(wall.end.y - wall.start.y), Math.abs(wall.end.x - wall.start.x || 0.000001)) * 180 / Math.PI;

  return Math.min(angle, 90 - angle);
}

function wallDirection(wall) {
  const length = wallLength(wall) || 1;
  return {
    x: (wall.end.x - wall.start.x) / length,
    y: (wall.end.y - wall.start.y) / length
  };
}

function pointAt(wall, scalar) {
  const direction = wallDirection(wall);
  return {
    x: wall.start.x + direction.x * scalar,
    y: wall.start.y + direction.y * scalar
  };
}

function projectScalar(wall, point) {
  const direction = wallDirection(wall);
  return (point.x - wall.start.x) * direction.x + (point.y - wall.start.y) * direction.y;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 12;
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nearestEndpointDistance(point, walls, ignoredWallId) {
  let nearest = Infinity;
  for (const wall of walls) {
    if (wall.id === ignoredWallId) continue;
    nearest = Math.min(nearest, distance(point, wall.start), distance(point, wall.end));
  }

  return nearest;
}

function repairCollapsedWallCoordinates(walls, snapRadius, warnings) {
  return walls.flatMap((wall) => {
    // 직교 스냅 한계(7°)를 넘는 비직교 벽만 검사한다. 붕괴 신호는 각도가 아니라 x==y 끝점이라
    // 15°로 걸면 낮은 각도로 붕괴된 벽(실측 8°/14° 사례)을 놓친다.
    if (offAxisAngle(wall) <= 7) return [wall];
    const startCollapsed = Math.abs(wall.start.x - wall.start.y) < 2;
    const endCollapsed = Math.abs(wall.end.x - wall.end.y) < 2;
    if (startCollapsed === endCollapsed) return [wall];

    const collapsedKey = startCollapsed ? "start" : "end";
    const normalKey = startCollapsed ? "end" : "start";
    const collapsed = wall[collapsedKey];
    const normal = wall[normalKey];
    const candidates = [
      {
        axis: "vertical",
        point: { x: normal.x, y: collapsed.y }
      },
      {
        axis: "horizontal",
        point: { x: collapsed.x, y: normal.y }
      }
    ].flatMap((candidate) => {
      const repaired = { ...wall, [collapsedKey]: candidate.point };
      if (wallLength(repaired) < 24) return [];

      return [
        {
          ...candidate,
          junctionDistance: nearestEndpointDistance(candidate.point, walls, wall.id),
          repaired
        }
      ];
    });

    if (!candidates.length) {
      warnings.push(`벽 ${wall.id} 좌표 붕괴로 제거했습니다.`);
      return [];
    }

    candidates.sort((left, right) => {
      const leftHasJunction = left.junctionDistance <= snapRadius;
      const rightHasJunction = right.junctionDistance <= snapRadius;
      if (leftHasJunction !== rightHasJunction) return leftHasJunction ? -1 : 1;
      if (left.axis !== right.axis) return left.axis === "vertical" ? -1 : 1;

      return left.junctionDistance - right.junctionDistance;
    });
    warnings.push(`벽 ${wall.id} 좌표 붕괴 보정`);

    return [candidates[0].repaired];
  });
}

function segmentInternalIntersection(a, b) {
  const ax = a.end.x - a.start.x;
  const ay = a.end.y - a.start.y;
  const bx = b.end.x - b.start.x;
  const by = b.end.y - b.start.y;
  const denominator = ax * by - ay * bx;
  if (Math.abs(denominator) < 0.000001) return false;

  const cx = b.start.x - a.start.x;
  const cy = b.start.y - a.start.y;
  const t = (cx * by - cy * bx) / denominator;
  const u = (cx * ay - cy * ax) / denominator;
  const epsilon = 0.03;

  return t > epsilon && t < 1 - epsilon && u > epsilon && u < 1 - epsilon;
}

function removeGhostDiagonalWalls(walls, warnings) {
  return walls.filter((wall) => {
    if (offAxisAngle(wall) <= 15) return true;
    const internalCrossings = walls.filter((otherWall) => otherWall.id !== wall.id && segmentInternalIntersection(wall, otherWall)).length;
    if (internalCrossings < 2) return true;
    warnings.push(`벽 ${wall.id} 대각선 유령 벽으로 제거했습니다.`);

    return false;
  });
}

function normalizeWall(rawWall, index, options, warnings) {
  const start = clampPoint(rawWall?.start, options, warnings, `벽 ${rawWall?.id ?? index} 시작점`);
  const end = clampPoint(rawWall?.end, options, warnings, `벽 ${rawWall?.id ?? index} 끝점`);
  if (!start || !end) return null;
  if (distance(start, end) <= 0) {
    warnings.push(`벽 ${rawWall?.id ?? index} 길이가 0이라 제외했습니다.`);
    return null;
  }

  return {
    id: uniqueWallId(String(rawWall?.id || `w${index + 1}`), options.usedWallIds),
    start,
    end,
    thicknessPx: finiteNumber(rawWall?.thicknessPx)
  };
}

function uniqueWallId(rawId, usedWallIds) {
  const baseId = rawId.trim() || "w";
  if (!usedWallIds.has(baseId)) {
    usedWallIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  while (usedWallIds.has(`${baseId}-${suffix}`)) suffix += 1;
  const nextId = `${baseId}-${suffix}`;
  usedWallIds.add(nextId);

  return nextId;
}

function snapOrthogonal(wall) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const angle = Math.atan2(Math.abs(dy), Math.abs(dx || 0.000001)) * 180 / Math.PI;
  const verticalAngle = 90 - angle;
  if (angle <= 7) {
    const y = (wall.start.y + wall.end.y) / 2;
    return { ...wall, start: { ...wall.start, y }, end: { ...wall.end, y } };
  }
  if (verticalAngle <= 7) {
    const x = (wall.start.x + wall.end.x) / 2;
    return { ...wall, start: { ...wall.start, x }, end: { ...wall.end, x } };
  }

  return wall;
}

function snapJunctions(walls, radius) {
  const endpoints = walls.flatMap((wall, wallIndex) => [
    { point: wall.start, wallIndex, key: "start" },
    { point: wall.end, wallIndex, key: "end" }
  ]);
  const parent = endpoints.map((_point, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let index = 0; index < endpoints.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < endpoints.length; otherIndex += 1) {
      if (distance(endpoints[index].point, endpoints[otherIndex].point) <= radius) union(index, otherIndex);
    }
  }

  const clusters = new Map();
  endpoints.forEach((endpoint, index) => {
    const root = find(index);
    const cluster = clusters.get(root) ?? { count: 0, x: 0, y: 0 };
    cluster.count += 1;
    cluster.x += endpoint.point.x;
    cluster.y += endpoint.point.y;
    clusters.set(root, cluster);
  });

  const snapped = walls.map((wall) => ({ ...wall, start: { ...wall.start }, end: { ...wall.end } }));
  endpoints.forEach((endpoint, index) => {
    const cluster = clusters.get(find(index));
    const point = { x: cluster.x / cluster.count, y: cluster.y / cluster.count };
    snapped[endpoint.wallIndex][endpoint.key] = point;
  });

  return snapped.filter((wall) => wallLength(wall) > 0);
}

function normalizeSegmentDirection(wall) {
  const axis = wallAxis(wall);
  if (axis === "horizontal" && wall.start.x > wall.end.x) return { ...wall, start: wall.end, end: wall.start };
  if (axis === "vertical" && wall.start.y > wall.end.y) return { ...wall, start: wall.end, end: wall.start };

  return wall;
}

function mergeCollinearWalls(walls, radius) {
  const pending = walls.map(normalizeSegmentDirection);
  const merged = [];

  for (const wall of pending) {
    const axis = wallAxis(wall);
    const axisValue = axis === "horizontal" ? wall.start.y : wall.start.x;
    const start = axis === "horizontal" ? wall.start.x : wall.start.y;
    const end = axis === "horizontal" ? wall.end.x : wall.end.y;
    const match = merged.find((candidate) => {
      if (wallAxis(candidate) !== axis) return false;
      const candidateAxisValue = axis === "horizontal" ? candidate.start.y : candidate.start.x;
      const candidateStart = axis === "horizontal" ? Math.min(candidate.start.x, candidate.end.x) : Math.min(candidate.start.y, candidate.end.y);
      const candidateEnd = axis === "horizontal" ? Math.max(candidate.start.x, candidate.end.x) : Math.max(candidate.start.y, candidate.end.y);

      return Math.abs(candidateAxisValue - axisValue) <= radius && start <= candidateEnd + radius && end >= candidateStart - radius;
    });

    if (!match) {
      merged.push(wall);
      continue;
    }

    const matchStart = axis === "horizontal" ? Math.min(match.start.x, match.end.x) : Math.min(match.start.y, match.end.y);
    const matchEnd = axis === "horizontal" ? Math.max(match.start.x, match.end.x) : Math.max(match.start.y, match.end.y);
    const nextStart = Math.min(matchStart, start);
    const nextEnd = Math.max(matchEnd, end);
    const nextAxisValue = axis === "horizontal" ? (match.start.y + axisValue) / 2 : (match.start.x + axisValue) / 2;
    if (axis === "horizontal") {
      match.start = { x: nextStart, y: nextAxisValue };
      match.end = { x: nextEnd, y: nextAxisValue };
    } else {
      match.start = { x: nextAxisValue, y: nextStart };
      match.end = { x: nextAxisValue, y: nextEnd };
    }
  }

  return merged;
}

function normalizeObject(rawObject, index, options, warnings) {
  const type = rawObject?.type;
  if (!KNOWN_TYPES.has(type)) {
    warnings.push(`객체 ${rawObject?.id ?? index} 타입을 알 수 없어 제외했습니다.`);
    return null;
  }
  const center = clampPoint(rawObject?.center, options, warnings, `객체 ${rawObject?.id ?? index} 중심`);
  if (!center) return null;
  const width = finiteNumber(rawObject?.size?.width);
  const height = finiteNumber(rawObject?.size?.height);
  if (width === null || height === null || width < 0 || height < 0) {
    warnings.push(`객체 ${rawObject?.id ?? index} 크기가 유효하지 않아 제외했습니다.`);
    return null;
  }
  const spanStart = rawObject?.spanOnWall ? clampPoint(rawObject.spanOnWall.start, options, warnings, `객체 ${rawObject?.id ?? index} span 시작점`) : null;
  const spanEnd = rawObject?.spanOnWall ? clampPoint(rawObject.spanOnWall.end, options, warnings, `객체 ${rawObject?.id ?? index} span 끝점`) : null;
  const swingOpensTowards = rawObject?.swing ? clampPoint(rawObject.swing.opensTowards, options, warnings, `객체 ${rawObject?.id ?? index} swing`) : null;

  return {
    attachedWallId: typeof rawObject?.attachedWallId === "string" && rawObject.attachedWallId ? rawObject.attachedWallId : null,
    center,
    confidence: finiteNumber(rawObject?.confidence),
    evidence: typeof rawObject?.evidence === "string" ? rawObject.evidence : undefined,
    id: String(rawObject?.id || `o${index + 1}`),
    rotationDeg: [0, 90, 180, 270].includes(Number(rawObject?.rotationDeg)) ? Number(rawObject.rotationDeg) : 0,
    size: { width, height },
    spanOnWall: spanStart && spanEnd ? { start: spanStart, end: spanEnd } : null,
    swing: rawObject?.swing && (rawObject.swing.hinge === "start" || rawObject.swing.hinge === "end") && swingOpensTowards
      ? { hinge: rawObject.swing.hinge, opensTowards: swingOpensTowards }
      : null,
    type
  };
}

function nearestWallMatch(walls, point) {
  let best = null;
  for (const wall of walls) {
    const length = wallLength(wall);
    const scalar = clamp(projectScalar(wall, point), 0, length);
    const projected = pointAt(wall, scalar);
    const score = distance(projected, point);
    if (!best || score < best.score) best = { wall, score };
  }

  return best;
}

function nearestWall(walls, point) {
  return nearestWallMatch(walls, point)?.wall ?? null;
}

function angleDifferenceDegrees(left, right) {
  const diff = Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));

  return Math.min(diff, Math.abs(Math.PI - diff)) * 180 / Math.PI;
}

function pointDistanceToWall(point, wall) {
  const length = wallLength(wall);
  if (!length) return distance(point, wall.start);
  const scalar = clamp(projectScalar(wall, point), 0, length);

  return distance(point, pointAt(wall, scalar));
}

function inferredOpeningSpan(object) {
  if (object.spanOnWall) return object.spanOnWall;
  const isVertical = object.rotationDeg === 90 || object.rotationDeg === 270;
  const spanLength = Math.max(1, isVertical ? object.size.height : object.size.width);
  const half = spanLength / 2;

  return isVertical
    ? { start: { x: object.center.x, y: object.center.y - half }, end: { x: object.center.x, y: object.center.y + half } }
    : { start: { x: object.center.x - half, y: object.center.y }, end: { x: object.center.x + half, y: object.center.y } };
}

function spanWallOverlapRatio(span, wall) {
  const wallLengthValue = wallLength(wall);
  const spanStart = projectScalar(wall, span.start);
  const spanEnd = projectScalar(wall, span.end);
  const spanMin = Math.min(spanStart, spanEnd);
  const spanMax = Math.max(spanStart, spanEnd);
  const overlap = Math.max(0, Math.min(wallLengthValue, spanMax) - Math.max(0, spanMin));
  const spanLength = Math.max(1, distance(span.start, span.end));

  return overlap / spanLength;
}

function findOpeningWall(object, walls, snapRadius) {
  const span = inferredOpeningSpan(object);
  const midpoint = {
    x: (span.start.x + span.end.x) / 2,
    y: (span.start.y + span.end.y) / 2
  };
  const spanAngle = Math.atan2(span.end.y - span.start.y, span.end.x - span.start.x);
  const maxDistance = Math.max(24, snapRadius * 2);
  let best = null;

  for (const wall of walls) {
    if (angleDifferenceDegrees(spanAngle, wallAngle(wall)) > 20) continue;
    const perpendicularDistance = pointDistanceToWall(midpoint, wall);
    if (perpendicularDistance > maxDistance) continue;
    if (spanWallOverlapRatio(span, wall) < 0.5) continue;
    if (!best || perpendicularDistance < best.perpendicularDistance) best = { perpendicularDistance, wall };
  }

  return best?.wall ?? null;
}

function openingSpanOnWall(object, wall) {
  const length = wallLength(wall);
  if (object.spanOnWall) {
    const start = clamp(projectScalar(wall, object.spanOnWall.start), 0, length);
    const end = clamp(projectScalar(wall, object.spanOnWall.end), 0, length);
    return { end: Math.max(start, end), start: Math.min(start, end) };
  }
  const center = clamp(projectScalar(wall, object.center), 0, length);
  const axis = wallAxis(wall);
  const spanLength = Math.max(1, axis === "horizontal" ? object.size.width : object.size.height);

  return {
    end: clamp(center + spanLength / 2, 0, length),
    start: clamp(center - spanLength / 2, 0, length)
  };
}

function projectOpeningObjectsToWalls(walls, objects, snapRadius) {
  for (const object of objects) {
    if (!OPENING_TYPES.has(object.type)) continue;
    const wall = findOpeningWall(object, walls, snapRadius);
    if (!wall) {
      object.attachedWallId = null;
      object.openingWallMatched = false;
      continue;
    }
    const span = openingSpanOnWall(object, wall);
    if (span.end <= span.start) continue;
    object.attachedWallId = wall.id;
    object.matchedWallId = wall.id;
    object.openingWallMatched = true;
    object.spanOnWall = { start: pointAt(wall, span.start), end: pointAt(wall, span.end) };
  }
}

function splitDoorWalls(walls, objects) {
  const cutsByWall = new Map();
  for (const object of objects) {
    if (!DOOR_TYPES.has(object.type)) continue;
    const wall = walls.find((candidate) => candidate.id === object.attachedWallId);
    if (!wall) continue;
    const span = openingSpanOnWall(object, wall);
    if (span.end <= span.start) continue;
    const cuts = cutsByWall.get(wall.id) ?? [];
    cuts.push(span);
    cutsByWall.set(wall.id, cuts);
  }

  const nextWalls = [];
  for (const wall of walls) {
    const cuts = (cutsByWall.get(wall.id) ?? []).sort((a, b) => a.start - b.start);
    if (!cuts.length) {
      nextWalls.push(wall);
      continue;
    }

    const intervals = [];
    let cursor = 0;
    for (const cut of cuts) {
      intervals.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
    }
    intervals.push({ start: cursor, end: wallLength(wall) });

    let suffixCode = 97;
    for (const interval of intervals) {
      if (interval.end - interval.start < 12) continue;
      nextWalls.push({
        id: `${wall.id}-${String.fromCharCode(suffixCode)}`,
        start: pointAt(wall, interval.start),
        end: pointAt(wall, interval.end)
      });
      suffixCode += 1;
    }
  }

  return nextWalls;
}

function categoryForType(type) {
  if (OPENING_TYPES.has(type)) return "opening";
  if (STRUCTURE_TYPES.has(type)) return "structure";

  return "fixture";
}

function objectId(rawId) {
  return rawId.startsWith("obj-") ? rawId : `obj-${rawId}`;
}

function instantiateObjects(objects, walls, snapRadius) {
  return objects.map((object) => {
    const attachedWall = object.attachedWallId ? walls.find((wall) => wall.id === object.attachedWallId) : null;
    const splitSourceWalls = OPENING_TYPES.has(object.type) && object.matchedWallId
      ? walls.filter((wall) => String(wall.id).startsWith(`${object.matchedWallId}-`))
      : [];
    const attachedWallMatch = attachedWall ? { wall: attachedWall, score: nearestWallMatch([attachedWall], object.center)?.score ?? Infinity } : null;
    const nearestAttachedWallMatch = attachedWallMatch ?? nearestWallMatch(splitSourceWalls.length ? splitSourceWalls : walls, object.center);
    const attachThreshold = Math.max(24, snapRadius * 2);
    const shouldAttach = OPENING_TYPES.has(object.type)
      ? object.openingWallMatched !== false && Boolean(attachedWall ?? object.attachedWallId)
      : (nearestAttachedWallMatch?.score ?? Infinity) <= attachThreshold;
    const nextAttachedWall = shouldAttach ? nearestAttachedWallMatch?.wall : null;
    const nextAttachedWallId = nextAttachedWall?.id;
    const rotationDeg = OPENING_TYPES.has(object.type) && nextAttachedWall
      ? (wallAxis(nextAttachedWall) === "vertical" ? 90 : 0)
      : object.rotationDeg;

    return {
      ...(nextAttachedWallId ? { attachedWallId: nextAttachedWallId } : {}),
      category: categoryForType(object.type),
      center: object.center,
      ...(object.confidence !== null ? { confidence: object.confidence } : {}),
      ...(object.evidence ? { evidence: object.evidence } : {}),
      id: objectId(object.id),
      label: FLOOR_PLAN_OBJECT_LABELS[object.type],
      rotationDeg,
      size: object.size,
      source: "openai-object-graph",
      ...(object.spanOnWall ? { spanOnWall: object.spanOnWall } : {}),
      status: "CANDIDATE",
      ...(object.swing ? { swing: object.swing } : {}),
      type: object.type
    };
  });
}

export function normalizeObjectGraph(raw, options = {}) {
  const imageWidth = Math.max(0, Number(options.imageWidth) || 0);
  const imageHeight = Math.max(0, Number(options.imageHeight) || 0);
  const warnings = Array.isArray(raw?.warnings) ? raw.warnings.filter((warning) => typeof warning === "string") : [];
  const normalizeOptions = { imageHeight, imageWidth, usedWallIds: new Set() };
  const rawWalls = Array.isArray(raw?.walls) ? raw.walls : [];
  const rawObjects = Array.isArray(raw?.objects) ? raw.objects : [];
  const initialWalls = rawWalls.flatMap((wall, index) => {
    const normalized = normalizeWall(wall, index, normalizeOptions, warnings);
    return normalized ? [normalized] : [];
  });
  const medianWallThicknessPx = median(initialWalls.map((wall) => wall.thicknessPx));
  const snapRadius = Math.max(8, medianWallThicknessPx * 0.75);
  const repairedWalls = removeGhostDiagonalWalls(repairCollapsedWallCoordinates(initialWalls, snapRadius, warnings), warnings);
  const snappedOrthogonalWalls = repairedWalls.map(snapOrthogonal);
  const junctionSnappedWalls = snapJunctions(snappedOrthogonalWalls, snapRadius);
  const mergedWalls = snapJunctions(mergeCollinearWalls(junctionSnappedWalls, snapRadius), snapRadius);
  const normalizedObjects = rawObjects.flatMap((object, index) => {
    const normalized = normalizeObject(object, index, normalizeOptions, warnings);
    return normalized ? [normalized] : [];
  });
  projectOpeningObjectsToWalls(mergedWalls, normalizedObjects, snapRadius);
  const splitWalls = splitDoorWalls(mergedWalls, normalizedObjects);
  const objects = instantiateObjects(normalizedObjects, splitWalls, snapRadius);
  const uniqueWarnings = [...new Set(warnings)].slice(0, 30);

  return {
    medianWallThicknessPx,
    objects,
    walls: splitWalls.map((wall) => ({ id: String(wall.id), start: wall.start, end: wall.end })),
    warnings: uniqueWarnings
  };
}
