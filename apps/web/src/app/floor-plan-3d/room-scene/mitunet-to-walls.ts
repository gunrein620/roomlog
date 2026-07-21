// mitunet 도면(픽셀 폴리곤) → WheretoputWall3D(박스 벽) 변환기.
//
// 배경: 매물 등록에서 도면 "이미지"를 올리면 mitunet만 채워지고 walls3D는 빈 배열로 남는다
// (apps/api/src/trade/trade.service.ts normalizeFloorPlan 참조 — 도면 에디터로 그린 벽만 walls3D를
// 채운다). 그런데 정합 계열 코드(splat-plan-shape.ts 등)는 walls3D만 읽으므로, 실제로 도면이
// 있는데도 "정합할 도면이 없어 이 단계를 건너뜁니다"로 보인다 — 이 변환기가 그 간극을 메운다.
//
// 좌표 규약은 mitunet-geometry.ts의 createMitunetSceneLayout과 반드시 일치해야 한다(같은 매물이
// 도면 에디터 3D 뷰와 투어에서 서로 다른 위치에 그려지면 안 되므로):
//   metresPerPixel = millimetersPerPixel / 1000 (없거나 <=0이면 8 / polygonLongSide 폴백)
//   원점 = wall+door+window 모든 outer 점의 픽셀 bbox 중심
//   점 변환: [x, y] → [(x - centerPixelX) * metresPerPixel, (y - centerPixelY) * metresPerPixel]
//     (픽셀 y가 그대로 월드 z로 간다 — 부호 반전 없음)
//
// mitunet 벽 폴리곤의 outer는 벽 중심선이 아니라 벽 발자국 외곽선(두께가 있는 얇은 띠)이므로,
// 폴리곤마다 최소면적 방향성 바운딩박스(OBB)를 구해 박스 벽으로 근사한다.
//
// yaw 부호 규약은 splat-plan-shape.ts의 wallLocalToWorldXZ(z = position[2] − localX·sin(ry) +
// localZ·cos(ry), z에 음의 sin)를 뒤집어 구한다 — 벽 긴 축 방향벡터 (dx,dz)에 대해
// cos(ry) = dx, sin(ry) = −dz → ry = atan2(−dz, dx). 같은 규약을 splat-plan-shape.ts의
// metricWallToPlanWall(RoomPlan 캡처 세그먼트 변환)도 쓴다 — 왕복 테스트(mitunet-to-walls.spec.ts)로
// planWallFootprint에 되돌려 검증했다.
//
// apps/api/src/splat-asset/mitunet-floor-plan-walls.ts가 서버측(auto-register-preview)에서 같은
// 알고리즘을 포팅한다(api는 web 모듈을 import하지 않는 원칙) — 두 구현은 같은 입력에 같은 결과를
// 내야 한다.

import { normalizeMitunetPayload, type MitunetPolygon } from "../../../lib/mitunet-floor-plan";
import type { WheretoputWall3D } from "../room-model/types";

// splat-plan-shape.ts DEFAULT_PLAN_HEIGHT_METERS와 동일값 — mitunet엔 높이 정보가 없어 기본 천장고로 채운다.
const DEFAULT_WALL_HEIGHT_METERS = 2.4;
// splat-plan-shape.ts CAPTURE_WALL_MIN_DEPTH_METERS와 동일 취지 — 폴리곤이 퇴화(공선점)해 OBB 두께가
// 0에 가까워지면 isValidPlanWall(depth>0)이 조용히 걸러내지 않도록 최소 두께를 합성한다.
const MIN_WALL_DEPTH_METERS = 0.05;
// mitunet-geometry.ts UNCALIBRATED_LONG_SIDE_METERS와 동일 — millimetersPerPixel 미보정 도면의 스케일 폴백.
const UNCALIBRATED_LONG_SIDE_METERS = 8;

type Pixel = [number, number];

/** mitunet 도면(미검증 JSON) → WheretoputWall3D[]. 파싱 실패하거나 벽 폴리곤이 없으면 빈 배열. */
export function mitunetToPlanWalls(plan: unknown): WheretoputWall3D[] {
  const normalized = normalizeMitunetPayload(plan);
  if (!normalized) return [];

  const outerPoints = [normalized.polygons.wall, normalized.polygons.door, normalized.polygons.window]
    .flatMap((polygons) => polygons)
    .flatMap((polygon) => polygon.outer)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (outerPoints.length === 0) return [];

  const pixelXs = outerPoints.map(([x]) => x);
  const pixelYs = outerPoints.map(([, y]) => y);
  const minPixelX = Math.min(...pixelXs);
  const maxPixelX = Math.max(...pixelXs);
  const minPixelY = Math.min(...pixelYs);
  const maxPixelY = Math.max(...pixelYs);
  const polygonLongSide = Math.max(maxPixelX - minPixelX, maxPixelY - minPixelY);
  if (!(polygonLongSide > 0)) return [];

  const millimetersPerPixel = normalized.millimetersPerPixel;
  const metresPerPixel =
    typeof millimetersPerPixel === "number" && Number.isFinite(millimetersPerPixel) && millimetersPerPixel > 0
      ? millimetersPerPixel / 1_000
      : UNCALIBRATED_LONG_SIDE_METERS / polygonLongSide;
  const origin = {
    centerPixelX: (minPixelX + maxPixelX) / 2,
    centerPixelY: (minPixelY + maxPixelY) / 2,
    metresPerPixel
  };

  return normalized.polygons.wall.reduce<WheretoputWall3D[]>((walls, polygon, index) => {
    const wall = wallPolygonToBox(polygon, index, origin);
    if (wall) walls.push(wall);
    return walls;
  }, []);
}

