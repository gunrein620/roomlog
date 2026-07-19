// 도면 폴리곤 정합 — 수동 2점 정합(splat-tour/similarity-solve.ts)을 대체하는 결정론적(비-AI) 매처.
//
// 전제: iPhone LiDAR 캡처 경로에서 스플랫은 이미 ARKit 실측 미터·중력정렬 상태다. 그러므로
// "캡처 도면(RoomPlan) ↔ 소유자 도면"의 정합은 두 METRIC 2D 벽-폴리곤을 맞추는 문제로 축소되고,
// 풀어야 할 자유도는 yaw(수평 회전) + XZ 평행이동뿐이다 — 스케일은 1로 고정한다.
//
// 부호/축 규약은 web apps/web/src/app/splat-tour/similarity-solve.ts · transform-project.ts와
// 반드시 일치해야 한다(같은 SplatTransform을 뷰어가 그대로 소비하므로). 그 파일들의 규약:
//   plan = scaleMultiplier · R(θ) · splat + (offsetX, offsetZ)
//   R(θ)(x, y) = (cosθ·x − sinθ·y, sinθ·x + cosθ·y)   [θ = rotationYDegrees, 라디안 환산]
// 이 매처는 "splat" 역할 = capture(입주자 캡처), "plan" 역할 = owner(소유자 도면)로 두고
// 동일한 R(θ)·+t 합성으로 최적 θ, t를 추정한다.
//
// api는 web 내부 모듈을 import하지 않는다(billing-manager-mapping·splat-asset.types와 동일 원칙) —
// wallFootprintCorners/wallLocalToWorldXZ의 기하 계산(apps/web/.../splat-plan-shape.ts)은 여기 포팅해
// 복제한다. SplatTransform 필드 shape도 apps/api/src/splat-asset/splat-asset.types.ts의
// SplatTransformInput을 그대로 재사용한다(이미 존재하는 "web과 필드는 같지만 import는 안 한다" 패턴).

import type { RoomPlanCaptureFloorPlan } from "@roomlog/types";
import type { SplatTransformInput } from "../../splat-asset/splat-asset.types";

export type SplatTransform = SplatTransformInput;

type Pt = [number, number];

// ── 입력 계약 ──────────────────────────────────────────────────────────

export interface WallSegment {
  start: Pt;
  end: Pt;
}

export interface WallSegmentOpening {
  kind: "door" | "window";
  center: Pt;
}

/** 추상 입력 — capture/owner 어느 쪽이든 이 shape로 정규화한 뒤 matchFloorPlans에 넣는다. */
export interface WallSegments {
  segments: WallSegment[];
  openings?: WallSegmentOpening[];
}

/** 소유자 도면 벽 하나 — WheretoputWall3D(apps/web/.../floor-plan-3d/room-model/types.ts)와 같은 shape. */
export interface OwnerWallLike {
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: { width: number; height: number; depth: number };
}

/** RoomPlan 캡처 도면 → WallSegments. 벽이 이미 세그먼트라 좌표만 옮긴다. */
export function fromCaptureFloorPlan(plan: RoomPlanCaptureFloorPlan): WallSegments {
  return {
    segments: plan.walls.map((wall) => ({ start: wall.start, end: wall.end })),
    openings: plan.openings.map((opening) => ({ kind: opening.kind, center: opening.center }))
  };
}

/**
 * 소유자 도면 벽(WheretoputWall3D 호환) → WallSegments.
 * 벽 중심선을 position + rotation[1](yaw) + dimensions.width로 유도한다 — 로컬 X축(폭) 위,
 * localZ=0인 두 끝점. 포팅 출처: apps/web/src/app/splat-tour/splat-plan-shape.ts
 * (wallFootprintCorners/wallLocalToWorldXZ) — 그 파일의 로컬→월드 변환식을 그대로 복제.
 */
export function fromOwnerFloorPlan(
  walls: readonly OwnerWallLike[],
  openings?: readonly WallSegmentOpening[]
): WallSegments {
  return {
    segments: walls.map(wallCenterlineSegment),
    openings: openings ? [...openings] : undefined
  };
}

function wallLocalToWorldXZ(localX: number, localZ: number, wall: OwnerWallLike): Pt {
  const ry = wall.rotation[1];
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return [wall.position[0] + localX * cos + localZ * sin, wall.position[2] - localX * sin + localZ * cos];
}

