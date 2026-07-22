// mitunet 도면(픽셀 폴리곤) → WallSegments(매처 입력) 변환기 — 서버측 포팅.
//
// 배경: trade.service.ts의 normalizeFloorPlan은 도면 "이미지" 업로드 경로에서 mitunet만 채우고
// walls3D는 빈 배열로 남긴다. owner-floor-plan-walls.ts(parseOwnerWalls3D)는 walls3D만 읽으므로,
// 자동정합(previewAutoRegister)이 실제로 도면이 있는 매물에서도 "정합할 소유자 도면(벽)이 없습니다"로
// 막힌다 — 이 변환기가 그 폴백을 채운다(splat-asset.service.ts resolveOwnerFloorPlanWalls가 사용).
//
// 예전엔 폴리곤마다 최소면적 OBB를 씌워 박스 벽(OwnerWallLike)으로 근사했으나, 실데이터 9개 중 7개가
// 링 위상(폴리곤 하나 + holes, outer 42~97점)이었다 — 링에 OBB를 씌우면 방 전체를 덮는 상자 하나가
// 나와 틀렸다(2026-07-2x, kjw-capture-floor-plan-viewer에서 걷어냄). 매처(floor-plan-match.ts)가
// 실제로 요구하는 건 WallSegments{segments,openings}뿐이고 내부에서 세그먼트를 점으로 샘플링하므로,
// 폴리곤의 각 변을 그대로 세그먼트로 흘리면 충분하다 — outer(바깥 벽면)와 holes(안쪽 벽면) 둘 다
// 실제 벽면이니 둘 다 낸다.
//
// 좌표 변환 규약(미터 환산·원점)은 apps/web/.../floor-plan-3d/room-scene/mitunet-geometry.ts의
// createMitunetSceneLayout과 반드시 일치해야 한다(같은 매물이 도면 에디터 3D 뷰·투어·서버 자동정합에서
// 서로 다른 위치로 어긋나면 안 되므로) — api는 web 모듈을 import하지 않는 원칙(floor-plan-match.ts
// 헤더와 동일)이라 알고리즘을 여기 복제한다. 웹 파일의 규약:
//   metresPerPixel = millimetersPerPixel / 1000 (없거나 <=0이면 8 / polygonLongSide 폴백)
//   원점 = wall+door+window 모든 outer 점(holes 제외)의 픽셀 bbox 중심
//   점 변환: [x, y] → [(x - centerPixelX) * metresPerPixel, (y - centerPixelY) * metresPerPixel]
//     (픽셀 y가 그대로 월드 z로 간다 — 부호 반전 없음)
//
// mitunet 정규화 파서는 트레이드 도메인의 normalizeMitunetFloorPlan을 그대로 재사용한다.

import { normalizeMitunetFloorPlan, type MitunetPolygon, type MitunetRing } from "../trade/mitunet-floor-plan";
import type { WallSegment, WallSegmentOpening, WallSegments } from "../roomlog/services/floor-plan-match";

// mitunet-geometry.ts(web) UNCALIBRATED_LONG_SIDE_METERS와 동일 — millimetersPerPixel 미보정 도면 폴백.
const UNCALIBRATED_LONG_SIDE_METERS = 8;

type Pixel = [number, number];
type ToMetres = (point: Pixel) => [number, number];

/** mitunet 도면(미검증 JSON) → WallSegments. 파싱 실패하거나 벽 폴리곤이 없으면 빈 세그먼트. */
export function mitunetToWallSegments(plan: unknown): WallSegments {
  const normalized = normalizeMitunetFloorPlan(plan);
  if (!normalized) return { segments: [] };

  const outerPoints = [normalized.polygons.wall, normalized.polygons.door, normalized.polygons.window]
    .flatMap((polygons) => polygons)
    .flatMap((polygon) => polygon.outer)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (outerPoints.length === 0) return { segments: [] };

  const pixelXs = outerPoints.map(([x]) => x);
  const pixelYs = outerPoints.map(([, y]) => y);
  const minPixelX = Math.min(...pixelXs);
  const maxPixelX = Math.max(...pixelXs);
  const minPixelY = Math.min(...pixelYs);
  const maxPixelY = Math.max(...pixelYs);
  const polygonLongSide = Math.max(maxPixelX - minPixelX, maxPixelY - minPixelY);
  if (!(polygonLongSide > 0)) return { segments: [] };

  const millimetersPerPixel = normalized.millimetersPerPixel;
  const metresPerPixel =
    typeof millimetersPerPixel === "number" && Number.isFinite(millimetersPerPixel) && millimetersPerPixel > 0
      ? millimetersPerPixel / 1_000
      : UNCALIBRATED_LONG_SIDE_METERS / polygonLongSide;
  const centerPixelX = (minPixelX + maxPixelX) / 2;
  const centerPixelY = (minPixelY + maxPixelY) / 2;
  const toMetres: ToMetres = ([x, y]) => [(x - centerPixelX) * metresPerPixel, (y - centerPixelY) * metresPerPixel];

  const segments = normalized.polygons.wall.flatMap((polygon) => wallPolygonSegments(polygon, toMetres));
  const openings = [
    ...normalized.polygons.door.map((polygon) => polygonOpening("door", polygon, toMetres)),
    ...normalized.polygons.window.map((polygon) => polygonOpening("window", polygon, toMetres))
  ].filter((opening): opening is WallSegmentOpening => opening !== null);

  return { segments, openings };
}

/** 벽 폴리곤 하나(outer + holes) → 세그먼트. outer·holes 각 링을 독립적으로 폐다각형 변으로 편다. */
function wallPolygonSegments(polygon: MitunetPolygon, toMetres: ToMetres): WallSegment[] {
  return [polygon.outer, ...polygon.holes].flatMap((ring) => ringSegments(ring, toMetres));
}

/** 링(점 목록) → 인접 점을 잇는 세그먼트, 마지막 점은 첫 점과 닫는다. */
function ringSegments(ring: MitunetRing, toMetres: ToMetres): WallSegment[] {
  if (ring.length < 2) return [];
  const points = ring.map(toMetres);
  return points.map((start, index) => ({ start, end: points[(index + 1) % points.length] }));
}

/** 문/창 폴리곤 outer의 정점 평균(중심) → 매처의 개구부 disambiguation 보너스 입력. */
function polygonOpening(kind: "door" | "window", polygon: MitunetPolygon, toMetres: ToMetres): WallSegmentOpening | null {
  if (polygon.outer.length === 0) return null;
  const points = polygon.outer.map(toMetres);
  const center: [number, number] = [
    points.reduce((sum, [x]) => sum + x, 0) / points.length,
    points.reduce((sum, [, y]) => sum + y, 0) / points.length
  ];
  return { kind, center };
}