function wallPolygonToBox(
  polygon: MitunetPolygon,
  index: number,
  origin: { centerPixelX: number; centerPixelY: number; metresPerPixel: number }
): WheretoputWall3D | null {
  const obb = minAreaOBB(polygon.outer);
  if (!obb) return null;

  const isWidthLonger = obb.width >= obb.height;
  const longSidePixels = isWidthLonger ? obb.width : obb.height;
  const shortSidePixels = isWidthLonger ? obb.height : obb.width;
  // 긴 변 방향(픽셀 공간). metresPerPixel은 항상 양수라 스케일이 각도 부호에 영향을 주지 않는다.
  const longAxisAngle = isWidthLonger ? obb.angle : obb.angle + Math.PI / 2;
  const dirX = Math.cos(longAxisAngle);
  const dirY = Math.sin(longAxisAngle);

  const { centerPixelX, centerPixelY, metresPerPixel } = origin;
  const width = longSidePixels * metresPerPixel;
  const depth = Math.max(shortSidePixels * metresPerPixel, MIN_WALL_DEPTH_METERS);
  if (!(width > 0)) return null;

  return {
    id: `mitunet-wall-${index}`,
    wall_id: `mitunet-wall-${index}`,
    material: "wall",
    dimensions: { width, height: DEFAULT_WALL_HEIGHT_METERS, depth },
    position: [
      (obb.cx - centerPixelX) * metresPerPixel,
      DEFAULT_WALL_HEIGHT_METERS / 2,
      (obb.cy - centerPixelY) * metresPerPixel
    ],
    // ry = atan2(−dz, dx) — 파일 헤더 주석의 yaw 부호 규약 참조.
    rotation: [0, Math.atan2(-dirY, dirX), 0]
  };
}

// ── 최소면적 방향성 바운딩박스(OBB) ──────────────────────────────────────
// rotating calipers: convex hull의 각 변을 축 후보로 삼아 축정렬 bbox 면적을 비교해 최소인 것을 고른다.
// 벽 폴리곤은 점 개수가 적어(보통 4~6개) O(n²) 전수 비교로 충분하다.

type Obb = { cx: number; cy: number; angle: number; width: number; height: number };

function minAreaOBB(points: readonly Pixel[]): Obb | null {
  const hull = convexHull(points);
  if (hull.length === 0) return null;
  if (hull.length === 1) return { cx: hull[0][0], cy: hull[0][1], angle: 0, width: 0, height: 0 };
  if (hull.length === 2) {
    const [a, b] = hull;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return {
      cx: (a[0] + b[0]) / 2,
      cy: (a[1] + b[1]) / 2,
      angle: Math.atan2(dy, dx),
      width: Math.hypot(dx, dy),
      height: 0
    };
  }

  let best: (Obb & { area: number }) | null = null;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % hull.length];
    const edgeAngle = Math.atan2(by - ay, bx - ax);
    const cos = Math.cos(edgeAngle);
    const sin = Math.sin(edgeAngle);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of hull) {
      // edgeAngle만큼 반대 방향(-edgeAngle)으로 회전시켜 이 변을 축에 맞춘다.
      const rx = x * cos + y * sin;
      const ry = -x * sin + y * cos;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry);
      maxY = Math.max(maxY, ry);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    if (best && area >= best.area) continue;

    // 회전시킨 프레임의 박스 중심을 다시 +edgeAngle로 돌려 원래(픽셀) 프레임 좌표로 복원한다.
    const rotatedCenterX = (minX + maxX) / 2;
    const rotatedCenterY = (minY + maxY) / 2;
    best = {
      area,
      cx: rotatedCenterX * cos - rotatedCenterY * sin,
      cy: rotatedCenterX * sin + rotatedCenterY * cos,
      angle: edgeAngle,
      width,
      height
    };
  }

  return best;
}

/** Andrew's monotone chain — CCW convex hull, 중복점 제거. */
function convexHull(points: readonly Pixel[]): Pixel[] {
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const unique: Pixel[] = [];
  for (const point of sorted) {
    const prev = unique[unique.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) unique.push(point);
  }
  if (unique.length <= 2) return unique;

  const cross = (o: Pixel, a: Pixel, b: Pixel) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Pixel[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Pixel[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