function wallCenterlineSegment(wall: OwnerWallLike): WallSegment {
  const halfWidth = wall.dimensions.width / 2;
  return {
    start: wallLocalToWorldXZ(-halfWidth, 0, wall),
    end: wallLocalToWorldXZ(halfWidth, 0, wall)
  };
}

// ── 출력 계약 ──────────────────────────────────────────────────────────

export type MatchConfidence = "auto" | "ambiguous" | "failed";

export interface ScoredTransform {
  transform: SplatTransform;
  /** 합성 점수 — 낮을수록 더 좋은 정합(chamfer distance 지배, IoU·개구부 보너스로 차감). */
  score: number;
}

export interface MatchResult {
  best: ScoredTransform;
  /** best를 제외한 나머지 후보, score 오름차순(더 나은 것 먼저). */
  alternatives: ScoredTransform[];
  confidence: MatchConfidence;
}

export interface MatchOptions {
  /** 벽 세그먼트를 점군으로 샘플링하는 간격(미터). 기본 5cm. */
  sampleSpacingMeters?: number;
  /** 후보 yaw 하나당 ICP 반복 상한. 기본 15. */
  maxIcpIterations?: number;
  /** ICP correspondence 아웃라이어 컷오프(미터). 생략 시 소유자 도면 bbox 대각선의 30%(최소 0.5m). */
  outlierDistanceMeters?: number;
  /** 개구부(문/창) 매칭 인정 거리(미터). 기본 0.4m. */
  openingMatchDistanceMeters?: number;
}

// ── 내부 튜닝 상수 ─────────────────────────────────────────────────────

const DEFAULT_SAMPLE_SPACING_METERS = 0.05;
const DEFAULT_MAX_ICP_ITERATIONS = 15;
const DEFAULT_OPENING_MATCH_DISTANCE_METERS = 0.4;
const MIN_OUTLIER_DISTANCE_METERS = 0.5;
const MIN_ICP_CORRESPONDENCES = 3;

const IOU_SCORE_WEIGHT = 0.6;
const OPENING_BONUS_WEIGHT = 0.25;

const AUTO_CHAMFER_METERS = 0.08;
const AUTO_IOU = 0.85;
const FAILED_CHAMFER_METERS = 0.5;
const FAILED_IOU = 0.35;
const AMBIGUOUS_SCORE_MARGIN = 0.06;

const FIXED_ROTATION_X_DEGREES = 180;
const FIXED_SCALE_MULTIPLIER = 1;
const FIXED_OFFSET_Y = 0;

// ── 매처 본체 ──────────────────────────────────────────────────────────

/**
 * capture(캡처 도면)를 owner(소유자 도면)에 정합하는 SplatTransform을 찾는다.
 * 1) Manhattan yaw 후보(주축 정렬 + 0/90/180/270) → 2) 무게중심 정렬 초기화 →
 * 3) 2D ICP(점-점, 스케일 고정 1)로 yaw+평행이동 정련 → 4) chamfer+IoU(+개구부 보너스)로 채점.
 */
