// RoomPlan(iOS) 캡처 벽 세그먼트(MetricWall, 중심선)를 이어 바닥 폴리곤을 만든다.
//
// capture-to-layout.ts가 이 결과를 MitunetSceneLayout.floor로 채워 3D 도면 뷰
// (RoomlogThreeFloorPlanView)에 바닥 메시를 렌더한다 — 그 전까진 벽만 허공에 떠 있었다.
//
// 정직 원칙: 벽 스캔이 완전히 닫히지 않으면(개구부가 트여 있거나 캡처 누락) 추정 사각형으로
// 메우지 않고 그냥 바닥을 만들지 않는다 — 없는 정보를 있는 척하지 않는다(CLAUDE.md의
// "공백 ≠ 책임 추정" 원칙과 같은 결: 여기선 "공백 ≠ 방 형태 추정").
//
// three.js 의존 없는 순수 함수 — 렌더러 없이도 테스트 가능.

import type { MetricWall } from "@roomlog/types";

/** 벽 끝점을 같은 정점으로 묶는 허용 오차(미터). RoomPlan은 벽마다 독립 추정이라, 이론상
 * 같은 코너를 가리키는 두 벽의 끝점이 몇 cm씩 어긋난다. */
const VERTEX_SNAP_TOLERANCE_METERS = 0.15;

/** 이 미만 면적(㎡)의 루프는 채택하지 않는다 — 노이즈로 생기는 퇴화 루프 배제. */
const MIN_LOOP_AREA_SQ_METERS = 0.5;

type Point = [number, number];

type Edge = { a: number; b: number };

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** 신발끈 공식. 부호 없는 면적(㎡)만 필요해서 절댓값으로 반환한다. */
function polygonArea(points: Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % points.length];
    sum += x0 * z1 - x1 * z0;
  }
  return Math.abs(sum) / 2;
}

/** 벽 끝점들을 허용 오차 내에서 같은 정점으로 묶는다(O(n²) 최근접 병합 — 캡처 하나당 벽이
 * 수십 개 수준이라 성능 문제 없음). 시작/끝이 같은 정점으로 스냅되는 퇴화 세그먼트는
 * 간선으로 만들지 않는다. */
function buildGraph(walls: MetricWall[]): { vertices: Point[]; edges: Edge[] } {
  const vertices: Point[] = [];
  const edges: Edge[] = [];

  function vertexIndexFor(point: Point): number {
    for (let i = 0; i < vertices.length; i++) {
      if (distance(vertices[i], point) <= VERTEX_SNAP_TOLERANCE_METERS) return i;
    }
    vertices.push(point);
    return vertices.length - 1;
  }

  for (const wall of walls) {
    const a = vertexIndexFor(wall.start);
    const b = vertexIndexFor(wall.end);
    if (a === b) continue; // 퇴화 세그먼트
    edges.push({ a, b });
  }

  return { vertices, edges };
}

function otherEndpoint(edge: Edge, vertexId: number) {
  return edge.a === vertexId ? edge.b : edge.a;
}

/** 정점별 인접 간선 인덱스. */
function buildAdjacency(vertexCount: number, edges: Edge[]): number[][] {
  const adjacency: number[][] = Array.from({ length: vertexCount }, () => []);
  edges.forEach((edge, edgeIndex) => {
    adjacency[edge.a].push(edgeIndex);
    adjacency[edge.b].push(edgeIndex);
  });
  return adjacency;
}

/**
 * startEdgeIndex에서 출발해 "들어온 간선이 아닌 미방문 간선"을 따라 걷다가 시작 정점으로
 * 복귀하면 루프로 확정한다. 막다른 길(모든 인접 간선이 이미 이 걸음에서 쓰임)에 닿으면
 * 미완결로 포기 — 위 헤더의 정직 원칙대로 부분 결과를 방으로 만들지 않는다.
 */
function traceLoopFrom(
  startEdgeIndex: number,
  vertices: Point[],
  edges: Edge[],
  adjacency: number[][]
): { vertexIds: number[]; usedEdges: number[] } | null {
  const startEdge = edges[startEdgeIndex];
  const startVertexId = startEdge.a;
  const vertexIds = [startVertexId];
  const usedEdges = [startEdgeIndex];
  const usedEdgeSet = new Set<number>([startEdgeIndex]);
  let currentVertexId = otherEndpoint(startEdge, startVertexId);

  // 그래프가 단순 루프(2-정규 사이클)라는 전제로, 최대 간선 수만큼만 걸으면 충분하다.
  for (let steps = 0; steps <= edges.length; steps++) {
    if (currentVertexId === startVertexId) {
      return { vertexIds, usedEdges };
    }
    vertexIds.push(currentVertexId);
    const nextEdgeIndex = adjacency[currentVertexId].find((edgeIndex) => !usedEdgeSet.has(edgeIndex));
    if (nextEdgeIndex === undefined) return null; // 막다른 길 — 미완결 스캔
    usedEdgeSet.add(nextEdgeIndex);
    usedEdges.push(nextEdgeIndex);
    currentVertexId = otherEndpoint(edges[nextEdgeIndex], currentVertexId);
  }
  return null;
}

/** 같은 정점 집합으로 이뤄진 중복 루프(정방향/역방향으로 두 번 잡히는 경우) 제거용 키.
 * 정점 id를 오름차순 정렬하면 시작점·방향에 무관하게 같은 루프는 같은 키가 된다. */
function loopKey(vertexIds: number[]) {
  return [...vertexIds].sort((a, b) => a - b).join(",");
}

/**
 * 벽 중심선 세그먼트들로 닫힌 방 폴리곤을 찾는다. 방이 여러 개면 루프도 여러 개 반환한다.
 * 안 닫힌 스캔(개구부·캡처 누락)은 빈 배열이거나 다른 루프들만 담긴 부분 결과로 — 추정
 * 사각형으로 채우지 않는다.
 */
export function captureFloorPolygons(walls: MetricWall[]): Point[][] {
  const { vertices, edges } = buildGraph(walls);
  if (edges.length === 0) return [];

  const adjacency = buildAdjacency(vertices.length, edges);
  const globallyVisited = new Set<number>();
  const seenLoopKeys = new Set<string>();
  const loops: Point[][] = [];

  for (let startEdgeIndex = 0; startEdgeIndex < edges.length; startEdgeIndex++) {
    if (globallyVisited.has(startEdgeIndex)) continue;

    const traced = traceLoopFrom(startEdgeIndex, vertices, edges, adjacency);
    if (!traced) continue;

    traced.usedEdges.forEach((edgeIndex) => globallyVisited.add(edgeIndex));

    const key = loopKey(traced.vertexIds);
    if (seenLoopKeys.has(key)) continue;
    seenLoopKeys.add(key);

    const points = traced.vertexIds.map((id) => vertices[id]);
    if (polygonArea(points) > MIN_LOOP_AREA_SQ_METERS) {
      loops.push(points);
    }
  }

  return loops;
}
