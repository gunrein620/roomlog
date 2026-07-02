// 벽 끝점 연결성과 직선 벽 정규화 계산. room-model 내부 타입만 사용한다.

import type { Point, Wall } from "./types";

export type WallEndKind = "start" | "end";

export type WallGraphEndpoint = {
  end: WallEndKind;
  point: Point;
  wallId: Wall["id"];
  wallIndex: number;
};

export type WallGraphNode = {
  endpoints: WallGraphEndpoint[];
  id: string;
  point: Point;
  wallIds: Wall["id"][];
};

export type WallGraph = {
  nodes: WallGraphNode[];
};

export type DanglingWallEnd = {
  end: WallEndKind;
  point: Point;
  wallId: Wall["id"];
};

export type WallCorner = {
  endpoints: WallGraphEndpoint[];
  point: Point;
  wallIds: Wall["id"][];
};

export type MergeCollinearWallsOptions = {
  gapTolerancePx?: number;
  idPrefix?: string;
  tolerancePx?: number;
};

export type ClosedWallLoop = {
  perimeterPx: number;
  points: Point[];
  wallIds: Wall["id"][];
};

type CollinearGroup = {
  origin: Point;
  ux: number;
  uy: number;
  walls: Array<{ index: number; wall: Wall }>;
};

type WallInterval = {
  end: number;
  index: number;
  start: number;
  wall: Wall;
};

type MergedInterval = {
  end: number;
  firstIndex: number;
  segments: WallInterval[];
  start: number;
};