export function matchFloorPlans(capture: WallSegments, owner: WallSegments, options: MatchOptions = {}): MatchResult {
  const spacing = options.sampleSpacingMeters ?? DEFAULT_SAMPLE_SPACING_METERS;
  const maxIterations = options.maxIcpIterations ?? DEFAULT_MAX_ICP_ITERATIONS;
  const openingMatchDistance = options.openingMatchDistanceMeters ?? DEFAULT_OPENING_MATCH_DISTANCE_METERS;

  const sourcePoints = sampleWallSegments(capture.segments, spacing);
  const targetPoints = sampleWallSegments(owner.segments, spacing);

  if (sourcePoints.length === 0 || targetPoints.length === 0) {
    throw new RangeError("Cannot match floor plans with no wall segments.");
  }

  const outlierThreshold =
    options.outlierDistanceMeters ?? Math.max(MIN_OUTLIER_DISTANCE_METERS, boundingDiagonal(targetPoints) * 0.3);

  const sourceHull = convexHull(sourcePoints);
  const targetHull = convexHull(targetPoints);

  const sourceAngle = dominantWallAngle(capture.segments);
  const targetAngle = dominantWallAngle(owner.segments);
  const yawGuesses = candidateYaws(sourceAngle, targetAngle);

  const candidates = yawGuesses.map((yawGuess) => {
    const init = initTransformForYaw(sourcePoints, targetPoints, yawGuess);
    const solved = runIcp(sourcePoints, targetPoints, init, maxIterations, outlierThreshold);

    const transformedSource = sourcePoints.map((p) => applyTransform(solved, p));
    const chamfer = chamferDistance(transformedSource, targetPoints);

    const transformedHull = convexHull(sourceHull.map((p) => applyTransform(solved, p)));
    const iouValue = iou(transformedHull, targetHull);

    const openingBonus = matchedOpeningFraction(capture.openings, owner.openings, solved, openingMatchDistance);

    const score = round6(chamfer - IOU_SCORE_WEIGHT * iouValue - OPENING_BONUS_WEIGHT * openingBonus);

    return { transform: toSplatTransform(solved), score, chamfer, iou: iouValue };
  });

  candidates.sort((a, b) => a.score - b.score);

  const confidence = classifyConfidence(candidates);
  const [best, ...rest] = candidates;

  return {
    best: { transform: best.transform, score: best.score },
    alternatives: rest.map((c) => ({ transform: c.transform, score: c.score })),
    confidence
  };
}

function classifyConfidence(
  ranked: { score: number; chamfer: number; iou: number }[]
): MatchConfidence {
  const best = ranked[0];
  if (!best) return "failed";

  const bestIsPoor = best.chamfer > FAILED_CHAMFER_METERS || best.iou < FAILED_IOU;
  if (bestIsPoor) return "failed";

  const runnerUp = ranked[1];
  const bestIsGood = best.chamfer <= AUTO_CHAMFER_METERS && best.iou >= AUTO_IOU;

  if (bestIsGood) {
    const closeRunnerUp = runnerUp !== undefined && runnerUp.score - best.score < AMBIGUOUS_SCORE_MARGIN;
    return closeRunnerUp ? "ambiguous" : "auto";
  }

  return "ambiguous";
}

// ── 회전/이동 표현 (내부) ──────────────────────────────────────────────
// R(θ)(x,y) = (cosθ·x − sinθ·y, sinθ·x + cosθ·y); transform = R(θ)·p + (tx, tz).
// similarity-solve.ts의 rotate()·projectSplatToPlan()과 동일한 규약.

interface RigidTransform {
  yawRadians: number;
  tx: number;
  tz: number;
}

function rotatePoint([x, z]: Pt, yawRadians: number): Pt {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return [cos * x - sin * z, sin * x + cos * z];
}

function applyTransform(t: RigidTransform, p: Pt): Pt {
  const [rx, rz] = rotatePoint(p, t.yawRadians);
  return [rx + t.tx, rz + t.tz];
}

function toSplatTransform(t: RigidTransform): SplatTransform {
  return {
    rotationXDegrees: FIXED_ROTATION_X_DEGREES,
    rotationYDegrees: cleanNegativeZero(round6(normalizeDegrees(radiansToDegrees(t.yawRadians)))),
    scaleMultiplier: FIXED_SCALE_MULTIPLIER,
    offsetX: cleanNegativeZero(round6(t.tx)),
    offsetY: FIXED_OFFSET_Y,
    offsetZ: cleanNegativeZero(round6(t.tz))
  };
}

// ── Manhattan yaw 후보 ─────────────────────────────────────────────────

function angleModPi(radians: number): number {
  let a = radians % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function circularDeltaModPi(a: number, b: number): number {
  let d = (a - b) % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
}

/** 벽 각도 히스토그램(1° bin, 길이 가중)에서 최빈 방향을 찾고, 그 주변 각을 doubled-angle로 정련한다. */
function dominantWallAngle(segments: WallSegment[]): number | null {
  const entries = segments
    .map((seg) => ({
      angle: angleModPi(Math.atan2(seg.end[1] - seg.start[1], seg.end[0] - seg.start[0])),
      length: segmentLength(seg)
    }))
    .filter((e) => e.length > 1e-6);
  if (entries.length === 0) return null;

  const numBins = 180;
  const binWeights = new Array<number>(numBins).fill(0);
  for (const e of entries) {
    const bin = Math.min(numBins - 1, Math.floor((e.angle / Math.PI) * numBins));
    binWeights[bin] += e.length;
  }
  let peakBin = 0;
  for (let i = 1; i < numBins; i++) {
    if (binWeights[i] > binWeights[peakBin]) peakBin = i;
  }
  const peakAngle = ((peakBin + 0.5) / numBins) * Math.PI;
  const window = (3 / numBins) * Math.PI;

  let sx = 0;
  let sy = 0;
  let weight = 0;
  for (const e of entries) {
    if (Math.abs(circularDeltaModPi(e.angle, peakAngle)) <= window) {
      sx += e.length * Math.cos(2 * e.angle);
      sy += e.length * Math.sin(2 * e.angle);
      weight += e.length;
    }
  }
  if (weight === 0) return peakAngle;
  return angleModPi(Math.atan2(sy, sx) / 2);
}

/** 두 세트의 주축을 맞추는 회전 + {0,90,180,270}° — 정사각형에 가까운 방은 넷 다 유효 후보. */
function candidateYaws(sourceAngle: number | null, targetAngle: number | null): number[] {
  const base = sourceAngle !== null && targetAngle !== null ? targetAngle - sourceAngle : 0;
  return [0, 1, 2, 3].map((k) => normalizeRadians(base + k * (Math.PI / 2)));
}

function normalizeRadians(radians: number): number {
  let r = radians % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

function normalizeDegrees(degrees: number): number {
  let d = degrees % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

// ── ICP (점-점, 스케일 고정) ───────────────────────────────────────────

function initTransformForYaw(source: Pt[], target: Pt[], yawRadians: number): RigidTransform {
  const sourceCentroid = centroid(source);
  const targetCentroid = centroid(target);
  const rotatedSourceCentroid = rotatePoint(sourceCentroid, yawRadians);
  return {
    yawRadians,
    tx: targetCentroid[0] - rotatedSourceCentroid[0],
    tz: targetCentroid[1] - rotatedSourceCentroid[1]
  };
}

function runIcp(
  source: Pt[],
  target: Pt[],
  init: RigidTransform,
  maxIterations: number,
  outlierThreshold: number
): RigidTransform {
  let current = init;

  for (let iter = 0; iter < maxIterations; iter++) {
    const pairs: { s: Pt; t: Pt }[] = [];
    for (const p of source) {
      const transformed = applyTransform(current, p);
      const nearest = nearestPoint(transformed, target);
      if (nearest && nearest.distance <= outlierThreshold) {
        pairs.push({ s: p, t: nearest.point });
      }
    }

    if (pairs.length < MIN_ICP_CORRESPONDENCES) break;

    const next = solveProcrustes(pairs);
    const delta = Math.abs(next.yawRadians - current.yawRadians) + Math.hypot(next.tx - current.tx, next.tz - current.tz);
    current = next;
    if (delta < 1e-7) break;
  }

  return current;
}

/** 2D Procrustes(스케일=1 고정): 페어(s→t)에서 최적 회전각을 닫힌 형태로 푼다. */
function solveProcrustes(pairs: { s: Pt; t: Pt }[]): RigidTransform {
  const sourceCentroid = centroid(pairs.map((p) => p.s));
  const targetCentroid = centroid(pairs.map((p) => p.t));

  let a = 0;
  let b = 0;
  for (const { s, t } of pairs) {
    const sx = s[0] - sourceCentroid[0];
    const sz = s[1] - sourceCentroid[1];
    const tx = t[0] - targetCentroid[0];
    const tz = t[1] - targetCentroid[1];
    a += sx * tx + sz * tz;
    b += sx * tz - sz * tx;
  }

  const yawRadians = Math.atan2(b, a);
  const rotatedCentroid = rotatePoint(sourceCentroid, yawRadians);
  return {
    yawRadians,
    tx: targetCentroid[0] - rotatedCentroid[0],
    tz: targetCentroid[1] - rotatedCentroid[1]
  };
}

// ── 점군 유틸 ──────────────────────────────────────────────────────────

function sampleWallSegments(segments: WallSegment[], spacingMeters: number): Pt[] {
  return segments.flatMap((seg) => sampleSegment(seg, spacingMeters));
}

function sampleSegment(seg: WallSegment, spacingMeters: number): Pt[] {
  const length = segmentLength(seg);
  if (length < 1e-9) return [[...seg.start] as Pt];

  const steps = Math.max(1, Math.round(length / spacingMeters));
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([
      seg.start[0] + (seg.end[0] - seg.start[0]) * t,
      seg.start[1] + (seg.end[1] - seg.start[1]) * t
    ]);
  }
  return points;
}

function segmentLength(seg: WallSegment): number {
  return Math.hypot(seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]);
}

function centroid(points: Pt[]): Pt {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of points) {
    sx += x;
    sz += z;
  }
  return [sx / points.length, sz / points.length];
}