function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function uniqueWallIds(endpoints: WallGraphEndpoint[]) {
  const wallIds: Wall["id"][] = [];

  for (const endpoint of endpoints) {
    if (!wallIds.includes(endpoint.wallId)) wallIds.push(endpoint.wallId);
  }

  return wallIds;
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function cloneWall(wall: Wall): Wall {
  return { id: wall.id, start: clonePoint(wall.start), end: clonePoint(wall.end) };
}

function normalizeNumber(value: number) {
  if (Math.abs(value) < 1e-9) return 0;
  const roundedInteger = Math.round(value);
  if (Math.abs(value - roundedInteger) < 1e-9) return roundedInteger;
  return Math.round(value * 1000) / 1000;
}

function pointOnAxis(origin: Point, ux: number, uy: number, offset: number): Point {
  return {
    x: normalizeNumber(origin.x + ux * offset),
    y: normalizeNumber(origin.y + uy * offset)
  };
}

function wallLength(wall: Wall) {
  return distance(wall.start, wall.end);
}

function makeAxis(wall: Wall) {
  const length = wallLength(wall);
  if (length === 0) return null;

  let ux = (wall.end.x - wall.start.x) / length;
  let uy = (wall.end.y - wall.start.y) / length;

  if (ux < 0 || (ux === 0 && uy < 0)) {
    ux *= -1;
    uy *= -1;
  }

  return { ux, uy };
}

function pointLineDistance(point: Point, origin: Point, ux: number, uy: number) {
  return Math.abs((point.x - origin.x) * -uy + (point.y - origin.y) * ux);
}

function projectPoint(point: Point, origin: Point, ux: number, uy: number) {
  return (point.x - origin.x) * ux + (point.y - origin.y) * uy;
}

function isCollinearWithGroup(wall: Wall, group: CollinearGroup, tolerancePx: number) {
  const axis = makeAxis(wall);
  if (!axis) return false;

  const cross = Math.abs(axis.ux * group.uy - axis.uy * group.ux);
  if (cross > 1e-6) return false;

  return (
    pointLineDistance(wall.start, group.origin, group.ux, group.uy) <= tolerancePx &&
    pointLineDistance(wall.end, group.origin, group.ux, group.uy) <= tolerancePx
  );
}

function addInterval(mergedIntervals: MergedInterval[], interval: WallInterval, gapTolerancePx: number) {
  const current = mergedIntervals[mergedIntervals.length - 1];

  if (!current || interval.start > current.end + gapTolerancePx) {
    mergedIntervals.push({
      end: interval.end,
      firstIndex: interval.index,
      segments: [interval],
      start: interval.start
    });
    return;
  }

  current.end = Math.max(current.end, interval.end);
  current.firstIndex = Math.min(current.firstIndex, interval.index);
  current.segments.push(interval);
}

export function buildWallGraph(walls: readonly Wall[], tolerancePx = 1): WallGraph {
  const nodes: WallGraphNode[] = [];

  walls.forEach((wall, wallIndex) => {
    (["start", "end"] as const).forEach((end) => {
      const point = wall[end];
      let node = nodes.find((candidate) => distance(candidate.point, point) <= tolerancePx);

      if (!node) {
        node = {
          endpoints: [],
          id: `node-${nodes.length}`,
          point: clonePoint(point),
          wallIds: []
        };
        nodes.push(node);
      }

      const endpoint = { end, point: clonePoint(point), wallId: wall.id, wallIndex };
      node.endpoints.push(endpoint);
      node.wallIds = uniqueWallIds(node.endpoints);
    });
  });

  return { nodes };
}

export function findDanglingEnds(walls: readonly Wall[], tolerancePx = 1): DanglingWallEnd[] {
  return buildWallGraph(walls, tolerancePx).nodes
    .filter((node) => node.endpoints.length === 1)
    .map((node) => {
      const endpoint = node.endpoints[0];
      return {
        end: endpoint.end,
        point: clonePoint(node.point),
        wallId: endpoint.wallId
      };
    });
}

export function findCorners(walls: readonly Wall[], tolerancePx = 1): WallCorner[] {
  return buildWallGraph(walls, tolerancePx).nodes
    .filter((node) => node.wallIds.length >= 2)
    .map((node) => ({
      endpoints: node.endpoints.map((endpoint) => ({ ...endpoint, point: clonePoint(endpoint.point) })),
      point: clonePoint(node.point),
      wallIds: [...node.wallIds]
    }));
}

export function mergeCollinearWalls(
  walls: readonly Wall[],
  { gapTolerancePx, idPrefix = "merged", tolerancePx = 1 }: MergeCollinearWallsOptions = {}
): Wall[] {
  const maxGap = gapTolerancePx ?? tolerancePx;
  const groups: CollinearGroup[] = [];
  const zeroLengthWalls: Array<{ index: number; wall: Wall }> = [];

  walls.forEach((wall, index) => {
    const axis = makeAxis(wall);
    if (!axis) {
      zeroLengthWalls.push({ index, wall });
      return;
    }

    const group = groups.find((candidate) => isCollinearWithGroup(wall, candidate, tolerancePx));
    if (group) {
      group.walls.push({ index, wall });
      return;
    }

    groups.push({
      origin: clonePoint(wall.start),
      ux: axis.ux,
      uy: axis.uy,
      walls: [{ index, wall }]
    });
  });

  const output: Array<{ index: number; wall: Wall }> = zeroLengthWalls.map(({ index, wall }) => ({
    index,
    wall: cloneWall(wall)
  }));

  for (const group of groups) {
    const intervals = group.walls
      .map(({ index, wall }) => {
        const start = projectPoint(wall.start, group.origin, group.ux, group.uy);
        const end = projectPoint(wall.end, group.origin, group.ux, group.uy);

        return {
          end: Math.max(start, end),
          index,
          start: Math.min(start, end),
          wall
        };
      })
      .sort((left, right) => left.start - right.start || left.index - right.index);
    const mergedIntervals: MergedInterval[] = [];

    for (const interval of intervals) addInterval(mergedIntervals, interval, maxGap);

    for (const interval of mergedIntervals) {
      if (interval.segments.length === 1) {
        output.push({ index: interval.firstIndex, wall: cloneWall(interval.segments[0].wall) });
        continue;
      }

      output.push({
        index: interval.firstIndex,
        wall: {
          id: `${idPrefix}:${interval.segments.map((segment) => segment.wall.id).join("+")}`,
          start: pointOnAxis(group.origin, group.ux, group.uy, interval.start),
          end: pointOnAxis(group.origin, group.ux, group.uy, interval.end)
        }
      });
    }
  }

  return output.sort((left, right) => left.index - right.index).map(({ wall }) => wall);
}

export function detectClosedLoops(walls: readonly Wall[], tolerancePx = 1): ClosedWallLoop[] {
  const graph = buildWallGraph(walls, tolerancePx);
  const wallNodeIds = new Map<number, { end: number; start: number }>();

  graph.nodes.forEach((node, nodeIndex) => {
    for (const endpoint of node.endpoints) {
      const current = wallNodeIds.get(endpoint.wallIndex) ?? { end: -1, start: -1 };
      current[endpoint.end] = nodeIndex;
      wallNodeIds.set(endpoint.wallIndex, current);
    }
  });

  const adjacency = graph.nodes.map(() => [] as Array<{ edgeKey: string; to: number; wallIndex: number }>);

  walls.forEach((wall, wallIndex) => {
    const nodeIds = wallNodeIds.get(wallIndex);
    if (!nodeIds || nodeIds.start === nodeIds.end || nodeIds.start < 0 || nodeIds.end < 0) return;

    const edgeKey = String(wallIndex);
    adjacency[nodeIds.start].push({ edgeKey, to: nodeIds.end, wallIndex });
    adjacency[nodeIds.end].push({ edgeKey, to: nodeIds.start, wallIndex });
  });

  const loops = new Map<string, ClosedWallLoop>();

  function recordLoop(pathNodes: number[], pathEdges: number[]) {
    const sortedWallIds = pathEdges.map((wallIndex) => walls[wallIndex].id).sort();
    const key = sortedWallIds.map(String).join("|");
    if (loops.has(key)) return;

    loops.set(key, {
      perimeterPx: normalizeNumber(pathEdges.reduce((sum, wallIndex) => sum + wallLength(walls[wallIndex]), 0)),
      points: pathNodes.map((nodeIndex) => clonePoint(graph.nodes[nodeIndex].point)),
      wallIds: pathEdges.map((wallIndex) => walls[wallIndex].id)
    });
  }

  function visit(startNode: number, currentNode: number, pathNodes: number[], pathEdges: number[], usedEdges: Set<string>) {
    if (pathEdges.length > walls.length || loops.size >= 50) return;

    for (const edge of adjacency[currentNode]) {
      if (usedEdges.has(edge.edgeKey)) continue;

      if (edge.to === startNode && pathEdges.length >= 2) {
        recordLoop(pathNodes, [...pathEdges, edge.wallIndex]);
        continue;
      }

      if (pathNodes.includes(edge.to)) continue;

      const nextUsedEdges = new Set(usedEdges);
      nextUsedEdges.add(edge.edgeKey);
      visit(startNode, edge.to, [...pathNodes, edge.to], [...pathEdges, edge.wallIndex], nextUsedEdges);
    }
  }

  graph.nodes.forEach((_, startNode) => {
    visit(startNode, startNode, [startNode], [], new Set());
  });

  return [...loops.values()].sort((left, right) => left.wallIds.length - right.wallIds.length);
}