function nearestPoint(p: Pt, candidates: Pt[]): { point: Pt; distance: number } | null {
  let best: Pt | null = null;
  let bestDistSq = Infinity;
  for (const c of candidates) {
    const dx = c[0] - p[0];
    const dz = c[1] - p[1];
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = c;
    }
  }
  return best ? { point: best, distance: Math.sqrt(bestDistSq) } : null;
}

function chamferDistance(a: Pt[], b: Pt[]): number {
  const aToB = mean(a.map((p) => nearestPoint(p, b)?.distance ?? 0));
  const bToA = mean(b.map((p) => nearestPoint(p, a)?.distance ?? 0));
  return (aToB + bToA) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function boundingDiagonal(points: Pt[]): number {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  return Math.hypot(width, depth);
}

// ── 개구부 보너스 ──────────────────────────────────────────────────────

function matchedOpeningFraction(
  captureOpenings: WallSegmentOpening[] | undefined,
  ownerOpenings: WallSegmentOpening[] | undefined,
  transform: RigidTransform,
  matchDistanceMeters: number
): number {
  if (!captureOpenings?.length || !ownerOpenings?.length) return 0;

  let matched = 0;
  for (const opening of captureOpenings) {
    const transformedCenter = applyTransform(transform, opening.center);
    const sameKind = ownerOpenings.filter((o) => o.kind === opening.kind);
    const nearest = sameKind.reduce<{ distance: number } | null>((best, candidate) => {
      const d = Math.hypot(candidate.center[0] - transformedCenter[0], candidate.center[1] - transformedCenter[1]);
      return !best || d < best.distance ? { distance: d } : best;
    }, null);
    if (nearest && nearest.distance <= matchDistanceMeters) matched++;
  }

  const denom = Math.max(1, Math.min(captureOpenings.length, ownerOpenings.length));
  return matched / denom;
}

// ── 볼록 껍질 / IoU ────────────────────────────────────────────────────

function convexHull(points: Pt[]): Pt[] {
  const seen = new Map<string, Pt>();
  for (const p of points) seen.set(`${p[0].toFixed(9)},${p[1].toFixed(9)}`, p);
  const pts = [...seen.values()].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (pts.length < 3) return pts;

  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function polygonArea(poly: Pt[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function isInsideEdge(p: Pt, a: Pt, b: Pt): boolean {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
}

function edgeIntersection(p1: Pt, p2: Pt, a: Pt, b: Pt): Pt {
  const a1 = b[1] - a[1];
  const b1 = a[0] - b[0];
  const c1 = a1 * a[0] + b1 * a[1];
  const a2 = p2[1] - p1[1];
  const b2 = p1[0] - p2[0];
  const c2 = a2 * p1[0] + b2 * p1[1];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return p2;
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

/** Sutherland-Hodgman: subject를 convex clip 폴리곤으로 자른다. 둘 다 convex 전제(convexHull 출력). */
function clipPolygon(subject: Pt[], clip: Pt[]): Pt[] {
  if (subject.length < 3 || clip.length < 3) return [];

  let output = subject;
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const currentInside = isInsideEdge(current, a, b);
      const prevInside = isInsideEdge(prev, a, b);
      if (currentInside) {
        if (!prevInside) output.push(edgeIntersection(prev, current, a, b));
        output.push(current);
      } else if (prevInside) {
        output.push(edgeIntersection(prev, current, a, b));
      }
    }
  }
  return output;
}

function iou(a: Pt[], b: Pt[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const areaA = polygonArea(a);
  const areaB = polygonArea(b);
  if (areaA <= 0 || areaB <= 0) return 0;

  const intersectionArea = polygonArea(clipPolygon(a, b));
  const unionArea = areaA + areaB - intersectionArea;
  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

// ── 잡다한 수치 유틸 ───────────────────────────────────────────────────

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function cleanNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
