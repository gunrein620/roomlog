"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { Armchair, DoorOpen, Eraser, EyeOff, Hand, MousePointer2, Pencil, Scissors, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiDimensionDetection,
  CandidateStatus,
  DimensionKind,
  ExtractionMeta,
  FloorPlanCandidate,
  ScaleCandidate,
  UploadedFloorPlanSource
} from "./plan-extraction/types";
import { updateCandidateStatus } from "./plan-extraction/wall-detection.mjs";
import {
  filterRatioSamplesNearExpected,
  inferMissingWallsFromStructuralBoundaries,
  mergeCoordinates,
  snapWallsToStructuralBoundaries,
  solveDimensionRowChains,
  structuralBoundaryOffsetsMm
} from "./plan-extraction/dimension-layout.mjs";
import type {
  RoboflowDetectionBox,
  RoboflowDetectionOverlayBox,
  RoboflowFloorPlanDetections
} from "./plan-extraction/roboflow-post-processing";
import {
  alignConnectedPerpendicularWallBoxCorners,
  alignWallBoxesToFittedOpeningLines,
  buildAdjustedWallBoxesFromRawAndGenerated,
  convertRoboflowBoxToEditorBox,
  fitOpeningBoxesToPostProcessedWalls,
  normalizeOverlayBox,
  ROBOFLOW_OPENING_CONFIDENCE_THRESHOLD,
  ROBOFLOW_SITE_CONFIDENCE_THRESHOLD,
  snapOpeningBoxEdgesToNearbyWallBreaks,
  trimWallBoxCornerOverlaps
} from "./plan-extraction/roboflow-post-processing";
import { loadImage } from "./plan-extraction/wall-detector";
import {
  catalogItemFootprint,
  catalogKind,
  createFurnitureModel,
  describeFurnitureFit,
  judgeFurnitureFit,
  finalizeFurnitureDraft,
  FURNITURE_CATALOG,
  furnitureImageUrl,
  isFurnitureCatalogItem,
  isLandlordOptionFurniture,
  loadGlbDatasetCatalog,
  moveFurnitureDraftToPoint,
  normalizeCatalogItem,
  reopenFurnitureDraft,
  rotateFurnitureQuarterTurn
} from "./furniture-placement";
import {
  buildFloorPlanDraftPayload,
  buildFloorPlanLocalSnapshot,
  buildRoom3DSnapshot
} from "./room-model/room-payload";
import type {
  FurnitureCatalogItem,
  PlacedFurniture,
  Point,
  Wall,
  WallSummary,
  WheretoputWall3D
} from "./room-model/types";
import {
  calculateDistance,
  DEFAULT_PIXEL_TO_MM_RATIO,
  getStarterWalls,
  GRID_SIZE_PX,
  projectPointOntoWall,
  snapCanvasPoint,
  splitWallByEraseArea,
  splitWallByRatio
} from "./room-model/wall-editing";
import {
  buildWallsFromDetectionBoxes,
  convertWallsToWheretoputRoom3D,
  convertWallsToWheretoputSimulator,
  distanceToWall,
  moveWall,
  snapToOrthogonal,
  summarizeWalls
} from "./room-model/wall-model.mjs";
import { RoomlogThreeFloorPlanView } from "./room-scene/RoomlogThreeFloorPlanView";

type EditorTool = "wall" | "select" | "eraser" | "partial_eraser" | "hide" | "opening" | "fixture" | "furniture" | "interior" | "none";
type ViewMode = "2d" | "3d";
type WallDragMode = "move" | "resize-start" | "resize-end";
type WallDragOperation = { mode: WallDragMode; originPoint: Point; originalWall: Wall; wallId: Wall["id"] };
type AiGeneratedWall = Wall & { markers?: string[]; source?: string };
type NormalizedTextBoundingBox = { height: number; width: number; x: number; y: number };
type NormalizedTargetLine = { x1: number; x2: number; y1: number; y2: number };
type DimensionAxis = "horizontal" | "vertical" | null;
type DimensionSide = "start" | "end" | null;
type PrintedDimensionChip = {
  axis: DimensionAxis;
  side: DimensionSide;
  boundingBox?: NormalizedTextBoundingBox | null;
  confidence?: number;
  id: string;
  kind: DimensionKind;
  realLengthMm: number;
  targetLine?: NormalizedTargetLine | null;
  text: string;
  useForFurnitureFit: boolean;
  useForScale: boolean;
  useForWallGeneration: boolean;
};

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1200;
const FLOOR_PLAN_LISTING_RETURN_PATH = "/sell?flow=listing#my-page";

// 후보 타입 코드 → 사용자용 한글 라벨. 모르는 타입은 원문 그대로 노출한다.
const CANDIDATE_TYPE_LABELS: Record<string, string> = {
  DOOR: "문",
  SLIDING_DOOR: "미닫이문",
  WINDOW: "창문"
};

function candidateTypeLabel(type: string) {
  return CANDIDATE_TYPE_LABELS[type.toUpperCase()] ?? type;
}
const MAX_VISIBLE_PRINTED_DIMENSIONS = 24;
const WALL_EDIT_HANDLE_RADIUS = 16;
const AI_IMAGE_MAX_DIMENSION = 1600;
const FURNITURE_CATEGORY_ORDER = [
  "소파·의자",
  "침실",
  "테이블·책상",
  "수납",
  "주방·다이닝",
  "욕실·세탁",
  "조명",
  "데코",
  "야외",
  "가전·전자"
] as const;
type FurnitureKindFilter = string;

function furnitureCategoryLabel(item: FurnitureCatalogItem) {
  return item.category?.trim() || catalogKind(item);
}

function distributeFurnitureCategories(items: FurnitureCatalogItem[]) {
  const buckets = new Map<string, FurnitureCatalogItem[]>();
  for (const item of items) {
    const category = furnitureCategoryLabel(item);
    const bucket = buckets.get(category) ?? [];
    bucket.push(item);
    buckets.set(category, bucket);
  }

  const categoryOrder = [
    ...FURNITURE_CATEGORY_ORDER.filter((category) => buckets.has(category)),
    ...[...buckets.keys()].filter((category) => !FURNITURE_CATEGORY_ORDER.includes(category as (typeof FURNITURE_CATEGORY_ORDER)[number])).sort((left, right) => left.localeCompare(right, "ko"))
  ];
  const distributed: FurnitureCatalogItem[] = [];

  for (let index = 0; distributed.length < items.length; index += 1) {
    for (const category of categoryOrder) {
      const item = buckets.get(category)?.[index];
      if (item) distributed.push(item);
    }
  }

  return distributed;
}

type RoboflowBoundingBox = { x: number; y: number; width: number; height: number; confidence?: number };

// 창문 박스를 붙어있는 벽 라인(같은 방향·가까운 축)에 맞춰 정렬한다.
// 길이 구간은 유지하되 축(중심)·두께는 매칭된 벽에 스냅 → 벽과 자연스럽게 이어짐. 매칭 벽 없으면 null.
function alignWindowBoxToWallLine(windowBox: RoboflowBoundingBox, wallBoxes: RoboflowBoundingBox[]): RoboflowBoundingBox | null {
  const windowHorizontal = windowBox.width >= windowBox.height;
  const windowAxis = windowHorizontal ? windowBox.y + windowBox.height / 2 : windowBox.x + windowBox.width / 2;
  const windowHalf = (windowHorizontal ? windowBox.height : windowBox.width) / 2;
  const windowStart = windowHorizontal ? windowBox.x : windowBox.y;
  const windowEnd = windowHorizontal ? windowBox.x + windowBox.width : windowBox.y + windowBox.height;

  let best: { axis: number; thickness: number; axisDist: number } | null = null;
  for (const wall of wallBoxes) {
    const wallHorizontal = wall.width >= wall.height;
    if (wallHorizontal !== windowHorizontal) continue;
    const wallAxis = wallHorizontal ? wall.y + wall.height / 2 : wall.x + wall.width / 2;
    const wallThickness = wallHorizontal ? wall.height : wall.width;
    const wallStart = wallHorizontal ? wall.x : wall.y;
    const wallEnd = wallHorizontal ? wall.x + wall.width : wall.y + wall.height;
    const longOverlap = Math.min(windowEnd, wallEnd) - Math.max(windowStart, wallStart);
    if (longOverlap < -30) continue; // 벽 라인 방향으로 너무 떨어짐
    const axisDist = Math.abs(wallAxis - windowAxis);
    if (axisDist > windowHalf + wallThickness / 2 + 20) continue; // 같은 라인이 아님
    if (!best || axisDist < best.axisDist) best = { axis: wallAxis, thickness: wallThickness, axisDist };
  }
  if (!best) return null;

  return windowHorizontal
    ? { x: windowStart, y: best.axis - best.thickness / 2, width: windowEnd - windowStart, height: best.thickness, confidence: windowBox.confidence }
    : { x: best.axis - best.thickness / 2, y: windowStart, width: best.thickness, height: windowEnd - windowStart, confidence: windowBox.confidence };
}

type EditorRect = { x1: number; x2: number; y1: number; y2: number };

// 벽 박스를 겹치는 opening(문) 자리에서 잘라, 뚫린 구간을 뺀 벽 조각들을 돌려준다.
function splitEditorBoxAtOpenings(box: EditorRect, openings: EditorRect[], horizontal: boolean): EditorRect[] {
  const axisStart = horizontal ? box.x1 : box.y1;
  const axisEnd = horizontal ? box.x2 : box.y2;
  const blocked = openings
    .map((opening): [number, number] =>
      horizontal
        ? [Math.max(axisStart, opening.x1), Math.min(axisEnd, opening.x2)]
        : [Math.max(axisStart, opening.y1), Math.min(axisEnd, opening.y2)]
    )
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of blocked) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const pieces: Array<[number, number]> = [];
  let cursor = axisStart;
  for (const [start, end] of merged) {
    if (start > cursor) pieces.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < axisEnd) pieces.push([cursor, axisEnd]);

  return pieces.map(([start, end]) =>
    horizontal ? { x1: start, x2: end, y1: box.y1, y2: box.y2 } : { x1: box.x1, x2: box.x2, y1: start, y2: end }
  );
}


function apiUrl(path: string) {
  const configured = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  // 프로덕션의 NEXT_PUBLIC_API_URL(/api)은 Next BFF용 상대경로라 브라우저에서 Nest에 직접 닿지 않는다.
  // 도면 에디터는 Nest를 직접 호출하므로, 상대경로면 API 오리진(웹소켓과 같은 호스트)으로 승격한다.
  const base = /^https?:\/\//.test(configured)
    ? configured
    : process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
  const normalized = base.replace(/\/$/, "");

  return normalized.endsWith("/api") ? `${normalized}${path}` : `${normalized}/api${path}`;
}

async function getFloorPlanAccessToken() {
  const cachedToken = window.localStorage.getItem("floorPlanAccessToken");
  if (cachedToken) return cachedToken;

  const response = await fetch(apiUrl("/auth/login"), {
    body: JSON.stringify({ email: "manager@roomlog.test", password: "password123!" }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) throw new Error("Floor plan login failed");

  const payload = (await response.json()) as { accessToken?: string };
  if (!payload.accessToken) throw new Error("Floor plan token missing");
  window.localStorage.setItem("floorPlanAccessToken", payload.accessToken);

  return payload.accessToken;
}

/** Bearer 부착 fetch — localStorage에 캐시된 토큰이 무효(401)면 재발급해 한 번 더 시도한다. */
async function floorPlanAuthorizedFetch(url: string, init: RequestInit = {}) {
  const request = async () => {
    const token = await getFloorPlanAccessToken();

    return fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` }
    });
  };

  let response = await request();
  if (response.status === 401) {
    window.localStorage.removeItem("floorPlanAccessToken");
    response = await request();
  }

  return response;
}

// 매물 등록 폼(홈)이 읽어 가는 3D 도면 스냅샷 키 — 에디터↔매물 등록의 유일한 핸드오프 지점.
// 에디터는 별도 라우트라 아직 생성 안 된 매물 id를 모르므로, 저장/3D변환 시 여기에 남겨 둔다.
export const LISTING_FLOOR_PLAN_STORAGE_KEY = "roomlogListingFloorPlan3D";

/** walls3D + 임대인 옵션 가구를 렌더에 필요한 필드만 추려 매물 연결용 스냅샷으로 만든다. */
function persistListingFloorPlanSnapshot(
  walls3D: WheretoputWall3D[],
  landlordFurnitures: PlacedFurniture[],
  name?: string
) {
  if (typeof window === "undefined") return;
  if (!walls3D.length) return;

  const snapshot = {
    name,
    savedAt: Date.now(),
    walls3D: walls3D.map((wall) => ({
      id: String(wall.id),
      wall_id: wall.wall_id,
      dimensions: wall.dimensions,
      position: wall.position,
      rotation: wall.rotation
    })),
    furnitures: landlordFurnitures.map((furniture) => ({
      id: furniture.id,
      furniture_id: furniture.furniture_id,
      name: furniture.name,
      color: furniture.color,
      length: furniture.length,
      modelUrl: furniture.modelUrl,
      position: furniture.position,
      rotation: furniture.rotation,
      scale: furniture.scale,
      sizeMm: furniture.sizeMm
    }))
  };

  try {
    window.localStorage.setItem(LISTING_FLOOR_PLAN_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // 용량 초과 등 저장 실패는 무시 — 3D 연결이 안 될 뿐 등록 흐름은 계속된다.
  }
}

async function uploadFloorPlanSource(file: File): Promise<UploadedFloorPlanSource | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", "FLOOR_PLAN_SOURCE");
    const response = await floorPlanAuthorizedFetch(apiUrl("/attachments"), {
      body: formData,
      method: "POST"
    });
    if (!response.ok) throw new Error("Floor plan source upload failed");
    const payload = (await response.json()) as { id?: string; fileUrl?: string };

    return { attachmentId: payload.id, imageUrl: payload.fileUrl };
  } catch {
    return null;
  }
}

async function fileToCompressedDataUrl(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, AI_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    if (!context) throw new Error("Canvas context is not available");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function convertDimensionToMm(valueText: string, unit: string) {
  const value = Number(valueText.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;

  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit === "mm" || normalizedUnit === "밀리미터") return Math.round(value);
  if (normalizedUnit === "cm" || normalizedUnit === "센티미터") return Math.round(value * 10);

  return Math.round(value * 1000);
}

function parseDimensionTextsToMm(text: string) {
  const trimmedText = text.trim();
  // 면적(9.3㎡)과 가구 크기(1500 × 2000mm)는 길이 치수가 아니다.
  if (/㎡|m²|m2\b|평/i.test(trimmedText) || /\d\s*[×x*]\s*\d/i.test(trimmedText)) return [];
  const values: number[] = [];

  for (const match of trimmedText.matchAll(/(\d+(?:[.,]\d+)?)\s*(mm|밀리미터|cm|센티미터|m|미터)/gi)) {
    const realLengthMm = convertDimensionToMm(match[1], match[2]);
    if (realLengthMm && realLengthMm >= 1000) values.push(realLengthMm);
  }

  if (values.length) return values;

  for (const match of trimmedText.matchAll(/\b(\d{3,5})\b/g)) {
    const realLengthMm = Number(match[1]);
    if (realLengthMm >= 1000 && realLengthMm <= 30000) values.push(realLengthMm);
  }

  return values;
}

function normalizeAiTextBoundingBox(box: unknown): NormalizedTextBoundingBox | null {
  if (!box || typeof box !== "object") return null;
  const record = box as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
    return {
      height: Math.min(1000, Math.max(1, height)),
      width: Math.min(1000, Math.max(1, width)),
      x: Math.min(1000, Math.max(0, x)),
      y: Math.min(1000, Math.max(0, y))
    };
  }

  const x1 = Number(record.x1);
  const y1 = Number(record.y1);
  const x2 = Number(record.x2);
  const y2 = Number(record.y2);
  if ([x1, y1, x2, y2].every(Number.isFinite) && x2 > x1 && y2 > y1) {
    return {
      height: Math.min(1000, Math.max(1, y2 - y1)),
      width: Math.min(1000, Math.max(1, x2 - x1)),
      x: Math.min(1000, Math.max(0, x1)),
      y: Math.min(1000, Math.max(0, y1))
    };
  }

  return null;
}

function normalizeAiTargetLine(line: unknown): NormalizedTargetLine | null {
  if (!line || typeof line !== "object") return null;
  const record = line as Record<string, unknown>;
  const x1 = Number(record.x1);
  const y1 = Number(record.y1);
  const x2 = Number(record.x2);
  const y2 = Number(record.y2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  if (Math.hypot(x2 - x1, y2 - y1) < 4) return null;

  return {
    x1: Math.min(1000, Math.max(0, x1)),
    x2: Math.min(1000, Math.max(0, x2)),
    y1: Math.min(1000, Math.max(0, y1)),
    y2: Math.min(1000, Math.max(0, y2))
  };
}

function hasReliableDimensionPlacement(dimension: PrintedDimensionChip) {
  return Boolean(dimension.boundingBox || dimension.targetLine);
}

function getPrintedDimensionLocationStatus(dimension: PrintedDimensionChip) {
  const locationStatus = hasReliableDimensionPlacement(dimension) ? "위치 확인" : "위치 미확인";

  return locationStatus;
}

function printedDimensionKey(detectionIndex: number, valueIndex: number, realLengthMm: number, boundingBox: NormalizedTextBoundingBox | null) {
  const boxKey = boundingBox
    ? `${Math.round(boundingBox.x)}:${Math.round(boundingBox.y)}:${Math.round(boundingBox.width)}:${Math.round(boundingBox.height)}`
    : "no-box";

  return `${detectionIndex}:${valueIndex}:${realLengthMm}:${boxKey}`;
}

// 구조 치수(전체외곽/외곽분할/방폭/벽사이)만 축척·3D 벽 생성에 쓴다.
function isStructuralDimensionKind(kind: DimensionKind) {
  return kind === "outer_total" || kind === "outer_segment" || kind === "room_span" || kind === "wall_span";
}

function normalizeDimensionKind(kind: unknown): DimensionKind {
  return kind === "outer_total" ||
    kind === "outer_segment" ||
    kind === "room_span" ||
    kind === "wall_span" ||
    kind === "opening" ||
    kind === "furniture" ||
    kind === "fixture" ||
    kind === "area" ||
    kind === "ignore"
    ? kind
    : "ignore";
}

// AI targetLine 픽셀 좌표는 여전히 못 믿으므로 텍스트에서 곱셈기호/면적 단위를 보고
// 하드 가드레일을 적용한다: ×는 무조건 가구, ㎡/평은 무조건 무시. AI kind와 다르면 가드레일이 이긴다.
function guardrailKind(kind: DimensionKind, text: string): DimensionKind {
  if (/㎡|m²|m2\b|평/i.test(text)) return "area";
  if (/\d\s*[×xX*]\s*\d/.test(text)) return kind === "fixture" ? "fixture" : "furniture";

  return kind;
}

// 가구/설비 치수는 '810 x 1400mm'처럼 폭×깊이라 가장 큰 변을 대표값으로 쓴다.
function parseFurnitureDimensionValueMm(text: string) {
  const values = [...text.matchAll(/(\d{2,5})(?:\s*(?:mm|밀리미터))?/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 30000);

  return values.length ? Math.max(...values) : null;
}

function computeBackgroundImageFrame(image: HTMLImageElement | null) {
  if (!image?.complete || !image.width || !image.height) return null;
  const imageAspect = image.width / image.height;
  const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  let drawWidth = CANVAS_WIDTH * 0.8;
  let drawHeight = drawWidth / imageAspect;
  if (imageAspect <= canvasAspect) {
    drawHeight = CANVAS_HEIGHT * 0.8;
    drawWidth = drawHeight * imageAspect;
  }

  return { height: drawHeight, width: drawWidth, x: -drawWidth / 2, y: -drawHeight / 2 };
}

function targetLineCanvasLength(line: NormalizedTargetLine, frame: { height: number; width: number }) {
  return Math.hypot(((line.x2 - line.x1) / 1000) * frame.width, ((line.y2 - line.y1) / 1000) * frame.height);
}

// AI가 준 픽셀 좌표(targetLine)는 못 믿지만, 라벨이 도면의 위/아래 여백에 있는지
// 좌/우 여백에 있는지 정도의 대략적 위치(boundingBox)는 신뢰할 수 있다.
// side는 치수 체인이 사는 여백을 뜻한다: 가로 치수는 위(start)/아래(end),
// 세로 치수는 왼쪽(start)/오른쪽(end).
function classifyDimensionPlacement(
  boundingBox: NormalizedTextBoundingBox | null,
  targetLine: NormalizedTargetLine | null
): { axis: DimensionAxis; side: DimensionSide } {
  if (boundingBox) {
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;
    const nearTopBottom = centerY <= 200 || centerY >= 800;
    const nearLeftRight = centerX <= 200 || centerX >= 800;
    if (nearTopBottom && !nearLeftRight) return { axis: "horizontal", side: centerY <= 200 ? "start" : "end" };
    if (nearLeftRight && !nearTopBottom) return { axis: "vertical", side: centerX <= 200 ? "start" : "end" };
  }
  if (targetLine) {
    return {
      axis: Math.abs(targetLine.x2 - targetLine.x1) >= Math.abs(targetLine.y2 - targetLine.y1) ? "horizontal" : "vertical",
      side: null
    };
  }

  return { axis: null, side: null };
}

// 축을 알면(=AI가 분류했으면) side는 라벨이 도면의 어느 절반에 있는지로 정한다.
// 20% 밴드보다 중첩된 안쪽 치수줄에 강하다: 위쪽 전체줄과 위쪽 구간줄이 모두 start로 잡힌다.
function dimensionSideFromAxis(axis: DimensionAxis, boundingBox: NormalizedTextBoundingBox | null): DimensionSide {
  if (!axis || !boundingBox) return null;
  if (axis === "horizontal") return boundingBox.y + boundingBox.height / 2 < 500 ? "start" : "end";

  return boundingBox.x + boundingBox.width / 2 < 500 ? "start" : "end";
}

function computeWallUnionBox(boxes: RoboflowDetectionOverlayBox[]) {
  const wallBoxes = boxes.filter((overlayBox) => overlayBox.type === "WALL").map((overlayBox) => normalizeOverlayBox(overlayBox.box));
  if (!wallBoxes.length) return null;

  return {
    x1: Math.min(...wallBoxes.map((box) => box.x1)),
    x2: Math.max(...wallBoxes.map((box) => box.x2)),
    y1: Math.min(...wallBoxes.map((box) => box.y1)),
    y2: Math.max(...wallBoxes.map((box) => box.y2))
  };
}

// 한국 도면의 최외곽 치수는 벽 외곽면 사이 거리다. 가장 큰 가로/세로 치수를
// Roboflow 벽 union 폭/높이에 대응시키면 AI 좌표 없이 축척이 나온다.
function estimateWallUnionScaleCandidate(
  chips: PrintedDimensionChip[],
  unionBox: { x1: number; x2: number; y1: number; y2: number } | null
): ScaleCandidate | null {
  if (!unionBox) return null;
  const unionWidth = unionBox.x2 - unionBox.x1;
  const unionHeight = unionBox.y2 - unionBox.y1;
  const maxHorizontalMm = Math.max(0, ...chips.filter((chip) => chip.axis === "horizontal").map((chip) => chip.realLengthMm));
  const maxVerticalMm = Math.max(0, ...chips.filter((chip) => chip.axis === "vertical").map((chip) => chip.realLengthMm));
  const widthRatio = unionWidth >= 50 && maxHorizontalMm > 0 ? maxHorizontalMm / unionWidth : null;
  const heightRatio = unionHeight >= 50 && maxVerticalMm > 0 ? maxVerticalMm / unionHeight : null;

  if (widthRatio && heightRatio) {
    // 두 축이 8% 이내로 일치해야 채택 — 어긋나면 치수 오독이나 축 오분류이므로 축척을 내지 않는다.
    if (Math.abs(widthRatio - heightRatio) / widthRatio > 0.08) return null;

    return {
      confidence: 0.92,
      pixelLength: Math.round(unionWidth),
      pixelToMmRatio: (widthRatio + heightRatio) / 2,
      realLengthMm: maxHorizontalMm,
      source: "printed-dimension+wall-union-both-axes"
    };
  }

  const singleRatio = widthRatio ?? heightRatio;
  if (!singleRatio) return null;

  return {
    confidence: 0.7,
    pixelLength: Math.round(widthRatio ? unionWidth : unionHeight),
    pixelToMmRatio: singleRatio,
    realLengthMm: widthRatio ? maxHorizontalMm : maxVerticalMm,
    source: "printed-dimension+wall-union-single-axis"
  };
}

type RatioSample = { canvasLength: number; ratio: number; realLengthMm: number };

// 서로 7% 이내로 일치하는 샘플이 가장 많은 비율을 채택 — 오독 하나가 축척을 지배하지 못하게 한다.
function pickConsensusRatio(samples: RatioSample[]) {
  if (!samples.length) return null;
  let bestSample = samples[0];
  let bestSupport: RatioSample[] = [];
  for (const sample of samples) {
    const support = samples.filter((other) => Math.abs(other.ratio - sample.ratio) / sample.ratio <= 0.07);
    if (support.length > bestSupport.length) {
      bestSample = sample;
      bestSupport = support;
    }
  }
  // 클러스터 대표값은 중앙값 대신 길이 가중 비율(Σmm ÷ Σpx).
  // 짧은 치수선은 끝점 1~2px 검출 오차가 비율을 몇 %씩 흔들지만, 긴 치수선(전체 치수)은
  // 같은 픽셀 오차가 비율에 거의 안 먹히므로 길이에 비례해 가중하면 축척이 참값에 수렴한다.
  const totalMm = bestSupport.reduce((sum, sample) => sum + sample.realLengthMm, 0);
  const totalPx = bestSupport.reduce((sum, sample) => sum + sample.canvasLength, 0);

  return { ratio: totalPx > 0 ? totalMm / totalPx : bestSample.ratio, sample: bestSample, support: bestSupport.length };
}

// 배경 프레임(≈1300px)에 3~30m 도면이 들어가는 현실 범위를 벗어난 비율은 오독으로 버린다.
function isPlausiblePixelToMmRatio(ratio: number) {
  return ratio >= 0.8 && ratio <= 60;
}

function estimatePrintedDimensionScaleCandidate(
  detections: Array<{ boundingBox?: unknown; confidence?: number; targetLine?: unknown; text: string }>,
  frame: { height: number; width: number } | null
): ScaleCandidate | null {
  if (!frame) return null;

  const samples = detections.flatMap((detection) => {
    const targetLine = normalizeAiTargetLine(detection.targetLine);
    if (!targetLine) return [];
    const canvasLength = targetLineCanvasLength(targetLine, frame);
    if (canvasLength < 8) return [];

    return parseDimensionTextsToMm(detection.text).flatMap((realLengthMm) => {
      const ratio = realLengthMm / canvasLength;
      if (!isPlausiblePixelToMmRatio(ratio)) return [];

      return [{ canvasLength, ratio, realLengthMm }];
    });
  });
  const consensus = pickConsensusRatio(samples);
  if (!consensus) return null;

  return {
    confidence: Math.min(0.95, 0.45 + consensus.support * 0.12),
    pixelLength: Math.round(consensus.sample.canvasLength),
    pixelToMmRatio: consensus.ratio,
    realLengthMm: consensus.sample.realLengthMm,
    source: `printed-dimension-x${consensus.support}`
  };
}

type DetectedDimensionLineSpan = { axis: Exclude<DimensionAxis, null>; cross: number; max: number; min: number };

// 라벨 근처에서 원본 도면에 인쇄된 치수선(가늘고 긴 선)을 픽셀 단위로 찾는다.
// 좌표는 이미지 정규화 0~1000. 벽처럼 두꺼운 채움은 두께 검사로 제외한다.
function findPrintedDimensionLineSpan(
  imageData: ImageData,
  axis: Exclude<DimensionAxis, null>,
  labelCenter: { x: number; y: number }
): DetectedDimensionLineSpan | null {
  const { data, height, width } = imageData;
  const isDark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < 120) return false;
    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

    // 도면 치수선은 아주 연한 회색인 경우가 많고 JPEG 압축으로 더 옅어진다.
    return luminance < 228;
  };
  // main = 치수선이 뻗는 방향, cross = 그에 수직(탐색 창 방향)
  const mainSize = axis === "vertical" ? height : width;
  const crossSize = axis === "vertical" ? width : height;
  const darkAt = (cross: number, main: number) => (axis === "vertical" ? isDark(cross, main) : isDark(main, cross));
  const labelMain = Math.round(((axis === "vertical" ? labelCenter.y : labelCenter.x) / 1000) * mainSize);
  const labelCross = Math.round(((axis === "vertical" ? labelCenter.x : labelCenter.y) / 1000) * crossSize);
  const searchRadius = Math.max(12, Math.round(crossSize * 0.09));
  const minRunLength = Math.max(20, Math.round(mainSize * 0.05));
  const maxGap = 3;
  let best: { cross: number; max: number; min: number; score: number } | null = null;

  const considerRun = (cross: number, runStart: number, runEnd: number) => {
    const length = runEnd - runStart + 1;
    if (length < minRunLength) return;
    // 라벨은 자기 치수선의 구간 안(약간의 여유 포함)에 인쇄된다.
    if (labelMain < runStart - mainSize * 0.06 || labelMain > runEnd + mainSize * 0.06) return;
    const mid = Math.round((runStart + runEnd) / 2);
    let thickness = 1;
    for (let delta = 1; delta <= 6 && darkAt(cross + delta, mid); delta += 1) thickness += 1;
    for (let delta = 1; delta <= 6 && darkAt(cross - delta, mid); delta += 1) thickness += 1;
    if (thickness > 5) return;
    const runCenter = (runStart + runEnd) / 2;
    const score = Math.abs(runCenter - labelMain) / mainSize + (Math.abs(cross - labelCross) / crossSize) * 0.6;
    if (!best || score < best.score) best = { cross, max: runEnd, min: runStart, score };
  };

  const crossMin = Math.max(0, labelCross - searchRadius);
  const crossMax = Math.min(crossSize - 1, labelCross + searchRadius);
  for (let cross = crossMin; cross <= crossMax; cross += 1) {
    let runStart = -1;
    let lastDark = -1;
    for (let main = 0; main < mainSize; main += 1) {
      if (darkAt(cross, main)) {
        if (runStart < 0) runStart = main;
        lastDark = main;
      } else if (runStart >= 0 && main - lastDark > maxGap) {
        considerRun(cross, runStart, lastDark);
        runStart = -1;
      }
    }
    if (runStart >= 0) considerRun(cross, runStart, lastDark);
  }
  if (!best) return null;
  const found: { cross: number; max: number; min: number; score: number } = best;
  const tickRunRadius = Math.max(10, Math.round(crossSize * 0.025));
  const minTickLength = Math.max(8, Math.round(crossSize * 0.018));
  const minTickGap = Math.max(6, Math.round(mainSize * 0.012));
  const tickPositions: number[] = [found.min, found.max];
  const perpendicularRunLength = (main: number) => {
    if (!darkAt(found.cross, main)) return 0;
    let leftLength = 0;
    for (let cross = found.cross - 1; cross >= Math.max(0, found.cross - tickRunRadius) && darkAt(cross, main); cross -= 1) {
      leftLength += 1;
    }
    let rightLength = 0;
    for (let cross = found.cross + 1; cross <= Math.min(crossSize - 1, found.cross + tickRunRadius) && darkAt(cross, main); cross += 1) {
      rightLength += 1;
    }
    if (!leftLength || !rightLength) return 0;

    return leftLength + 1 + rightLength;
  };

  for (let main = found.min; main <= found.max; main += 1) {
    if (perpendicularRunLength(main) < minTickLength) continue;
    const previous = tickPositions[tickPositions.length - 1];
    if (Math.abs(main - previous) >= minTickGap) {
      tickPositions.push(main);
      continue;
    }
    if (Math.abs(main - found.min) < Math.abs(previous - found.min) || Math.abs(main - found.max) < Math.abs(previous - found.max)) {
      tickPositions[tickPositions.length - 1] = main;
    }
  }

  tickPositions.sort((left, right) => left - right);
  let measuredMin = found.min;
  let measuredMax = found.max;
  for (let index = 0; index < tickPositions.length - 1; index += 1) {
    const left = tickPositions[index];
    const right = tickPositions[index + 1];
    if (right - left < minRunLength * 0.35) continue;
    if (labelMain >= left - minTickGap && labelMain <= right + minTickGap) {
      measuredMin = left;
      measuredMax = right;
      break;
    }
  }

  return {
    axis,
    cross: (found.cross / crossSize) * 1000,
    max: (measuredMax / mainSize) * 1000,
    min: (measuredMin / mainSize) * 1000
  };
}

// Ctrl+Z 이력 한 칸 — 벽과 문/창문·설비 후보를 함께 스냅샷해 편집 종류와 무관하게 되돌린다.
type EditorHistorySnapshot = { fixtures: FloorPlanCandidate[]; openings: FloorPlanCandidate[]; walls: Wall[] };

export default function RoomlogFloorPlanEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<EditorTool>("wall");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  // 빈 캔버스에서 시작 — 샘플 벽은 '샘플 도면 체험'/'샘플 복원'과 세입자 체험 진입 시에만 채운다.
  const [walls, setWalls] = useState<Wall[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [hoveredWall, setHoveredWall] = useState<Wall | null>(null);
  const [hiddenWallIds, setHiddenWallIds] = useState<Set<string>>(() => new Set());
  const [furnitureCatalog, setFurnitureCatalog] = useState<FurnitureCatalogItem[]>(FURNITURE_CATALOG);
  const [furnitureCatalogStatus, setFurnitureCatalogStatus] = useState("사용자 모드 배치 카탈로그");
  const [furnitureKindFilter, setFurnitureKindFilter] = useState<FurnitureKindFilter>("전체");
  const [furnitureSearchQuery, setFurnitureSearchQuery] = useState("");
  const [placedFurnitures, setPlacedFurnitures] = useState<PlacedFurniture[]>([]);
  const [pendingFurniture, setPendingFurniture] = useState<PlacedFurniture | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [openingCandidates, setOpeningCandidates] = useState<FloorPlanCandidate[]>([]);
  const [fixtureCandidates, setFixtureCandidates] = useState<FloorPlanCandidate[]>([]);
  // 검토 목록에서 hover한 후보 — 캔버스에서 해당 후보를 하이라이트해 "어느 문인지" 연결해준다.
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [detectionBoxes, setDetectionBoxes] = useState<RoboflowDetectionOverlayBox[]>([]);
  // 확인용: 클릭한 벽 조각(문/창문 gap으로 끊긴 연결 구간)을 밝게 표시하는 사각들.
  const [selectedWallRunRects, setSelectedWallRunRects] = useState<Array<{ x1: number; x2: number; y1: number; y2: number }> | null>(null);
  const [roboflowDetections, setRoboflowDetections] = useState<RoboflowFloorPlanDetections | null>(null);
  const [roboflowWallPostProcessSourceWalls, setRoboflowWallPostProcessSourceWalls] = useState<Wall[]>([]);
  const [extractionMeta, setExtractionMeta] = useState<ExtractionMeta>({
    annotationCandidateCount: 0,
    detectedWallCount: 0,
    dimensionCandidateCount: 0,
    needsReview: false,
    ocrStatus: "manual-scale-required",
    removedNoiseCount: 0,
    scaleCandidates: [],
    scaleConfirmed: false
  });
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedAiImageDataUrl, setUploadedAiImageDataUrl] = useState<string | null>(null);
  const [uploadedFloorPlanSource, setUploadedFloorPlanSource] = useState<UploadedFloorPlanSource | null>(null);
  const [cachedBackgroundImage, setCachedBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.3);
  const [isProcessing, setIsProcessing] = useState(false);
  // 도면 인식(자동 탐지)이 도는 동안 캔버스 위에 스캔 애니메이션을 띄운다.
  const [isScanningPlan, setIsScanningPlan] = useState(false);
  // 상태 메시지 토스트 — 예전엔 span 하나가 60여 종 피드백(줌·삭제·undo·저장…)을 덮어썼고
  // 자동으로 사라지지도 않았다. 최근 3개까지 쌓이고 몇 초 뒤 사라지는 토스트로 교체.
  // 호출부가 매우 많아 setUploadStatus라는 이름은 그대로 둔다.
  const [statusToasts, setStatusToasts] = useState<Array<{ id: number; text: string }>>([]);
  const statusToastIdRef = useRef(0);
  const statusToastTimersRef = useRef<number[]>([]);
  const setUploadStatus = useCallback((text: string) => {
    statusToastIdRef.current += 1;
    const id = statusToastIdRef.current;
    setStatusToasts((toasts) => [...toasts.slice(-2), { id, text }]);
    statusToastTimersRef.current.push(
      window.setTimeout(() => {
        setStatusToasts((toasts) => toasts.filter((toast) => toast.id !== id));
      }, 4500)
    );
  }, []);
  useEffect(() => {
    const timers = statusToastTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState("도면 인식 대기");
  const [floorPlanDraftId, setFloorPlanDraftId] = useState<string | null>(null);
  // 마지막 저장 결과 — 버튼 옆에 계속 표시해 "저장이 됐는지" 헷갈리지 않게 한다.
  const [pixelToMmRatio, setPixelToMmRatio] = useState(DEFAULT_PIXEL_TO_MM_RATIO);
  const [isScaleSet, setIsScaleSet] = useState(false);
  // 방 내부 재기: 두 점 측정으로 방 가로/세로(mm)와 면적(㎡)을 구한다.
  // "scale"은 축척(1px=mm)만 확정하는 전용 모드 — 방 가로/세로 측정과 분리돼 있다.
  const [interiorMeasureTarget, setInteriorMeasureTarget] = useState<"width" | "depth" | "scale" | null>(null);
  const [interiorMeasureStart, setInteriorMeasureStart] = useState<Point | null>(null);
  const [interiorMeasureEnd, setInteriorMeasureEnd] = useState<Point | null>(null);
  const [interiorMeasurePx, setInteriorMeasurePx] = useState(0);
  const [interiorHoverSnap, setInteriorHoverSnap] = useState<Point | null>(null);
  const [interiorCalibrationMm, setInteriorCalibrationMm] = useState("");
  const [roomWidthMm, setRoomWidthMm] = useState("");
  const [roomDepthMm, setRoomDepthMm] = useState("");
  // 요약/후보/가구 패널 — 캔버스를 덮는 오른쪽 접이식 드로어. 평소엔 닫아 캔버스가 전체 폭을 쓴다.
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  // 방 크기 측정 섹션(드로어 안 <details>) — 세부 조정에 들어가면 자동으로 펼친다.
  const interiorMeasureSectionRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    // 가구 라이브러리·방 크기 측정이 드로어 안에 있어서, 해당 작업(3D 배치 포함)에 들어가면 자동으로 열어준다.
    if (tool === "furniture" || tool === "interior" || viewMode === "3d") setSidePanelOpen(true);
    if (tool === "interior" && interiorMeasureSectionRef.current) interiorMeasureSectionRef.current.open = true;
  }, [tool, viewMode]);
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  // 편집 실행 취소 스냅샷 — 벽뿐 아니라 문/창문·설비 후보도 함께 담아 Ctrl+Z 한 번으로 되돌린다.
  // setState가 항상 새 배열을 만들므로 참조 비교로 변경을 감지한다.
  const editHistoryRef = useRef<{ past: EditorHistorySnapshot[]; future: EditorHistorySnapshot[] }>({ past: [], future: [] });
  const editHistorySkipRef = useRef(false);
  // 드래그(이동/크기조절)는 mousemove마다 상태를 갱신하므로, 드래그 시작 시점 한 번만 이력에 쌓는다.
  const dragHistoryPushedRef = useRef(false);
  const lastHistorySnapshotRef = useRef<EditorHistorySnapshot>({ fixtures: fixtureCandidates, openings: openingCandidates, walls });

  // 저장된 도면 초안(floorPlanDraft)은 자동 복원하지 않는다 — 항상 빈 캔버스로 시작하고,
  // 초안이 있으면 시작 안내에 "이전 초안 이어서 하기" 버튼만 노출한다(사용자가 눌러야 복원).
  // 자동 복원 시절엔 배경 도면 이미지 없이 후보 박스만 되살아나 과거 데이터가 유령처럼 떠 보였다.
  const [availableDraft, setAvailableDraft] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("floorPlanDraft");
      const draft = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      // 의미 있는 벽이 없는 초안은 이어서 할 것도 없다 — 버튼을 띄우지 않는다.
      if (draft && Array.isArray(draft.walls) && (draft.walls as Wall[]).length > 0) {
        setAvailableDraft(draft);
      }
    } catch {
      // 손상된 초안은 무시하고 빈 캔버스로 시작한다.
    }
  }, []);

  function restoreSavedDraft() {
    const draft = availableDraft;
    if (!draft) return;
    const restoredWalls = draft.walls as Wall[];

    editHistorySkipRef.current = true; // 복원은 실행취소 이력에 쌓지 않는다
    setWalls(restoredWalls);
    if (Array.isArray(draft.openings)) setOpeningCandidates(draft.openings as FloorPlanCandidate[]);
    if (Array.isArray(draft.fixtures)) setFixtureCandidates(draft.fixtures as FloorPlanCandidate[]);
    if (Array.isArray(draft.furnitures)) setPlacedFurnitures(draft.furnitures as PlacedFurniture[]);
    if (Array.isArray(draft.hiddenWallIds)) setHiddenWallIds(new Set(draft.hiddenWallIds as string[]));
    if (typeof draft.pixelToMmRatio === "number") setPixelToMmRatio(draft.pixelToMmRatio);
    if (draft.extractionMeta && typeof draft.extractionMeta === "object") {
      const meta = draft.extractionMeta as ExtractionMeta;
      setExtractionMeta(meta);
      setIsScaleSet(Boolean(meta.scaleConfirmed));
    }
    if (typeof draft.id === "string") setFloorPlanDraftId(draft.id);
    fitViewToWalls(restoredWalls);
    setAvailableDraft(null);
    setUploadStatus("저장된 도면을 불러왔어요 — 이어서 수정할 수 있어요");
  }
  const [isDragging, setIsDragging] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [wallDragOperation, setWallDragOperation] = useState<WallDragOperation | null>(null);
  // 문창문/설비 후보 조작 — 일반 클릭은 선택만 하고, 움직이면 이동/크기조절한다.
  // 확정/거절은 후보 목록·일괄 처리 버튼에서만 수행하며, 문창문 Alt+클릭은 타입만 전환한다.
  const [candidateDragOperation, setCandidateDragOperation] = useState<{
    axis: "horizontal" | "vertical";
    candidateId: string;
    layer: "opening" | "fixture";
    mode: "move" | "resize-start" | "resize-end";
    moved: boolean;
    originPoint: Point;
    originalBox: { height: number; width: number } | null;
    originalPosition: Point;
  } | null>(null);
  // Delete 키 삭제 대상 — 문창문/설비 도구에서 마지막으로 잡은(누른) 후보. 캔버스에 파란 링으로 표시.
  const [selectedCandidate, setSelectedCandidate] = useState<{ id: string; layer: "opening" | "fixture" } | null>(null);
  const [partialEraserSelectedWall, setPartialEraserSelectedWall] = useState<Wall | null>(null);
  const [isSelectingEraseArea, setIsSelectingEraseArea] = useState(false);
  const [eraseAreaStart, setEraseAreaStart] = useState<Point | null>(null);
  const [eraseAreaEnd, setEraseAreaEnd] = useState<Point | null>(null);
  const summary = useMemo(() => summarizeWalls(walls) as WallSummary, [walls]);
  // 후보 검토 대기함 — 아직 판단 안 한 후보만 보여주고, 처리된 것은 개수로만 요약한다.
  const pendingCandidates = useMemo(
    () =>
      [
        ...openingCandidates.map((candidate) => ["opening", candidate] as const),
        ...fixtureCandidates.map((candidate) => ["fixture", candidate] as const)
      ].filter(([, candidate]) => candidate.status === "CANDIDATE"),
    [fixtureCandidates, openingCandidates]
  );
  const reviewedCandidateCount = useMemo(
    () => [...openingCandidates, ...fixtureCandidates].filter((candidate) => candidate.status !== "CANDIDATE").length,
    [fixtureCandidates, openingCandidates]
  );
  const highConfidencePendingCount = useMemo(
    () => pendingCandidates.filter(([, candidate]) => (candidate.confidence ?? 0) >= 0.8).length,
    [pendingCandidates]
  );
  const visibleWalls = useMemo(() => walls.filter((wall) => !hiddenWallIds.has(String(wall.id))), [hiddenWallIds, walls]);
  // 디버그 표시용이지만 확정된 축척을 넘겨 실치수와 일치시킨다(기본값 10mm/px 고정 방지).
  const wheretoputWalls = useMemo(
    () => convertWallsToWheretoputSimulator(walls, { pixelToMeterRatio: pixelToMmRatio / 1000 }) as WheretoputWall3D[],
    [pixelToMmRatio, walls]
  );
  // 3D 변환용 벽 — 2D에서는 편집(스냅)을 위해 문·창문 자리를 모두 갈라놨지만,
  // 3D에서는 창문 자리를 후보 박스 크기의 벽 조각으로 도로 메워 문 자리만 뚫린 채 남긴다.
  // 문 후보 드래그 등 창문과 무관한 후보 변경마다 전체 벽 3D 변환이 다시 돌지 않게,
  // 창문 후보의 기하만 추린 값을 메모 키로 쓴다.
  const windowFillWalls = useMemo(
    () =>
      openingCandidates
        .filter(
          (candidate) =>
            candidate.status !== "REJECTED" && candidate.type.toUpperCase() === "WINDOW" && candidate.boxPx && candidate.position
        )
        .map((candidate) => {
          const box = candidate.boxPx!;
          const position = candidate.position!;
          const horizontal = box.width >= box.height;
          const thickness = Math.max(4, horizontal ? box.height : box.width);
          return {
            id: `window-fill-${candidate.id}`,
            start: horizontal ? { x: position.x - box.width / 2, y: position.y } : { x: position.x, y: position.y - box.height / 2 },
            end: horizontal ? { x: position.x + box.width / 2, y: position.y } : { x: position.x, y: position.y + box.height / 2 },
            depthPx: thickness,
            thicknessPx: thickness
          } as unknown as Wall;
        }),
    [openingCandidates]
  );
  const windowFillKey = useMemo(
    () => windowFillWalls.map((wall) => `${wall.id}:${wall.start.x},${wall.start.y}-${wall.end.x},${wall.end.y}:${wall.thicknessPx}`).join("|"),
    [windowFillWalls]
  );
  const roomWalls3D = useMemo(
    () => convertWallsToWheretoputRoom3D([...visibleWalls, ...windowFillWalls], { pixelToMmRatio }) as WheretoputWall3D[],
    // windowFillWalls 배열 참조는 후보가 바뀔 때마다 새로 만들어지므로, 기하 서명(windowFillKey)으로만 재계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pixelToMmRatio, visibleWalls, windowFillKey]
  );
  // 전체 벽 외곽 크기(mm) — 축척이 실제 도면과 맞는지 한눈에 비교용.
  const wallBoundsMm = useMemo(() => {
    if (!walls.length) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const wall of walls) {
      for (const point of [wall.start, wall.end]) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
    return { widthMm: Math.round((maxX - minX) * pixelToMmRatio), heightMm: Math.round((maxY - minY) * pixelToMmRatio) };
  }, [walls, pixelToMmRatio]);
  // 벽 축 라인: 세로벽들의 X, 가로벽들의 Y를 가까운 값끼리 묶는다(교차점 = 코너).
  // 벽은 중심선으로 저장되므로, 안쪽 면 꼭짓점 스냅을 위해 각 축의 벽 두께도 함께 들고 다닌다.
  const wallAxisLines = useMemo(() => {
    const clusterTolerance = 12;
    type WallAxisSample = { axis: number; thickness: number };
    const verticalXs: WallAxisSample[] = [];
    const horizontalYs: WallAxisSample[] = [];
    for (const wall of walls) {
      const horizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
      const thickness = Math.max(0, Number(wall.thicknessPx ?? wall.depthPx ?? 0));
      if (horizontal) horizontalYs.push({ axis: (wall.start.y + wall.end.y) / 2, thickness });
      else verticalXs.push({ axis: (wall.start.x + wall.end.x) / 2, thickness });
    }
    const cluster = (samples: WallAxisSample[]) => {
      const sorted = [...samples].sort((left, right) => left.axis - right.axis);
      const groups: WallAxisSample[] = [];
      let bucket: WallAxisSample[] = [];
      const flushBucket = () => {
        if (!bucket.length) return;
        groups.push({
          axis: bucket.reduce((sum, item) => sum + item.axis, 0) / bucket.length,
          thickness: Math.max(...bucket.map((item) => item.thickness))
        });
        bucket = [];
      };
      for (const sample of sorted) {
        if (bucket.length && sample.axis - bucket[bucket.length - 1].axis > clusterTolerance) flushBucket();
        bucket.push(sample);
      }
      flushBucket();
      return groups;
    };
    return { verticalX: cluster(verticalXs), horizontalY: cluster(horizontalYs) };
  }, [walls]);

  // 방 내부 면적(㎡) = 가로 × 세로.
  const roomAreaM2 = useMemo(() => {
    const widthMm = Number(roomWidthMm);
    const depthMm = Number(roomDepthMm);
    if (!widthMm || !depthMm || widthMm <= 0 || depthMm <= 0) return null;
    return (widthMm * depthMm) / 1_000_000;
  }, [roomWidthMm, roomDepthMm]);
  // AI가 분류한 dimensions(kind 포함)가 1순위. 없으면 예전 textDetections를 wall_span으로 폴백한다.
  const allPrintedDimensionChips = useMemo<PrintedDimensionChip[]>(() => {
    const aiDimensions = extractionMeta.aiDimensions ?? [];
    const chips = aiDimensions.length
      ? aiDimensions.flatMap((dimension, dimensionIndex) => {
          const kind = guardrailKind(normalizeDimensionKind(dimension.kind), dimension.text);
          const realLengthMm =
            dimension.valueMm && dimension.valueMm > 0
              ? Math.round(dimension.valueMm)
              : kind === "furniture" || kind === "fixture"
                ? parseFurnitureDimensionValueMm(dimension.text)
                : parseDimensionTextsToMm(dimension.text)[0];
          if (!realLengthMm || kind === "area" || kind === "ignore") return [];
          const boundingBox = normalizeAiTextBoundingBox(dimension.boundingBox);
          const targetLine = normalizeAiTargetLine(dimension.targetLine);
          const placement = classifyDimensionPlacement(boundingBox, targetLine);
          const structural = isStructuralDimensionKind(kind);
          const axis = dimension.axis === "horizontal" || dimension.axis === "vertical" ? dimension.axis : placement.axis;

          return [
            {
              axis,
              boundingBox,
              confidence: dimension.confidence,
              id: printedDimensionKey(dimensionIndex, 0, realLengthMm, boundingBox),
              kind,
              realLengthMm,
              side: dimensionSideFromAxis(axis, boundingBox) ?? placement.side,
              targetLine,
              text: `${realLengthMm}mm`,
              useForFurnitureFit: (kind === "furniture" || kind === "fixture") && dimension.useForFurnitureFit !== false,
              useForScale: structural && dimension.useForScale === true,
              useForWallGeneration: structural && dimension.useForWallGeneration !== false
            }
          ];
        })
      : (extractionMeta.aiTextDetections ?? []).flatMap((detection, detectionIndex) =>
          parseDimensionTextsToMm(detection.text).flatMap((realLengthMm, valueIndex) => {
            const boundingBox = normalizeAiTextBoundingBox(detection.boundingBox);
            const targetLine = normalizeAiTargetLine(detection.targetLine);
            const placement = classifyDimensionPlacement(boundingBox, targetLine);

            return [
              {
                axis: placement.axis,
                boundingBox,
                confidence: detection.confidence,
                id: printedDimensionKey(detectionIndex, valueIndex, realLengthMm, boundingBox),
                kind: "wall_span" as const,
                realLengthMm,
                side: placement.side,
                targetLine,
                text: `${realLengthMm}mm`,
                useForFurnitureFit: false,
                useForScale: true,
                useForWallGeneration: true
              }
            ];
          })
        );

    return chips.sort((a, b) => b.realLengthMm - a.realLengthMm);
  }, [extractionMeta.aiDimensions, extractionMeta.aiTextDetections]);
  // 구조 치수만 축척·격자·오버레이·벽 생성에 쓴다.
  const structuralDimensionChips = useMemo(() => allPrintedDimensionChips.filter((chip) => isStructuralDimensionKind(chip.kind)), [allPrintedDimensionChips]);
  const openingDimensionChips = useMemo(() => allPrintedDimensionChips.filter((chip) => chip.kind === "opening"), [allPrintedDimensionChips]);
  const furnitureDimensionChips = useMemo(
    () => allPrintedDimensionChips.filter((chip) => chip.kind === "furniture" || chip.kind === "fixture"),
    [allPrintedDimensionChips]
  );
  const printedDimensionChips = useMemo(() => {
    // 캔버스 오버레이는 구조 치수만. 여백(위/아래/좌/우) 치수를 안쪽 치수보다 앞세운다.
    const marginChips = structuralDimensionChips.filter((chip) => chip.side !== null);
    const interiorChips = structuralDimensionChips.filter((chip) => chip.side === null);

    return [...marginChips, ...interiorChips].slice(0, MAX_VISIBLE_PRINTED_DIMENSIONS);
  }, [structuralDimensionChips]);
  const [printedDimensionLineSpans, setPrintedDimensionLineSpans] = useState<Map<string, DetectedDimensionLineSpan>>(() => new Map());
  const aiImagePixelsRef = useRef<{ imageData: ImageData; src: string } | null>(null);

  // 원본 이미지 픽셀에서 각 치수 라벨 근처의 인쇄된 치수선을 찾는다.
  useEffect(() => {
    let cancelled = false;
    const targets = structuralDimensionChips.filter((chip) => chip.axis && chip.boundingBox);
    if (!uploadedAiImageDataUrl || !targets.length) {
      setPrintedDimensionLineSpans(new Map());
      return;
    }
    (async () => {
      try {
        let pixels = aiImagePixelsRef.current;
        if (!pixels || pixels.src !== uploadedAiImageDataUrl) {
          const image = await loadImage(uploadedAiImageDataUrl);
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth || image.width;
          canvas.height = image.naturalHeight || image.height;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(image, 0, 0);
          pixels = { imageData: context.getImageData(0, 0, canvas.width, canvas.height), src: uploadedAiImageDataUrl };
          aiImagePixelsRef.current = pixels;
        }
        if (cancelled) return;
        const spans = new Map<string, DetectedDimensionLineSpan>();
        for (const chip of targets) {
          const box = chip.boundingBox!;
          const span = findPrintedDimensionLineSpan(pixels.imageData, chip.axis as Exclude<DimensionAxis, null>, {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2
          });
          if (span) spans.set(chip.id, span);
        }
        if (!cancelled) setPrintedDimensionLineSpans(spans);
      } catch {
        if (!cancelled) setPrintedDimensionLineSpans(new Map());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [structuralDimensionChips, uploadedAiImageDataUrl]);

  const printedDimensionScale = useMemo<ScaleCandidate | null>(() => {
    const frame = computeBackgroundImageFrame(cachedBackgroundImage);
    const union = computeWallUnionBox(detectionBoxes);
    // 벽 union 기반 "기대 축척": 가장 큰 가로/세로 구조 치수 ÷ union 폭/높이.
    // 픽셀 검출 축척이 이와 크게 어긋나면(예: 짧은 선 오인으로 3배 이탈) 그 샘플을 걸러낸다.
    let expectedRatio: number | null = null;
    if (union) {
      const maxHorizontalMm = Math.max(0, ...structuralDimensionChips.filter((chip) => chip.axis === "horizontal").map((chip) => chip.realLengthMm));
      const maxVerticalMm = Math.max(0, ...structuralDimensionChips.filter((chip) => chip.axis === "vertical").map((chip) => chip.realLengthMm));
      const unionWidth = union.x2 - union.x1;
      const unionHeight = union.y2 - union.y1;
      const ratioH = unionWidth > 20 && maxHorizontalMm > 0 ? maxHorizontalMm / unionWidth : null;
      const ratioV = unionHeight > 20 && maxVerticalMm > 0 ? maxVerticalMm / unionHeight : null;
      expectedRatio = ratioH !== null && ratioV !== null ? (ratioH + ratioV) / 2 : ratioH ?? ratioV;
    }

    // 1순위: 인쇄된 치수선을 직접 검출한 길이 — 도면 자체가 근거라 가장 정확하다.
    if (frame && printedDimensionLineSpans.size) {
      const rawSamples = structuralDimensionChips.flatMap((chip) => {
        const span = printedDimensionLineSpans.get(chip.id);
        if (!span) return [];
        const canvasLength = ((span.max - span.min) / 1000) * (span.axis === "horizontal" ? frame.width : frame.height);
        if (canvasLength < 8) return [];
        const ratio = chip.realLengthMm / canvasLength;

        return isPlausiblePixelToMmRatio(ratio) ? [{ canvasLength, ratio, realLengthMm: chip.realLengthMm }] : [];
      });
      // 벽 union 기대 축척으로 outlier 제거(±30%). union 없으면 원본 유지.
      const samples = filterRatioSamplesNearExpected(rawSamples, expectedRatio) as typeof rawSamples;
      const consensus = pickConsensusRatio(samples);
      if (consensus && consensus.support >= 2) {
        // union으로 검증된 축척은 source에 표시 — 나중에 union이 생겨 오독을 교정할 수 있게.
        const validatedTag = expectedRatio ? "-validated" : "";
        return {
          confidence: Math.min(0.97, 0.6 + consensus.support * 0.08),
          pixelLength: Math.round(consensus.sample.canvasLength),
          pixelToMmRatio: consensus.ratio,
          realLengthMm: consensus.sample.realLengthMm,
          source: `printed-dimension-line${validatedTag}-x${consensus.support}`
        };
      }
    }

    const unionCandidate = estimateWallUnionScaleCandidate(structuralDimensionChips, union);
    if (unionCandidate) return unionCandidate;

    // 벽 탐지 전이거나 축 매칭이 실패하면 AI targetLine 교차검증으로라도 후보를 낸다.
    // 구조 치수의 targetLine만 쓴다(가구/opening 제외).
    return estimatePrintedDimensionScaleCandidate(
      structuralDimensionChips.flatMap((chip) => (chip.targetLine ? [{ targetLine: chip.targetLine, text: chip.text }] : [])),
      computeBackgroundImageFrame(cachedBackgroundImage)
    );
  }, [structuralDimensionChips, cachedBackgroundImage, detectionBoxes, printedDimensionLineSpans]);

  const scaleAutoAppliedRef = useRef(false);
  useEffect(() => {
    if (!printedDimensionScale) return;
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleCandidates: [printedDimensionScale] }));
    const ratio = printedDimensionScale.pixelToMmRatio;
    if (!(ratio > 0)) return;
    const isDimensionLine = printedDimensionScale.source.includes("dimension-line");
    const isUnionValidated = printedDimensionScale.source.includes("validated");

    // 최초: 인쇄 치수선 검출 기반이면 자동 확정(union 없을 때도 기존 동작 유지).
    if (!isScaleSet && isDimensionLine) {
      setPixelToMmRatio(ratio);
      setIsScaleSet(true);
      scaleAutoAppliedRef.current = true;
      setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
      setUploadStatus(`축척 자동 적용됨(치수선 검출): 1px = ${ratio.toFixed(2)}mm`);
      return;
    }

    // 교정: 자동 적용해둔 축척이, 나중에 벽 union으로 검증된 축척과 25% 넘게 다르면 오독으로 보고 교체한다.
    // (치수 읽기를 문/창문 탐지보다 먼저 해서 union 없이 잘못 잠긴 경우를 바로잡는다. 사용자가 직접 정한 축척은 안 건드림.)
    if (isScaleSet && scaleAutoAppliedRef.current && isUnionValidated && Math.abs(ratio - pixelToMmRatio) / pixelToMmRatio > 0.25) {
      setPixelToMmRatio(ratio);
      setUploadStatus(`축척 교정됨(벽 탐지로 검증): 1px = ${ratio.toFixed(2)}mm`);
    }
  }, [isScaleSet, pixelToMmRatio, printedDimensionScale]);

  // 격자를 도면에 맞춘다: 도면의 벽 외곽 모서리에서 격자가 시작되고,
  // 축척이 있으면 한 칸이 실측 라운드 값(250/500/1000mm)이 되게 한다.
  // 원점은 ① 검출된 전체 치수선의 끝점(=벽 외곽면, 픽셀 정확) ② Roboflow 벽 union 순으로 신뢰한다.
  const gridSpec = useMemo(() => {
    const union = computeWallUnionBox(detectionBoxes);
    const frame = computeBackgroundImageFrame(cachedBackgroundImage);
    let originX: number | null = null;
    let originY: number | null = null;
    if (frame) {
      for (const axis of ["horizontal", "vertical"] as const) {
        const axisChips = structuralDimensionChips.filter(
          (chip) => chip.axis === axis && printedDimensionLineSpans.get(chip.id)?.axis === axis
        );
        if (!axisChips.length) continue;
        const largest = axisChips.reduce((best, chip) => (chip.realLengthMm > best.realLengthMm ? chip : best));
        const span = printedDimensionLineSpans.get(largest.id)!;
        const frameSize = axis === "horizontal" ? frame.width : frame.height;
        const spanLengthCanvas = ((span.max - span.min) / 1000) * frameSize;
        const unionSpan = union ? (axis === "horizontal" ? union.x2 - union.x1 : union.y2 - union.y1) : null;
        // 부분 치수를 전체로 오인하지 않게, 벽 union 폭과 얼추 맞을 때만 원점으로 쓴다.
        if (unionSpan && Math.abs(spanLengthCanvas - unionSpan) / unionSpan > 0.1) continue;
        if (axis === "horizontal") originX = frame.x + (span.min / 1000) * frame.width;
        else originY = frame.y + (span.min / 1000) * frame.height;
      }
    }
    if (originX === null && union) originX = union.x1;
    if (originY === null && union) originY = union.y1;
    if (originX === null || originY === null) {
      return { aligned: false, origin: { x: 0, y: 0 }, spacing: GRID_SIZE_PX, stepMm: null as number | null };
    }
    const origin = { x: originX, y: originY };
    const ratio = isScaleSet ? pixelToMmRatio : printedDimensionScale?.pixelToMmRatio ?? null;
    if (!ratio || ratio <= 0) return { aligned: true, origin, spacing: GRID_SIZE_PX, stepMm: null as number | null };
    // 칸 크기는 화면상 보기 좋은 범위(14~64px) 중에서 고르되, 도면 전체 치수를
    // 나누어떨어지게 하는 값을 우선한다 — 그래야 네 모서리가 전부 격자에 맞물린다.
    const totalWidthMm = Math.max(0, ...structuralDimensionChips.filter((chip) => chip.axis === "horizontal").map((chip) => chip.realLengthMm));
    const totalHeightMm = Math.max(0, ...structuralDimensionChips.filter((chip) => chip.axis === "vertical").map((chip) => chip.realLengthMm));
    const stepCandidates = [100, 200, 250, 500, 1000, 2000].filter((stepMm) => stepMm / ratio >= 14 && stepMm / ratio <= 64);
    const dividesBoth = stepCandidates.filter(
      (stepMm) => totalWidthMm > 0 && totalHeightMm > 0 && totalWidthMm % stepMm === 0 && totalHeightMm % stepMm === 0
    );
    const dividesOne = stepCandidates.filter((stepMm) => (totalWidthMm > 0 && totalWidthMm % stepMm === 0) || (totalHeightMm > 0 && totalHeightMm % stepMm === 0));
    const stepMm = dividesBoth[dividesBoth.length - 1] ?? dividesOne[dividesOne.length - 1] ?? stepCandidates[0] ?? null;
    if (stepMm) return { aligned: true, origin, spacing: stepMm / ratio, stepMm: stepMm as number | null };

    return { aligned: true, origin, spacing: GRID_SIZE_PX, stepMm: null as number | null };
  }, [
    structuralDimensionChips,
    cachedBackgroundImage,
    detectionBoxes,
    isScaleSet,
    pixelToMmRatio,
    printedDimensionLineSpans,
    printedDimensionScale
  ]);

  // 구조 치수 경계선(캔버스 좌표): 벽이 "있어야 할 자리". 가로 치수 체인 → 세로벽 x, 세로 치수 체인 → 가로벽 y.
  // 여기서만 구조 치수(structuralDimensionChips)를 소비 — 가구/opening/면적은 애초에 안 들어온다.
  const structuralWallBoundaries = useMemo<{ horizontalLineY: number[]; verticalLineX: number[] }>(() => {
    const empty = { horizontalLineY: [] as number[], verticalLineX: [] as number[] };
    const frame = uploadedImage ? computeBackgroundImageFrame(cachedBackgroundImage) : null;
    if (!frame) return empty;
    const ratio = isScaleSet ? pixelToMmRatio : printedDimensionScale?.pixelToMmRatio ?? null;
    if (!ratio || ratio <= 0) return empty;
    const union = computeWallUnionBox(detectionBoxes);
    const toCanvasPoint = (x: number, y: number) => ({ x: frame.x + (x / 1000) * frame.width, y: frame.y + (y / 1000) * frame.height });
    // 도면 실제 범위: 검출된 전체 치수선 끝(=벽 외곽면) 1순위, 없으면 벽 union. (오버레이의 planExtentForAxis와 동일 규칙)
    const planExtentForAxis = (axis: Exclude<DimensionAxis, null>) => {
      const unionMin = axis === "horizontal" ? union?.x1 ?? null : union?.y1 ?? null;
      const unionMax = axis === "horizontal" ? union?.x2 ?? null : union?.y2 ?? null;
      const axisChips = structuralDimensionChips.filter((chip) => chip.axis === axis && printedDimensionLineSpans.get(chip.id)?.axis === axis);
      if (axisChips.length) {
        const largest = axisChips.reduce((best, chip) => (chip.realLengthMm > best.realLengthMm ? chip : best));
        const span = printedDimensionLineSpans.get(largest.id)!;
        const start = axis === "horizontal" ? toCanvasPoint(span.min, span.cross).x : toCanvasPoint(span.cross, span.min).y;
        const end = axis === "horizontal" ? toCanvasPoint(span.max, span.cross).x : toCanvasPoint(span.cross, span.max).y;
        const unionSpan = unionMin !== null && unionMax !== null ? unionMax - unionMin : null;
        if (!unionSpan || Math.abs(end - start - unionSpan) / unionSpan <= 0.1) return { max: end, min: start };
      }

      return unionMin !== null && unionMax !== null ? { max: unionMax, min: unionMin } : null;
    };

    const verticalLineX: number[] = [];
    const horizontalLineY: number[] = [];
    for (const axis of ["horizontal", "vertical"] as const) {
      const planExtent = planExtentForAxis(axis);
      if (!planExtent) continue;
      const spanMm = (planExtent.max - planExtent.min) * ratio;
      if (spanMm <= 0) continue;
      const axisChips = structuralDimensionChips.filter((chip) => chip.axis === axis && chip.boundingBox);
      if (!axisChips.length) continue;

      // 경계 좌표를 두 소스에서 모은다.
      const boundaryCoords: number[] = [planExtent.min, planExtent.max];

      // (1) 1순위: 원본에서 검출한 치수선 끝점 = 벽 면 위치(픽셀 정확). 세로처럼 체인이 안 맞아도 여기서 경계가 나온다.
      //     단, 검출 스팬 길이가 치수값과 15% 넘게 다르면 잘못 잡은 선이므로 버린다(검증).
      for (const chip of axisChips) {
        const span = printedDimensionLineSpans.get(chip.id);
        if (!span || span.axis !== axis) continue;
        const startCoord = axis === "horizontal" ? toCanvasPoint(span.min, span.cross).x : toCanvasPoint(span.cross, span.min).y;
        const endCoord = axis === "horizontal" ? toCanvasPoint(span.max, span.cross).x : toCanvasPoint(span.cross, span.max).y;
        const detectedLen = Math.abs(endCoord - startCoord);
        const expectedLen = chip.realLengthMm / ratio;
        if (expectedLen < 4 || Math.abs(detectedLen - expectedLen) / expectedLen > 0.15) continue;
        boundaryCoords.push(startCoord, endCoord);
      }

      // (2) 보완: 검출이 없었던 구간은 치수 체인 산술로 메운다(합=전체인 줄만).
      const perpSizes = axisChips
        .map((chip) => (axis === "horizontal" ? chip.boundingBox!.height : chip.boundingBox!.width))
        .sort((a, b) => a - b);
      const perpTolerance = Math.max(12, (perpSizes[Math.floor(perpSizes.length / 2)] || 20) * 1.2);
      const layoutInput = axisChips.map((chip) => {
        const box = chip.boundingBox!;
        return {
          alongCoord: axis === "horizontal" ? box.x + box.width / 2 : box.y + box.height / 2,
          id: chip.id,
          perpCoord: axis === "horizontal" ? box.y + box.height / 2 : box.x + box.width / 2,
          realLengthMm: chip.realLengthMm
        };
      });
      // E: 부분 체인도 도면 가장자리에 붙어 있으면 배치. 라벨 along 좌표는 0~1000 정규화 기준.
      const offsetsMm = structuralBoundaryOffsetsMm(layoutInput, spanMm, {
        allowEdgeAnchoredPartial: true,
        alongEnd: 1000,
        alongStart: 0,
        perpTolerance
      }) as number[];
      boundaryCoords.push(...offsetsMm.map((mm) => planExtent.min + mm / ratio));

      // 두 소스를 병합(가까운 경계는 하나로). 병합 허용오차 = 최소 구간의 30% 이하로 제한해 인접 벽을 뭉개지 않게.
      const merged = mergeCoordinates(boundaryCoords, Math.max(4, Math.min(12, (200 / ratio) * 0.3))) as number[];
      if (axis === "horizontal") verticalLineX.push(...merged);
      else horizontalLineY.push(...merged);
    }

    return { horizontalLineY, verticalLineX };
  }, [cachedBackgroundImage, detectionBoxes, isScaleSet, pixelToMmRatio, printedDimensionLineSpans, printedDimensionScale, structuralDimensionChips, uploadedImage]);

  const hiddenWallCount = hiddenWallIds.size;
  const landlordOptionFurnitures = useMemo(() => placedFurnitures.filter(isLandlordOptionFurniture), [placedFurnitures]);
  const furnitureKindCounts = useMemo(
    () =>
      furnitureCatalog.reduce<Record<string, number>>((counts, item) => {
        const kind = furnitureCategoryLabel(item);
        counts[kind] = (counts[kind] ?? 0) + 1;

        return counts;
      }, {}),
    [furnitureCatalog]
  );
  const furnitureKindFilters = useMemo(() => {
    const available = new Set(Object.keys(furnitureKindCounts));
    const ordered = FURNITURE_CATEGORY_ORDER.filter((category) => available.has(category));
    const remaining = [...available]
      .filter((category) => !FURNITURE_CATEGORY_ORDER.includes(category as (typeof FURNITURE_CATEGORY_ORDER)[number]))
      .sort((left, right) => left.localeCompare(right, "ko"));

    return ["전체", ...ordered, ...remaining];
  }, [furnitureKindCounts]);
  const filteredFurnitureCatalog = useMemo(() => {
    const query = furnitureSearchQuery.trim().toLowerCase();

    const matchingItems = furnitureCatalog.filter((item) => {
      const kind = furnitureCategoryLabel(item);
      const matchesKind = furnitureKindFilter === "전체" || kind === furnitureKindFilter;
      const searchableText = `${item.name} ${item.brand} ${item.category ?? ""} ${item.source ?? ""}`.toLowerCase();
      const matchesQuery = !query || searchableText.includes(query);

      return matchesKind && matchesQuery;
    });

    return furnitureKindFilter === "전체" ? distributeFurnitureCategories(matchingItems) : matchingItems;
  }, [furnitureCatalog, furnitureKindFilter, furnitureSearchQuery]);

  useEffect(() => {
    let isActive = true;

    async function loadFurnitureCatalog() {
      try {
        const datasetItems = await loadGlbDatasetCatalog();
        if (datasetItems.length) {
          if (!isActive) return;
          setFurnitureCatalog(datasetItems);
          setFurnitureCatalogStatus("가구 에셋 카탈로그");
          return;
        }

        const response = await fetch(apiUrl("/furniture-catalog"));
        if (!response.ok) throw new Error(`Furniture catalog fetch failed: ${response.status}`);

        const payload = (await response.json()) as unknown;
        if (!isActive) return;

        const items = Array.isArray(payload) ? payload.filter(isFurnitureCatalogItem).map(normalizeCatalogItem) : [];
        if (!items.length) {
          setFurnitureCatalog(FURNITURE_CATALOG);
          setFurnitureCatalogStatus("샘플 가구 카탈로그");
          return;
        }

        setFurnitureCatalog(items);
        setFurnitureCatalogStatus("로컬 가구 카탈로그");
      } catch {
        if (!isActive) return;
        setFurnitureCatalog(FURNITURE_CATALOG);
        setFurnitureCatalogStatus("샘플 가구 카탈로그");
      }
    }

    void loadFurnitureCatalog();

    return () => {
      isActive = false;
    };
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    context.save();
    context.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    context.scale(viewScale, viewScale);
    context.translate(viewOffset.x, viewOffset.y);

    const backgroundImageFrame = uploadedImage ? computeBackgroundImageFrame(cachedBackgroundImage) : null;
    if (backgroundImageFrame && cachedBackgroundImage) {
      context.globalAlpha = backgroundOpacity;
      context.drawImage(cachedBackgroundImage, backgroundImageFrame.x, backgroundImageFrame.y, backgroundImageFrame.width, backgroundImageFrame.height);
      context.globalAlpha = 1;
    }

    context.strokeStyle = "#e0e0e0";
    context.lineWidth = 0.5 / viewScale;
    const gridStartX = gridSpec.origin.x + Math.ceil((-5000 - gridSpec.origin.x) / gridSpec.spacing) * gridSpec.spacing;
    for (let x = gridStartX; x <= 5000; x += gridSpec.spacing) {
      context.beginPath();
      context.moveTo(x, -5000);
      context.lineTo(x, 5000);
      context.stroke();
    }
    const gridStartY = gridSpec.origin.y + Math.ceil((-5000 - gridSpec.origin.y) / gridSpec.spacing) * gridSpec.spacing;
    for (let y = gridStartY; y <= 5000; y += gridSpec.spacing) {
      context.beginPath();
      context.moveTo(-5000, y);
      context.lineTo(5000, y);
      context.stroke();
    }

    const drawWall = (wall: Wall, variant: "normal" | "ai-room" | "ai-missing" | "draft" | "selected" | "hover" | "erase" | "hidden") => {
      const colors = {
        "ai-missing": "#d97706",
        "ai-room": "#00a36c",
        draft: "rgba(43, 43, 43, 0.7)",
        erase: "#ff0000",
        hidden: "rgba(121, 130, 145, 0.42)",
        hover: "#0066ff",
        normal: "rgba(43, 43, 43, 0.82)",
        selected: "#0066ff"
      };
      context.strokeStyle = colors[variant];
      context.lineWidth = (variant === "draft" ? 10 : variant === "hidden" ? 6 : 8) / viewScale;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (variant === "draft" || variant === "hidden" || variant === "ai-room" || variant === "ai-missing") {
        context.setLineDash([3 / viewScale, 3 / viewScale]);
      }
      context.beginPath();
      context.moveTo(wall.start.x, wall.start.y);
      context.lineTo(wall.end.x, wall.end.y);
      context.stroke();
      context.setLineDash([]);

      if (variant === "selected") {
        const handleRadius = WALL_EDIT_HANDLE_RADIUS / viewScale;
        const midX = (wall.start.x + wall.end.x) / 2;
        const midY = (wall.start.y + wall.end.y) / 2;
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#0066ff";
        context.lineWidth = 2 / viewScale;
        for (const point of [wall.start, wall.end, { x: midX, y: midY }]) {
          context.beginPath();
          context.arc(point.x, point.y, handleRadius, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
      }

      if (variant !== "erase") {
        const midX = (wall.start.x + wall.end.x) / 2;
        const midY = (wall.start.y + wall.end.y) / 2;
        const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
        const adjustedAngle = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
        context.save();
        context.translate(midX, midY);
        context.rotate(adjustedAngle);
        context.fillStyle = variant === "draft" ? "#0066ff" : "#333333";
        context.font = `bold ${12 / viewScale}px Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(`${calculateDistance(wall.start, wall.end, pixelToMmRatio)}mm`, 0, 8 / viewScale);
        context.restore();
      }
    };

    walls.forEach((wall) => {
      const isRoboflowPostProcessedWall = wall.source === "roboflow-postprocessed";
      if (isRoboflowPostProcessedWall) {
        // 후처리 벽 몸통은 union 외곽선(overlay)으로 그린다. 여기서는 편집 피드백만 얹는다 —
        // 이게 없으면 벽 편집 도구로 후처리 벽을 잡아도 선택·이동이 화면에 안 보인다.
        if (selectedWall?.id === wall.id) drawWall(wall, "selected");
        else if (partialEraserSelectedWall?.id === wall.id) drawWall(wall, "erase");
        else if (hoveredWall?.id === wall.id) drawWall(wall, "hover");
        return;
      }
      if (selectedWall?.id === wall.id) drawWall(wall, "selected");
      else if (partialEraserSelectedWall?.id === wall.id) drawWall(wall, "erase");
      else if (hoveredWall?.id === wall.id) drawWall(wall, "hover");
      else if (hiddenWallIds.has(String(wall.id))) drawWall(wall, "hidden");
      else if ((wall as AiGeneratedWall).source === "ai-missing-wall-hint") drawWall(wall, "ai-missing");
      else if ((wall as AiGeneratedWall).source === "ai-room-edge") drawWall(wall, "ai-room");
      else drawWall(wall, "normal");
    });

    const drawCandidate = (candidate: FloorPlanCandidate, layer: "opening" | "fixture") => {
      const position = candidate.position ?? { x: 0, y: 0 };
      // 검토 목록 hover와 캔버스 선택(Delete 대상)을 같은 파란 링으로 강조한다.
      const isHovered =
        hoveredCandidateId === candidate.id || (selectedCandidate?.layer === layer && selectedCandidate.id === candidate.id);
      // 색은 종류 기준(문=빨강, 창문=연두 — 기존 인식 오버레이 색), 상태는 채움 농도로 구분한다.
      const color =
        candidate.status === "REJECTED"
          ? "#9aa3b2"
          : layer === "fixture"
            ? "#7a4fd6"
            : candidate.type.toUpperCase() === "DOOR"
              ? "#e11d48"
              : "#a3b800";
      context.save();
      // 검토 목록에서 hover 중인 후보는 링을 한 겹 더 그려 위치를 즉시 찾을 수 있게 한다.
      if (isHovered) {
        context.strokeStyle = "rgba(47, 85, 255, 0.35)";
        context.lineWidth = 10 / viewScale;
        context.beginPath();
        context.arc(position.x, position.y, 26 / viewScale, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = candidate.status === "REJECTED" ? 0.38 : 0.9;
      context.strokeStyle = isHovered ? "#2f55ff" : color;
      context.fillStyle = isHovered ? "#2f55ff" : color;
      context.lineWidth = (isHovered ? 4.5 : 3) / viewScale;
      const box = candidate.boxPx;
      let labelAnchorY = position.y - 16 / viewScale;
      if (layer === "opening" && box) {
        // 검출된 실제 크기 그대로 벽 위 구간(막대)으로 그린다 — 색 박스 오버레이를 대체.
        // 검토 대기(CANDIDATE)는 옅게, 확정은 진하게 채워 상태를 구분한다(점선 없음).
        const halfWidth = box.width / 2;
        const halfHeight = box.height / 2;
        context.globalAlpha = candidate.status === "REJECTED" ? 0.14 : candidate.status === "CANDIDATE" ? 0.24 : 0.5;
        context.fillRect(position.x - halfWidth, position.y - halfHeight, box.width, box.height);
        context.globalAlpha = candidate.status === "REJECTED" ? 0.38 : 0.95;
        context.strokeRect(position.x - halfWidth, position.y - halfHeight, box.width, box.height);
        // 긴 축 양끝 리사이즈 핸들 — 잡고 늘릴 수 있다는 시각적 힌트.
        if (candidate.status !== "REJECTED") {
          context.setLineDash([]);
          const handleSize = 7 / viewScale;
          const horizontal = openingAxisIsHorizontal(position, box);
          const handlePoints = horizontal
            ? [{ x: position.x - halfWidth, y: position.y }, { x: position.x + halfWidth, y: position.y }]
            : [{ x: position.x, y: position.y - halfHeight }, { x: position.x, y: position.y + halfHeight }];
          for (const handlePoint of handlePoints) {
            context.fillRect(handlePoint.x - handleSize / 2, handlePoint.y - handleSize / 2, handleSize, handleSize);
          }
        }
        labelAnchorY = position.y - halfHeight - 6 / viewScale;
      } else if (layer === "opening") {
        context.beginPath();
        context.arc(position.x, position.y, 14 / viewScale, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.strokeRect(position.x - 16 / viewScale, position.y - 10 / viewScale, 32 / viewScale, 20 / viewScale);
      }
      context.setLineDash([]);
      context.font = `bold ${11 / viewScale}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      const confidenceSuffix = typeof candidate.confidence === "number" ? ` ${Math.round(candidate.confidence * 100)}%` : "";
      context.fillText(`${candidateTypeLabel(candidate.type)}${confidenceSuffix}`, position.x, labelAnchorY);
      context.restore();
    };

    openingCandidates.forEach((candidate) => drawCandidate(candidate, "opening"));
    fixtureCandidates.forEach((candidate) => drawCandidate(candidate, "fixture"));

    const drawRoboflowDetectionOverlays = () => {
      if (!detectionBoxes.length) return;

      const detectionColors = { DOOR: "#e11d48", WALL: "#7c3aed", WINDOW: "#a3b800" } as const;
      const wallOverlayBoxes = detectionBoxes.filter((detectionBox) => detectionBox.type === "WALL");
      const openingOverlayBoxes = detectionBoxes.filter((detectionBox) => detectionBox.type !== "WALL");
      const hasPostProcessedWall = wallOverlayBoxes.some((overlayBox) => overlayBox.variant === "postprocessed");
      const drawOverlayConfidenceLabel = (box: RoboflowDetectionOverlayBox["box"], confidence: number, color: string) => {
        const labelText = `${Math.round(confidence * 100)}%`;
        const fontSize = 11 / viewScale;
        context.font = `bold ${fontSize}px Arial, sans-serif`;
        const labelWidth = context.measureText(labelText).width + 8 / viewScale;
        const labelHeight = fontSize + 6 / viewScale;
        context.fillStyle = color;
        context.fillRect(box.x1, box.y1 - labelHeight, labelWidth, labelHeight);
        context.fillStyle = "#ffffff";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(labelText, box.x1 + 4 / viewScale, box.y1 - labelHeight / 2);
      };
      const drawRawWallOverlayBox = (overlayBox: RoboflowDetectionOverlayBox) => {
        const box = normalizeOverlayBox(overlayBox.box);
        const color = detectionColors.WALL;
        context.strokeStyle = color;
        context.lineWidth = 1.8 / viewScale;
        context.globalAlpha = 0.82;
        context.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
        context.globalAlpha = 1;
        drawOverlayConfidenceLabel(box, overlayBox.confidence, color);
      };
      const drawMergedWallOverlayBoxes = () => {
        // 벽 몸통은 항상 '살아있는' walls 상태에서 박스를 만든다 — 정적 overlay 박스로
        // 그리면 벽 편집(이동/길이 조절/삭제)이 화면에 반영되지 않고, 벽을 전부 지워도
        // 유령 벽이 남는다. (정적 박스 재정렬 폴백은 같은 이유로 제거했다 — detectionBoxes에는
        // 이미 후처리 핸들러가 정렬을 끝낸 박스가 저장되므로 렌더러에서 재계산할 이유도 없다.)
        const wallBoxes = walls
          .filter((wall) => wall.source === "roboflow-postprocessed")
          .map((wall) => {
            const thickness = Math.max(4, Number(wall.thicknessPx ?? wall.depthPx ?? 0) || 12);
            const wallHorizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
            const centerCross = wallHorizontal ? (wall.start.y + wall.end.y) / 2 : (wall.start.x + wall.end.x) / 2;
            return wallHorizontal
              ? {
                  x1: Math.min(wall.start.x, wall.end.x),
                  x2: Math.max(wall.start.x, wall.end.x),
                  y1: centerCross - thickness / 2,
                  y2: centerCross + thickness / 2
                }
              : {
                  x1: centerCross - thickness / 2,
                  x2: centerCross + thickness / 2,
                  y1: Math.min(wall.start.y, wall.end.y),
                  y2: Math.max(wall.start.y, wall.end.y)
                };
          })
          .filter((box) => box.x2 - box.x1 > 0 && box.y2 - box.y1 > 0);
        if (!wallBoxes.length) return;

        // 문/창문 박스: 벽을 이 자리에서 갈라(gap) 분리한다.
        // 정적(인식 시점) 박스 + 살아있는 후보 위치 둘 다 뚫는다 — 문의 진짜 틈이 벽에
        // 남는 것처럼, 창문도 빼내거나 옮겨도 원래 자리 틈은 메워지지 않고(정적),
        // 옮긴 새 자리도 뚫린다(live). 문/창문 편집감 통일.
        const liveOpeningCutBoxes = openingCandidates
          .filter((candidate) => candidate.status !== "REJECTED" && candidate.boxPx && candidate.position)
          .map((candidate) => {
            const box = candidate.boxPx!;
            const position = candidate.position!;
            return {
              x1: position.x - box.width / 2,
              x2: position.x + box.width / 2,
              y1: position.y - box.height / 2,
              y2: position.y + box.height / 2
            };
          });
        // 후처리 직후엔 후보가 fitted 박스에 동기화돼 정적·live가 같은 박스 2벌이 된다 —
        // 셀 래스터화 비용이 배로 뛰지 않게 live와 사실상 같은 정적 박스는 걸러낸다.
        const staticCutBoxes = openingOverlayBoxes
          .map((overlayBox) => normalizeOverlayBox(overlayBox.box))
          .filter(
            (box) =>
              !liveOpeningCutBoxes.some(
                (live) =>
                  Math.abs(live.x1 - box.x1) < 2 && Math.abs(live.x2 - box.x2) < 2 && Math.abs(live.y1 - box.y1) < 2 && Math.abs(live.y2 - box.y2) < 2
              )
          );
        const openingCutBoxes = [...staticCutBoxes, ...liveOpeningCutBoxes];

        const xCoordinates = [...new Set([...wallBoxes, ...openingCutBoxes].flatMap((box) => [box.x1, box.x2]))].sort((left, right) => left - right);
        const yCoordinates = [...new Set([...wallBoxes, ...openingCutBoxes].flatMap((box) => [box.y1, box.y2]))].sort((left, right) => left - right);
        const coveredWallCells = new Set<string>();
        const cellKey = (xIndex: number, yIndex: number) => `${xIndex}:${yIndex}`;

        for (let yIndex = 0; yIndex < yCoordinates.length - 1; yIndex += 1) {
          for (let xIndex = 0; xIndex < xCoordinates.length - 1; xIndex += 1) {
            const centerX = (xCoordinates[xIndex] + xCoordinates[xIndex + 1]) / 2;
            const centerY = (yCoordinates[yIndex] + yCoordinates[yIndex + 1]) / 2;
            const insideWall = wallBoxes.some((box) => centerX >= box.x1 && centerX <= box.x2 && centerY >= box.y1 && centerY <= box.y2);
            const insideOpening = openingCutBoxes.some((box) => centerX >= box.x1 && centerX <= box.x2 && centerY >= box.y1 && centerY <= box.y2);
            if (insideWall && !insideOpening) {
              coveredWallCells.add(cellKey(xIndex, yIndex));
            }
          }
        }

        const isCovered = (xIndex: number, yIndex: number) => coveredWallCells.has(cellKey(xIndex, yIndex));
        const hasRawWall = wallOverlayBoxes.some((overlayBox) => overlayBox.variant === "raw");
        context.strokeStyle = detectionColors.WALL;
        context.lineWidth = hasPostProcessedWall ? 3 / viewScale : hasRawWall ? 1.8 / viewScale : 2.5 / viewScale;
        context.lineCap = "butt";
        context.lineJoin = "miter";
        context.globalAlpha = hasRawWall && !hasPostProcessedWall ? 0.38 : 0.92;
        context.beginPath();
        coveredWallCells.forEach((key) => {
          const [xIndex, yIndex] = key.split(":").map(Number);
          const x1 = xCoordinates[xIndex];
          const x2 = xCoordinates[xIndex + 1];
          const y1 = yCoordinates[yIndex];
          const y2 = yCoordinates[yIndex + 1];

          if (!isCovered(xIndex, yIndex - 1)) {
            context.moveTo(x1, y1);
            context.lineTo(x2, y1);
          }
          if (!isCovered(xIndex + 1, yIndex)) {
            context.moveTo(x2, y1);
            context.lineTo(x2, y2);
          }
          if (!isCovered(xIndex, yIndex + 1)) {
            context.moveTo(x2, y2);
            context.lineTo(x1, y2);
          }
          if (!isCovered(xIndex - 1, yIndex)) {
            context.moveTo(x1, y2);
            context.lineTo(x1, y1);
          }
        });
        context.stroke();
        context.globalAlpha = 1;
      };
      // 문/창문 박스는 그리지 않는다 — 크기를 가진 후보 막대(drawCandidate)가 같은 정보를
      // 편집 가능한 형태로 보여준다. openingOverlayBoxes는 벽 gap 계산에만 쓴다.
      context.save();
      if (hasPostProcessedWall) drawMergedWallOverlayBoxes();
      else wallOverlayBoxes.forEach(drawRawWallOverlayBox);
      context.restore();
    };

    const drawPrintedDimensionOverlays = () => {
      if (!printedDimensionChips.length || !backgroundImageFrame) return;
      const reliablyPlacedDimensions = printedDimensionChips.filter(hasReliableDimensionPlacement);
      if (!reliablyPlacedDimensions.length) return;

      const toCanvasPoint = (x: number, y: number) => ({
        x: backgroundImageFrame.x + (x / 1000) * backgroundImageFrame.width,
        y: backgroundImageFrame.y + (y / 1000) * backgroundImageFrame.height
      });
      // AI targetLine 좌표는 신뢰하지 않는다. 측정 구간은 확정/후보 축척으로
      // 치수값을 역산한 길이를 그리되, 벽 union에 스냅해 도면과 정렬시킨다.
      const overlayPixelToMmRatio = isScaleSet ? pixelToMmRatio : printedDimensionScale?.pixelToMmRatio ?? null;
      const overlayWallUnion = computeWallUnionBox(detectionBoxes);
      const spanExtentAlongAxis = (center: number, length: number, unionMin: number | null, unionMax: number | null) => {
        if (unionMin === null || unionMax === null || unionMax <= unionMin) {
          return { max: center + length / 2, min: center - length / 2 };
        }
        const unionSpan = unionMax - unionMin;
        // 전체 치수(벽 union 폭/높이와 6% 이내)는 벽 끝~끝에 정확히 정렬한다.
        if (Math.abs(length - unionSpan) / unionSpan <= 0.06) return { max: unionMax, min: unionMin };
        // 부분 치수는 도면 관례대로 가까운 쪽 벽 끝에서 시작하게 앵커한다.
        // (라벨이 중심선보다 앞이면 시작 벽, 뒤면 끝 벽 기준)
        if (center <= (unionMin + unionMax) / 2) return { max: unionMin + length, min: unionMin };

        return { max: unionMax, min: unionMax - length };
      };
      // 도면의 실제 범위: 검출된 전체 치수선의 양 끝(=벽 외곽면)이 1순위,
      // 없으면 Roboflow 벽 union으로 폴백한다.
      const planExtentForAxis = (axis: Exclude<DimensionAxis, null>) => {
        const unionMin = axis === "horizontal" ? overlayWallUnion?.x1 ?? null : overlayWallUnion?.y1 ?? null;
        const unionMax = axis === "horizontal" ? overlayWallUnion?.x2 ?? null : overlayWallUnion?.y2 ?? null;
        const axisChips = reliablyPlacedDimensions.filter(
          (chip) => chip.axis === axis && printedDimensionLineSpans.get(chip.id)?.axis === axis
        );
        if (axisChips.length) {
          const largest = axisChips.reduce((best, chip) => (chip.realLengthMm > best.realLengthMm ? chip : best));
          const span = printedDimensionLineSpans.get(largest.id)!;
          const startOnLine = axis === "horizontal" ? toCanvasPoint(span.min, span.cross).x : toCanvasPoint(span.cross, span.min).y;
          const endOnLine = axis === "horizontal" ? toCanvasPoint(span.max, span.cross).x : toCanvasPoint(span.cross, span.max).y;
          const unionSpan = unionMin !== null && unionMax !== null ? unionMax - unionMin : null;
          if (!unionSpan || Math.abs(endOnLine - startOnLine - unionSpan) / unionSpan <= 0.1) {
            return { max: endOnLine, min: startOnLine };
          }
        }

        return unionMin !== null && unionMax !== null ? { max: unionMax, min: unionMin } : null;
      };
      const planExtents = { horizontal: planExtentForAxis("horizontal"), vertical: planExtentForAxis("vertical") };

      // 중첩 치수줄 처리: 같은 변에 전체줄/구간줄이 여러 겹 있으므로, 합산 체인을 풀기 전에
      // 라벨의 수직 위치(perpCoord)로 먼저 "줄"을 갈라낸 뒤 각 줄 안에서만 합=전체 체인을 푼다.
      // (solveDimensionRowChains가 클러스터링+체인을 담당. 여기선 좌표 변환만 한다.)
      const chainExtentByChip = new Map<PrintedDimensionChip, { max: number; min: number }>();
      if (overlayPixelToMmRatio) {
        for (const axis of ["horizontal", "vertical"] as const) {
          const planExtent = planExtents[axis];
          if (!planExtent) continue;
          const unionSpanMm = (planExtent.max - planExtent.min) * overlayPixelToMmRatio;
          if (unionSpanMm <= 0) continue;
          const axisChips = reliablyPlacedDimensions.filter((chip) => chip.axis === axis && chip.boundingBox);
          if (axisChips.length < 2) continue;
          const chipById = new Map(axisChips.map((chip) => [chip.id, chip]));
          // 줄 간격 임계값 = 라벨의 "축에 수직인 크기" 중앙값 기준. 세로 치수는 라벨이 90° 회전이라
          // height가 텍스트 길이가 되므로, 가로는 height·세로는 width를 써야 컬럼이 안 뭉친다.
          const perpSizes = axisChips
            .map((chip) => (axis === "horizontal" ? chip.boundingBox!.height : chip.boundingBox!.width))
            .sort((a, b) => a - b);
          const medianPerpSize = perpSizes[Math.floor(perpSizes.length / 2)] || 20;
          const perpTolerance = Math.max(12, medianPerpSize * 1.2);
          const layoutInput = axisChips.map((chip) => {
            const box = chip.boundingBox!;
            return {
              alongCoord: axis === "horizontal" ? box.x + box.width / 2 : box.y + box.height / 2,
              id: chip.id,
              perpCoord: axis === "horizontal" ? box.y + box.height / 2 : box.x + box.width / 2,
              realLengthMm: chip.realLengthMm
            };
          });
          const layout = solveDimensionRowChains(layoutInput, unionSpanMm, { perpTolerance }) as Map<string, { endMm: number; startMm: number }>;
          layout.forEach((offset, chipId) => {
            const chip = chipById.get(chipId);
            if (!chip) return;
            // mm 오프셋(도면 시작 기준) → 캔버스 좌표. planExtent.min이 외벽 안쪽면.
            chainExtentByChip.set(chip, {
              max: planExtent.min + offset.endMm / overlayPixelToMmRatio,
              min: planExtent.min + offset.startMm / overlayPixelToMmRatio
            });
          });
        }
      }
      const drawDimensionTargetLine = (dimension: PrintedDimensionChip, center: Point, canvasLength: number, axis: Exclude<DimensionAxis, null>) => {
        // 1순위: 원본에서 검출한 인쇄 치수선 위에 그대로 얹는다.
        // (역산 길이와 25% 넘게 어긋나면 엉뚱한 선을 잡은 것이므로 버린다)
        let extent: { max: number; min: number } | null = null;
        let crossCoord = axis === "horizontal" ? center.y : center.x;
        const detectedSpan = printedDimensionLineSpans.get(dimension.id);
        if (detectedSpan && detectedSpan.axis === axis) {
          const startPointOnLine =
            axis === "horizontal" ? toCanvasPoint(detectedSpan.min, detectedSpan.cross) : toCanvasPoint(detectedSpan.cross, detectedSpan.min);
          const endPointOnLine =
            axis === "horizontal" ? toCanvasPoint(detectedSpan.max, detectedSpan.cross) : toCanvasPoint(detectedSpan.cross, detectedSpan.max);
          const detectedExtent =
            axis === "horizontal" ? { max: endPointOnLine.x, min: startPointOnLine.x } : { max: endPointOnLine.y, min: startPointOnLine.y };
          if (Math.abs(detectedExtent.max - detectedExtent.min - canvasLength) / canvasLength <= 0.25) {
            extent = detectedExtent;
            crossCoord = axis === "horizontal" ? startPointOnLine.y : startPointOnLine.x;
          }
        }
        if (!extent) {
          extent =
            chainExtentByChip.get(dimension) ??
            (axis === "horizontal"
              ? spanExtentAlongAxis(center.x, canvasLength, planExtents.horizontal?.min ?? null, planExtents.horizontal?.max ?? null)
              : spanExtentAlongAxis(center.y, canvasLength, planExtents.vertical?.min ?? null, planExtents.vertical?.max ?? null));
        }
        const start = axis === "horizontal" ? { x: extent.min, y: crossCoord } : { x: crossCoord, y: extent.min };
        const end = axis === "horizontal" ? { x: extent.max, y: crossCoord } : { x: crossCoord, y: extent.max };
        const nx = axis === "horizontal" ? 0 : 1;
        const ny = axis === "horizontal" ? 1 : 0;
        const tick = 10 / viewScale;

        context.save();
        context.strokeStyle = "#2176ff";
        context.lineWidth = 2 / viewScale;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        for (const point of [start, end]) {
          context.beginPath();
          context.moveTo(point.x - nx * tick, point.y - ny * tick);
          context.lineTo(point.x + nx * tick, point.y + ny * tick);
          context.stroke();
        }
        context.restore();

        // 라벨은 실제로 그린 구간의 중앙에 붙인다.
        return axis === "horizontal"
          ? { x: (extent.min + extent.max) / 2, y: crossCoord }
          : { x: crossCoord, y: (extent.min + extent.max) / 2 };
      };

      context.save();
      context.font = `bold ${12 / viewScale}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      const placedLabelRects: Array<{ height: number; width: number; x: number; y: number }> = [];
      const rectsOverlap = (a: { height: number; width: number; x: number; y: number }, b: { height: number; width: number; x: number; y: number }) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

      reliablyPlacedDimensions.forEach((dimension) => {
        const box = dimension.boundingBox;
        let labelCenter = box
          ? toCanvasPoint(box.x + box.width / 2, box.y + box.height / 2)
          : dimension.targetLine
            ? toCanvasPoint((dimension.targetLine.x1 + dimension.targetLine.x2) / 2, (dimension.targetLine.y1 + dimension.targetLine.y2) / 2)
            : null;
        if (!labelCenter) return;
        if (overlayPixelToMmRatio && dimension.axis) {
          labelCenter = drawDimensionTargetLine(dimension, labelCenter, dimension.realLengthMm / overlayPixelToMmRatio, dimension.axis);
        }
        const text = dimension.text;
        const paddingX = 7 / viewScale;
        const paddingY = 4 / viewScale;
        const labelWidth = context.measureText(text).width + paddingX * 2;
        const labelHeight = 20 / viewScale;
        const labelRect = { height: labelHeight, width: labelWidth, x: labelCenter.x - labelWidth / 2, y: labelCenter.y - labelHeight / 2 };
        // 이미 그린 라벨과 겹치면 아래로 밀어낸다.
        for (let attempt = 0; attempt < 6 && placedLabelRects.some((placed) => rectsOverlap(placed, labelRect)); attempt += 1) {
          labelRect.y += labelHeight + 3 / viewScale;
        }
        placedLabelRects.push(labelRect);
        const labelTextCenter = { x: labelRect.x + labelWidth / 2, y: labelRect.y + labelHeight / 2 };

        context.globalAlpha = 0.92;
        context.fillStyle = "#ffffff";
        context.fillRect(labelRect.x, labelRect.y, labelWidth, labelHeight);
        context.globalAlpha = 1;
        context.strokeStyle = "#2176ff";
        context.lineWidth = 1.5 / viewScale;
        context.strokeRect(labelRect.x, labelRect.y, labelWidth, labelHeight);
        context.fillStyle = "#0f2f61";
        context.fillText(text, labelTextCenter.x, labelTextCenter.y + paddingY / 4);
      });

      context.restore();
    };

    drawRoboflowDetectionOverlays();
    drawPrintedDimensionOverlays();

    // 확인용: 선택한 벽 조각을 밝은 파란색으로 채워 강조.
    if (selectedWallRunRects) {
      context.save();
      context.fillStyle = "rgba(0, 102, 255, 0.4)";
      for (const rect of selectedWallRunRects) {
        context.fillRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
      }
      context.restore();
    }

    // 방 내부 재기 측정선.
    if (tool === "interior" && interiorMeasureStart && interiorMeasureEnd) {
      const measureStart = interiorMeasureStart;
      const measureEnd = interiorMeasureEnd;
      const lengthPx = interiorMeasurePx > 0 ? interiorMeasurePx : Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y);
      context.save();
      context.strokeStyle = "#e6007a";
      context.lineWidth = 3 / viewScale;
      context.beginPath();
      context.moveTo(measureStart.x, measureStart.y);
      context.lineTo(measureEnd.x, measureEnd.y);
      context.stroke();
      for (const endpoint of [measureStart, measureEnd]) {
        context.beginPath();
        context.arc(endpoint.x, endpoint.y, 5 / viewScale, 0, Math.PI * 2);
        context.fillStyle = "#e6007a";
        context.fill();
      }
      const label = isScaleSet ? `${Math.round(lengthPx * pixelToMmRatio)}mm` : `${Math.round(lengthPx)}px`;
      context.fillStyle = "#e6007a";
      context.font = `bold ${13 / viewScale}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(label, (measureStart.x + measureEnd.x) / 2, (measureStart.y + measureEnd.y) / 2 - 6 / viewScale);
      context.restore();
    }

    // 방 내부 재기: 커서가 코너에 닿으면 동그라미 + 짧은 십자선.
    if (tool === "interior" && interiorHoverSnap) {
      const cross = 16 / viewScale;
      context.save();
      context.strokeStyle = "rgba(230, 0, 122, 0.45)";
      context.lineWidth = 1 / viewScale;
      context.beginPath();
      context.moveTo(interiorHoverSnap.x - cross, interiorHoverSnap.y);
      context.lineTo(interiorHoverSnap.x + cross, interiorHoverSnap.y);
      context.moveTo(interiorHoverSnap.x, interiorHoverSnap.y - cross);
      context.lineTo(interiorHoverSnap.x, interiorHoverSnap.y + cross);
      context.stroke();
      context.beginPath();
      context.arc(interiorHoverSnap.x, interiorHoverSnap.y, 9 / viewScale, 0, Math.PI * 2);
      context.strokeStyle = "#e6007a";
      context.lineWidth = 2.5 / viewScale;
      context.fillStyle = "rgba(230, 0, 122, 0.22)";
      context.fill();
      context.stroke();
      context.restore();
    }

    if (isDrawing && startPoint && currentPoint) drawWall({ id: "draft", start: startPoint, end: currentPoint }, "draft");
    if (isSelectingEraseArea && eraseAreaStart && eraseAreaEnd) {
      drawWall({ id: "erase-draft", start: eraseAreaStart, end: eraseAreaEnd }, "erase");
    }

    context.restore();
  }, [
    backgroundOpacity,
    cachedBackgroundImage,
    currentPoint,
    detectionBoxes,
    eraseAreaEnd,
    eraseAreaStart,
    gridSpec,
    hoveredWall,
    hiddenWallIds,
    isDrawing,
    isScaleSet,
    isSelectingEraseArea,
    interiorMeasureStart,
    interiorMeasureEnd,
    interiorMeasurePx,
    interiorHoverSnap,
    fixtureCandidates,
    hoveredCandidateId,
    openingCandidates,
    partialEraserSelectedWall,
    pixelToMmRatio,
    printedDimensionChips,
    printedDimensionLineSpans,
    printedDimensionScale,
    selectedCandidate,
    selectedWallRunRects,
    selectedWall,
    startPoint,
    tool,
    uploadedImage,
    viewOffset,
    viewScale,
    walls
  ]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    if (!uploadedImage) {
      setCachedBackgroundImage(null);
      return;
    }

    let cancelled = false;
    loadImage(uploadedImage).then((image) => {
      if (!cancelled) setCachedBackgroundImage(image);
    });

    return () => {
      cancelled = true;
    };
  }, [uploadedImage]);

  function getCanvasCoordinates(event: React.MouseEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - rect.width / 2) / viewScale - viewOffset.x,
      y: (event.clientY - rect.top - rect.height / 2) / viewScale - viewOffset.y
    };
  }

  // 벽의 방향·중심선·두께 — 스냅/렌더링 전반에서 공유하는 기본 기하.
  // (두께 최소값은 용도마다 달라 raw 값을 돌려주고 호출부에서 clamp한다.)
  function wallGeometryOf(wall: Wall) {
    const horizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
    const cross = horizontal ? (wall.start.y + wall.end.y) / 2 : (wall.start.x + wall.end.x) / 2;
    const thickness = Number(wall.thicknessPx ?? wall.depthPx ?? 0) || 12;
    return { cross, horizontal, thickness };
  }

  function findClosestWall(point: Point, maxDistance: number) {
    return walls.reduce<{ distance: number; wall: Wall | null }>(
      (closest, wall) => {
        const distance = distanceToWall(point, wall);
        return distance < closest.distance && distance < maxDistance ? { distance, wall } : closest;
      },
      { distance: Infinity, wall: null }
    ).wall;
  }

  // 중심선이 아니라 벽 '표면' 기준 거리로 가장 가까운 벽을 찾는다 — 고정 반경을 쓰면
  // 두꺼운 벽은 겉면에 닿아도 중심선이 멀어 못 잡는다. margin 이내가 없으면 null.
  function findClosestWallBySurface(point: Point, margin: number) {
    let best: { surfaceDistance: number; wall: Wall } | null = null;
    for (const wall of walls) {
      const thickness = Math.max(8, wallGeometryOf(wall).thickness);
      const surfaceDistance = distanceToWall(point, wall) - thickness / 2;
      if (surfaceDistance <= margin && (!best || surfaceDistance < best.surfaceDistance)) {
        best = { surfaceDistance, wall };
      }
    }
    return best;
  }

  // 벽을 통째로 옮길 때, 같은 방향 벽의 중심선(축선)이 가까우면 그 값으로 정렬한다.
  // 어긋난 벽 조각들을 한 줄로 맞추는 용도.
  function findWallCenterlineSnap(horizontal: boolean, cross: number, tolerance: number, excludeWallId?: Wall["id"]) {
    let best: number | null = null;
    for (const wall of walls) {
      if (excludeWallId !== undefined && String(wall.id) === String(excludeWallId)) continue;
      const geometry = wallGeometryOf(wall);
      if (geometry.horizontal !== horizontal) continue;
      const distance = Math.abs(geometry.cross - cross);
      if (distance <= tolerance && (best === null || distance < Math.abs(best - cross))) best = geometry.cross;
    }
    return best;
  }

  function getWallDragMode(wall: Wall, point: Point): WallDragMode {
    const startDistance = Math.hypot(point.x - wall.start.x, point.y - wall.start.y);
    const endDistance = Math.hypot(point.x - wall.end.x, point.y - wall.end.y);
    const handleRadius = WALL_EDIT_HANDLE_RADIUS / viewScale;

    if (startDistance <= handleRadius) return "resize-start";
    if (endDistance <= handleRadius) return "resize-end";

    return "move";
  }

  function updateDraggedWall(operation: WallDragOperation, point: Point) {
    const original = operation.originalWall;
    const horizontal = Math.abs(original.end.x - original.start.x) >= Math.abs(original.end.y - original.start.y);
    // 벽 편집 스냅 허용오차 — 후보(36px)보다 좁게. 어긋난 조각 정리가 목적이라 정밀하게.
    const snapTolerance = Math.max(14, 14 / viewScale);
    let nextWall: Wall;

    if (operation.mode === "move") {
      nextWall = moveWall(original, {
        x: point.x - operation.originPoint.x,
        y: point.y - operation.originPoint.y
      }) as Wall;
      // 1) 축선 정렬: 같은 방향 벽의 중심선이 가까우면 줄을 맞춘다.
      const cross = horizontal ? (nextWall.start.y + nextWall.end.y) / 2 : (nextWall.start.x + nextWall.end.x) / 2;
      const crossTarget = findWallCenterlineSnap(horizontal, cross, snapTolerance, operation.wallId);
      const crossShift = crossTarget === null ? 0 : crossTarget - cross;
      // 2) 끝점 정렬: 양 끝 중 다른 벽 끝점·면에 가까운 쪽을 착 붙인다(길이 유지, 통째로 이동).
      const alignedCross = cross + crossShift;
      let alongShift = 0;
      let bestAlongDistance = Infinity;
      for (const endpoint of [nextWall.start, nextWall.end]) {
        const edgeValue = horizontal ? endpoint.x : endpoint.y;
        const target = findWallEdgeSnapTarget(horizontal, alignedCross, edgeValue, {
          excludeWallId: operation.wallId,
          tolerance: snapTolerance
        });
        if (target === null) continue;
        const shift = target - edgeValue;
        if (Math.abs(shift) < bestAlongDistance) {
          bestAlongDistance = Math.abs(shift);
          alongShift = shift;
        }
      }
      const dx = horizontal ? alongShift : crossShift;
      const dy = horizontal ? crossShift : alongShift;
      if (dx !== 0 || dy !== 0) {
        nextWall = {
          ...nextWall,
          start: { x: nextWall.start.x + dx, y: nextWall.start.y + dy },
          end: { x: nextWall.end.x + dx, y: nextWall.end.y + dy }
        };
      }
    } else {
      // 길이 조절: 벽의 축을 유지한다 — 마우스를 비스듬히 움직여도 벽이 기울지 않는다.
      const movingKey = operation.mode === "resize-start" ? "start" : "end";
      const fixedKey = operation.mode === "resize-start" ? "end" : "start";
      const cross = horizontal ? (original.start.y + original.end.y) / 2 : (original.start.x + original.end.x) / 2;
      let movingValue = horizontal ? point.x : point.y;
      // 다른 벽 끝점·직교 옆벽 면에 자석 스냅.
      const target = findWallEdgeSnapTarget(horizontal, cross, movingValue, {
        excludeWallId: operation.wallId,
        tolerance: snapTolerance
      });
      if (target !== null) movingValue = target;
      // 벽이 뒤집히거나 0길이가 되지 않게 최소 길이 확보.
      const fixedValue = horizontal ? original[fixedKey].x : original[fixedKey].y;
      const direction = Math.sign(movingValue - fixedValue) || Math.sign((horizontal ? original[movingKey].x : original[movingKey].y) - fixedValue) || 1;
      if (Math.abs(movingValue - fixedValue) < 8) movingValue = fixedValue + direction * 8;
      nextWall = {
        ...original,
        [movingKey]: horizontal ? { x: movingValue, y: original[movingKey].y } : { x: original[movingKey].x, y: movingValue }
      } as Wall;
    }

    setWalls((currentWalls) => currentWalls.map((wall) => (String(wall.id) === String(operation.wallId) ? nextWall : wall)));
    setSelectedWall(nextWall);
  }

  // 클릭 지점이 든 "벽 조각"(문/창문 gap으로 끊긴 연결 구간)의 사각들을 찾는다. 확인용.
  function findWallRunRectsAt(point: Point): Array<{ x1: number; x2: number; y1: number; y2: number }> | null {
    const wallBoxes = detectionBoxes.filter((detectionBox) => detectionBox.type === "WALL").map((detectionBox) => normalizeOverlayBox(detectionBox.box));
    if (!wallBoxes.length) return null;
    const openingBoxes = detectionBoxes.filter((detectionBox) => detectionBox.type !== "WALL").map((detectionBox) => normalizeOverlayBox(detectionBox.box));

    const xs = [...new Set([...wallBoxes, ...openingBoxes].flatMap((box) => [box.x1, box.x2]))].sort((left, right) => left - right);
    const ys = [...new Set([...wallBoxes, ...openingBoxes].flatMap((box) => [box.y1, box.y2]))].sort((left, right) => left - right);
    const nx = xs.length - 1;
    const ny = ys.length - 1;
    if (nx <= 0 || ny <= 0) return null;

    const covered: boolean[][] = [];
    for (let xi = 0; xi < nx; xi += 1) {
      covered[xi] = [];
      for (let yi = 0; yi < ny; yi += 1) {
        const cx = (xs[xi] + xs[xi + 1]) / 2;
        const cy = (ys[yi] + ys[yi + 1]) / 2;
        const inWall = wallBoxes.some((box) => cx >= box.x1 && cx <= box.x2 && cy >= box.y1 && cy <= box.y2);
        const inOpening = openingBoxes.some((box) => cx >= box.x1 && cx <= box.x2 && cy >= box.y1 && cy <= box.y2);
        covered[xi][yi] = inWall && !inOpening;
      }
    }

    let startXi = -1;
    let startYi = -1;
    for (let xi = 0; xi < nx; xi += 1) if (point.x >= xs[xi] && point.x <= xs[xi + 1]) { startXi = xi; break; }
    for (let yi = 0; yi < ny; yi += 1) if (point.y >= ys[yi] && point.y <= ys[yi + 1]) { startYi = yi; break; }
    if (startXi < 0 || startYi < 0 || !covered[startXi][startYi]) return null;

    const visited: boolean[][] = covered.map((column) => column.map(() => false));
    const stack: Array<[number, number]> = [[startXi, startYi]];
    visited[startXi][startYi] = true;
    const componentCells: Array<[number, number]> = [];
    while (stack.length) {
      const [xi, yi] = stack.pop() as [number, number];
      componentCells.push([xi, yi]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = xi + dx;
        const ay = yi + dy;
        if (ax >= 0 && ax < nx && ay >= 0 && ay < ny && !visited[ax][ay] && covered[ax][ay]) {
          visited[ax][ay] = true;
          stack.push([ax, ay]);
        }
      }
    }

    return componentCells.map(([xi, yi]) => ({ x1: xs[xi], x2: xs[xi + 1], y1: ys[yi], y2: ys[yi + 1] }));
  }

  function findClosestCandidate(candidates: FloorPlanCandidate[], point: Point, maxDistance = 28) {
    return candidates.reduce<{ candidate: FloorPlanCandidate | null; distance: number }>(
      (closest, candidate) => {
        const position = candidate.position ?? { x: 0, y: 0 };
        const distance = Math.hypot(position.x - point.x, position.y - point.y);
        return distance < closest.distance && distance <= maxDistance ? { candidate, distance } : closest;
      },
      { candidate: null, distance: Infinity }
    ).candidate;
  }

  function removeWallById(wallId: string | number) {
    setWalls((currentWalls) => currentWalls.filter((wall) => String(wall.id) !== String(wallId)));
    setHiddenWallIds((currentHidden) => {
      const nextHidden = new Set(currentHidden);
      nextHidden.delete(String(wallId));
      return nextHidden;
    });
    if (String(selectedWall?.id ?? "") === String(wallId)) setSelectedWall(null);
    if (String(partialEraserSelectedWall?.id ?? "") === String(wallId)) setPartialEraserSelectedWall(null);
  }

  function hideWallById(wallId: string | number) {
    setHiddenWallIds((currentHidden) => new Set(currentHidden).add(String(wallId)));
    if (String(selectedWall?.id ?? "") === String(wallId)) setSelectedWall(null);
    setUploadStatus(`벽 ${wallId} 숨김`);
  }

  function partiallyEraseWallByRatio(wallId: string | number, eraseRatio: number) {
    setWalls((currentWalls) =>
      currentWalls.flatMap((wall) => (String(wall.id) === String(wallId) ? splitWallByRatio(wall, eraseRatio) : [wall]))
    );
    setHiddenWallIds((currentHidden) => {
      const nextHidden = new Set(currentHidden);
      nextHidden.delete(String(wallId));
      return nextHidden;
    });
    setSelectedWall(null);
    setPartialEraserSelectedWall(null);
    setUploadStatus(`벽 ${wallId} 부분 삭제`);
  }

  function handle3DWallPointerDown(wallData: WheretoputWall3D, event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const wall = wallData.original2D;
    const wallId = wall?.id ?? wallData.wall_id;

    if (tool === "furniture" && (pendingFurniture || selectedFurnitureId)) {
      placeFurnitureAtPoint(event.point);
      return;
    }

    if (tool === "select" || tool === "wall" || tool === "none") {
      setSelectedWall((currentWall) => (String(currentWall?.id ?? "") === String(wallId) ? null : wall ?? null));
      setUploadStatus(`벽 ${wallId} 선택`);
      return;
    }

    if (tool === "eraser") {
      removeWallById(wallId);
      setUploadStatus(`벽 ${wallId} 삭제`);
      return;
    }

    if (tool === "hide") {
      hideWallById(wallId);
      return;
    }

    if (tool === "partial_eraser" && wall) {
      const localPoint = event.object.worldToLocal(event.point.clone());
      const eraseRatio = Math.max(0.05, Math.min(0.95, localPoint.x / wallData.dimensions.width + 0.5));
      partiallyEraseWallByRatio(wall.id, eraseRatio);
    }
  }

  function handleFurnitureSelect(item: FurnitureCatalogItem) {
    // 재편집 중이던 가구가 있으면 원위치로 되돌려 놓고 새 가구를 집는다.
    restorePendingFurnitureOrigin();
    const previewFurniture = createFurnitureModel(item);
    pendingFurniturePlacedOnceRef.current = false;
    setPendingFurniture(previewFurniture);
    setSelectedFurnitureId(null);
    setSelectedWall(null);
    setTool("furniture");
    switchViewMode("3d");
    setUploadStatus(`${item.name} 배치 위치를 3D 바닥에서 클릭`);
  }

  function handle3DFloorPointerDown(event: ThreeEvent<PointerEvent>) {
    // 우클릭/휠클릭은 카메라 조작용 — 좌클릭일 때만 가구를 옮긴다.
    if (event.button !== 0) return;
    if (tool !== "furniture") return;
    event.stopPropagation();
    if (!pendingFurniture) {
      setSelectedFurnitureId(null);
      return;
    }
    placeFurnitureAtPoint(event.point);
  }

  function handle3DFloorPointerMove(event: ThreeEvent<PointerEvent>) {
    if (!pendingFurniture) return;
    placeFurnitureAtPoint(event.point);
  }

  function placeFurnitureAtPoint(point: { x: number; z: number }) {
    if (!pendingFurniture) return;

    // 카탈로그에서 갓 꺼낸 가구의 현재 위치(원점)는 이동 경로가 아니다 —
    // 첫 배치는 벽 통과 검사를 끄고, 그 뒤부터(드래그) 경로 기준으로 벽에 막는다.
    const nextFurniture = moveFurnitureDraftToPoint(pendingFurniture, point, roomWalls3D, {
      ignoreCrossing: !pendingFurniturePlacedOnceRef.current
    });
    pendingFurniturePlacedOnceRef.current = true;
    // 벽에 막혀 위치가 그대로면 상태 업데이트를 건너뛴다 — 드래그 중 무의미한 리렌더 방지.
    if (nextFurniture.position[0] === pendingFurniture.position[0] && nextFurniture.position[2] === pendingFurniture.position[2]) return;
    setPendingFurniture(nextFurniture);
    setUploadStatus(`${nextFurniture.name} 위치 지정, 배치완료를 눌러 확정하세요`);
  }

  // 배치된 가구를 다시 집어들었을 때(재편집) 취소하면 되돌릴 원래 상태.
  const pendingFurnitureOriginRef = useRef<PlacedFurniture | null>(null);
  // 집고 있는 가구가 사용자 위치를 한 번이라도 받았는지 — 첫 배치는 벽 통과 검사를 끄기 위함.
  const pendingFurniturePlacedOnceRef = useRef(false);

  function restorePendingFurnitureOrigin() {
    const original = pendingFurnitureOriginRef.current;
    if (!original) return null;
    pendingFurnitureOriginRef.current = null;
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, original]);
    return original;
  }

  function confirmPendingFurniturePlacement() {
    if (!pendingFurniture) return;

    pendingFurnitureOriginRef.current = null;
    const nextFurniture = finalizeFurnitureDraft(pendingFurniture, "landlord");
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, nextFurniture]);
    setPendingFurniture(null);
    setSelectedFurnitureId(nextFurniture.id);
    setUploadStatus(`${nextFurniture.name} 임대인 옵션 가구 배치 완료`);
  }

  function cancelPendingFurniturePlacement() {
    if (!pendingFurniture) return;

    const targetName = pendingFurniture.name;
    const restored = restorePendingFurnitureOrigin();
    setPendingFurniture(null);
    setSelectedFurnitureId(restored?.id ?? null);
    setUploadStatus(restored ? `${targetName} 원래 자리로 되돌림` : `${targetName} 배치 취소`);
  }

  function beginSelectedFurnitureMove() {
    if (!selectedFurnitureId) return;
    const furniture = placedFurnitures.find((item) => item.id === selectedFurnitureId);
    if (!furniture) return;

    pendingFurnitureOriginRef.current = furniture;
    pendingFurniturePlacedOnceRef.current = true;
    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((item) => item.id !== furniture.id));
    setPendingFurniture(reopenFurnitureDraft(furniture));
    setSelectedFurnitureId(null);
    setTool("furniture");
    setUploadStatus(`${furniture.name} 이동 중 — ✓로 배치를 완료하세요`);
  }

  function rotateSelectedFurniture(direction: -1 | 1) {
    if (!selectedFurnitureId) return;
    const furniture = placedFurnitures.find((item) => item.id === selectedFurnitureId);
    if (!furniture) return;

    setPlacedFurnitures((currentFurnitures) => currentFurnitures.map((item) => (
      item.id === furniture.id ? rotateFurnitureQuarterTurn(item, direction) : item
    )));
    setUploadStatus(`${furniture.name} ${direction < 0 ? "왼쪽" : "오른쪽"}으로 90도 회전`);
  }

  function deleteSelectedFurniture() {
    if (!selectedFurnitureId) return;
    const furniture = placedFurnitures.find((item) => item.id === selectedFurnitureId);
    if (!furniture) return;

    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((item) => item.id !== furniture.id));
    setSelectedFurnitureId(null);
    setUploadStatus(`${furniture.name} 삭제`);
  }

  function handleFurniturePointerDown(furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (pendingFurniture) {
      placeFurnitureAtPoint(event.point);
      return;
    }

    setSelectedFurnitureId(furniture.id);
    setSelectedWall(null);
    setTool("furniture");
    setUploadStatus(`${furniture.name} 선택 — 가구 위 아이콘으로 조작하세요`);
  }

  function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    const shouldPan = tool === "none" || event.button === 1 || event.button === 2;
    if (shouldPan) {
      event.preventDefault();
      setIsDragging(true);
      setLastPanPoint({ x: event.clientX, y: event.clientY });
      return;
    }

    const coords = getCanvasCoordinates(event);
    if (tool === "wall") {
      const snappedStart = snapEditorPoint(coords);
      setStartPoint(snappedStart);
      setCurrentPoint(snappedStart);
      setIsDrawing(true);
      return;
    }

    if (tool === "interior") {
      const snapped = snapToWallCorner(coords);
      // 첫 클릭: 시작점. 이미 완료된 선이 있으면 새로 시작.
      if (!interiorMeasureStart || interiorMeasurePx > 0) {
        setInteriorMeasureStart(snapped);
        setInteriorMeasureEnd(snapped);
        setInteriorMeasurePx(0);
        return;
      }
      // 둘째 클릭: 끝점 확정.
      const measuredPx = Math.hypot(snapped.x - interiorMeasureStart.x, snapped.y - interiorMeasureStart.y);
      setInteriorMeasureEnd(snapped);
      setInteriorMeasurePx(measuredPx);
      // 축척 재기 모드: 방 치수는 건드리지 않고, 실제 길이 입력만 기다린다.
      if (interiorMeasureTarget === "scale") {
        setUploadStatus(`${Math.round(measuredPx)}px 측정됨 — 오른쪽에 이 선의 실제 길이(mm)를 입력해 축척을 맞추세요`);
        return;
      }
      if (isScaleSet && measuredPx > 0) {
        const mm = Math.round(measuredPx * pixelToMmRatio);
        if (interiorMeasureTarget === "width") setRoomWidthMm(String(mm));
        else if (interiorMeasureTarget === "depth") setRoomDepthMm(String(mm));
        const measuredLabel = interiorMeasureTarget === "width" ? "가로" : "세로";
        // 연속 측정: 남은 치수가 비어 있으면 버튼을 다시 누를 필요 없이 자동으로 그 측정으로 넘어간다.
        const nextTarget =
          interiorMeasureTarget === "width" && !roomDepthMm ? ("depth" as const)
          : interiorMeasureTarget === "depth" && !roomWidthMm ? ("width" as const)
          : null;
        if (nextTarget) {
          setInteriorMeasureTarget(nextTarget);
          setUploadStatus(`${measuredLabel} ${mm}mm 측정됨 — 이어서 방 안쪽 '${nextTarget === "width" ? "가로" : "세로"}' 두 점을 클릭하세요`);
        } else {
          const widthMm = interiorMeasureTarget === "width" ? mm : Number(roomWidthMm);
          const depthMm = interiorMeasureTarget === "depth" ? mm : Number(roomDepthMm);
          const areaSuffix = widthMm > 0 && depthMm > 0 ? ` — 면적 ${((widthMm * depthMm) / 1_000_000).toFixed(2)}㎡` : "";
          setUploadStatus(`${measuredLabel} ${mm}mm 측정됨${areaSuffix}`);
        }
      } else {
        setUploadStatus(`${Math.round(measuredPx)}px 측정됨 — 축척이 없습니다. '축척 맞추기'로 먼저 1px당 mm를 정하세요`);
      }
      return;
    }

    if (tool === "select") {
      // 확인용: 클릭한 벽 조각(문/창문 gap으로 끊긴 구간)을 밝게 표시.
      const runRects = findWallRunRectsAt(coords);
      if (runRects) {
        setSelectedWallRunRects(runRects);
        setSelectedWall(null);
        setWallDragOperation(null);
        setUploadStatus("벽 조각 선택됨 — 문/창문 건너편을 클릭했을 때 따로 켜지면 분리된 것");
        return;
      }
      setSelectedWallRunRects(null);

      const closestWall = findClosestWall(coords, 30);
      if (!closestWall) {
        setSelectedWall(null);
        setWallDragOperation(null);
        return;
      }

      const mode = getWallDragMode(closestWall, coords);
      setSelectedWall(closestWall);
      setWallDragOperation({ mode, originPoint: coords, originalWall: closestWall, wallId: closestWall.id });
      setUploadStatus(mode === "move" ? `벽 ${closestWall.id} 이동` : `벽 ${closestWall.id} 길이 조절`);
      return;
    }

    // 후보 잡기 반경은 화면 기준으로 — 축소 상태에서도 마커를 쉽게 집을 수 있게 줌을 반영한다.
    const candidateGrabRadius = Math.max(28, 28 / viewScale);

    if (tool === "opening") {
      const hit = findOpeningCandidateHit(coords, candidateGrabRadius);
      if (!hit) {
        setSelectedCandidate(null);
        return;
      }
      setSelectedCandidate({ id: hit.candidate.id, layer: "opening" });
      if (event.altKey) {
        toggleOpeningCandidateType(hit.candidate.id);
        return;
      }
      // 일반 클릭은 선택만 유지한다. 움직이면 드래그 후보로 승격되어 이동·크기조절하고,
      // 확정/거절은 후보 목록·일괄 처리 버튼으로만 한다. Alt+클릭은 위에서 타입 전환 후 종료된다.
      setCandidateDragOperation({
        axis: hit.axis,
        candidateId: hit.candidate.id,
        layer: "opening",
        mode: hit.mode,
        moved: false,
        originPoint: coords,
        originalBox: hit.candidate.boxPx ? { ...hit.candidate.boxPx } : null,
        originalPosition: hit.candidate.position ?? { x: 0, y: 0 }
      });
      return;
    }

    if (tool === "fixture") {
      const closestCandidate = findClosestCandidate(fixtureCandidates, coords, candidateGrabRadius);
      setSelectedCandidate(closestCandidate ? { id: closestCandidate.id, layer: "fixture" } : null);
      if (closestCandidate) {
        setCandidateDragOperation({
          axis: "horizontal",
          candidateId: closestCandidate.id,
          layer: "fixture",
          mode: "move",
          moved: false,
          originPoint: coords,
          originalBox: null,
          originalPosition: closestCandidate.position ?? { x: 0, y: 0 }
        });
      }
      return;
    }

    if (tool === "eraser") {
      const closestWall = findClosestWall(coords, 20);
      if (closestWall) {
        removeWallById(closestWall.id);
        setUploadStatus(`벽 ${closestWall.id} 삭제`);
      }
      return;
    }

    if (tool === "hide") {
      const closestWall = findClosestWall(coords, 30);
      if (closestWall) {
        hideWallById(closestWall.id);
      }
      return;
    }

    if (tool === "partial_eraser") {
      if (!partialEraserSelectedWall) {
        setPartialEraserSelectedWall(findClosestWall(coords, 30));
        return;
      }

      const constrainedStart = projectPointOntoWall(coords, partialEraserSelectedWall);
      setEraseAreaStart(constrainedStart);
      setEraseAreaEnd(constrainedStart);
      setIsSelectingEraseArea(true);
    }
  }

  function handleMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    if (isDragging && lastPanPoint) {
      setViewOffset((currentOffset) => ({
        x: currentOffset.x + (event.clientX - lastPanPoint.x) / viewScale,
        y: currentOffset.y + (event.clientY - lastPanPoint.y) / viewScale
      }));
      setLastPanPoint({ x: event.clientX, y: event.clientY });
      return;
    }

    const coords = getCanvasCoordinates(event);
    if (candidateDragOperation) {
      const deltaX = coords.x - candidateDragOperation.originPoint.x;
      const deltaY = coords.y - candidateDragOperation.originPoint.y;
      // 손떨림 수준의 이동은 클릭으로 취급 — 임계값을 넘어야 드래그로 승격.
      if (!candidateDragOperation.moved && Math.hypot(deltaX, deltaY) < 5 / viewScale) return;
      if (!candidateDragOperation.moved) setCandidateDragOperation({ ...candidateDragOperation, moved: true });
      const { axis, mode, originalBox, originalPosition } = candidateDragOperation;
      if (mode === "move" || !originalBox) {
        setCandidateGeometry(candidateDragOperation.layer, candidateDragOperation.candidateId, {
          position: { x: originalPosition.x + deltaX, y: originalPosition.y + deltaY }
        });
        return;
      }
      // 크기 조절: 잡은 끝만 움직이고 반대쪽 끝은 고정한다.
      const horizontal = axis === "horizontal";
      const axisDelta = horizontal ? deltaX : deltaY;
      const originalLength = horizontal ? originalBox.width : originalBox.height;
      const sign = mode === "resize-end" ? 1 : -1;
      let nextLength = Math.max(8, originalLength + sign * axisDelta);
      // 끄는 도중에도 같은 축선 위 벽 끝점에 자석처럼 붙인다.
      const originalCenter = horizontal ? originalPosition.x : originalPosition.y;
      const cross = horizontal ? originalPosition.y : originalPosition.x;
      const fixedEdge = originalCenter - sign * (originalLength / 2);
      const snapTarget = findWallEdgeSnapTarget(horizontal, cross, fixedEdge + sign * nextLength, {
        // 창문은 검출 박스가 두꺼워 중심이 벽 중심선에서 살짝 벗어나 있다 —
        // 박스 두께의 절반까지는 같은 벽으로 인정해야 문처럼 스냅이 걸린다.
        crossTolerancePx: (horizontal ? originalBox.height : originalBox.width) / 2,
        snapToOpeningsExcludingId: candidateDragOperation.candidateId
      });
      if (snapTarget !== null && Math.abs(snapTarget - fixedEdge) >= 8) {
        nextLength = Math.abs(snapTarget - fixedEdge);
      }
      const nextCenter = fixedEdge + (sign * nextLength) / 2;
      const nextPosition = horizontal ? { x: nextCenter, y: originalPosition.y } : { x: originalPosition.x, y: nextCenter };
      setCandidateGeometry(candidateDragOperation.layer, candidateDragOperation.candidateId, {
        boxPx: horizontal ? { ...originalBox, width: nextLength } : { ...originalBox, height: nextLength },
        position: nextPosition
      });
      return;
    }
    if (wallDragOperation) {
      updateDraggedWall(wallDragOperation, coords);
      return;
    }

    if (isDrawing && startPoint && tool === "wall") {
      setCurrentPoint(snapEditorPoint(snapToOrthogonal(startPoint, coords) as Point));
      return;
    }

    if (isSelectingEraseArea && partialEraserSelectedWall) {
      setEraseAreaEnd(projectPointOntoWall(coords, partialEraserSelectedWall));
      return;
    }

    // 방 내부 재기: 코너 hover 동그라미 + (측정 중이면) 끝점 따라오기.
    if (tool === "interior") {
      const snapCorner = findSnapCorner(coords);
      setInteriorHoverSnap(snapCorner);
      if (interiorMeasureStart && interiorMeasurePx === 0) {
        setInteriorMeasureEnd(snapCorner ?? coords);
      }
      return;
    }

    if (tool === "eraser" || tool === "select" || tool === "partial_eraser" || tool === "hide") {
      setHoveredWall(findClosestWall(coords, tool === "eraser" ? 20 : 30));
    } else {
      setHoveredWall(null);
    }
  }

  function stopCanvasPan() {
    setIsDragging(false);
    setLastPanPoint(null);
  }

  function handleMouseUp(event: React.MouseEvent<HTMLCanvasElement>) {
    stopCanvasPan();

    if (candidateDragOperation) {
      if (candidateDragOperation.moved) {
        const current = openingCandidates.find((candidate) => candidate.id === candidateDragOperation.candidateId);
        let snappedToWall = false;
        if (candidateDragOperation.layer === "opening" && current?.boxPx) {
          if (candidateDragOperation.mode === "move") {
            // 이동해서 놓으면 가까운 벽에 자동으로 끼워 넣고(방향·두께·범위 맞춤),
            // 이웃 벽 끝점·옆벽 면이 가까우면 길이를 유지한 채 끝을 거기 붙인다.
            const geometry = snappedOpeningGeometryOnWall(current.position, current.boxPx);
            if (geometry) {
              setCandidateGeometry("opening", candidateDragOperation.candidateId, slideOpeningEdgesToSnap(geometry, candidateDragOperation.candidateId));
              snappedToWall = true;
            } else {
              // 벽 몸통 포착에 실패해도(벽이 끊긴 틈 위 등) 끝 정렬 자석은 따로 시도한다 —
              // "옆으로 당겨서 벽에 붙이기" 제스처가 포착 실패 때문에 통째로 무시되지 않게.
              // 축선(cross)도 가까운 벽 줄에 맞춰 틈 안에 반듯하게 앉힌다.
              const horizontal = openingAxisIsHorizontal(current.position, current.boxPx);
              const cross = horizontal ? current.position.y : current.position.x;
              const crossTarget = findWallCenterlineSnap(horizontal, cross, Math.max(24, 24 / viewScale));
              const alignedPosition =
                crossTarget === null
                  ? current.position
                  : horizontal
                    ? { x: current.position.x, y: crossTarget }
                    : { x: crossTarget, y: current.position.y };
              const slid = slideOpeningEdgesToSnap({ boxPx: current.boxPx, horizontal, position: alignedPosition }, candidateDragOperation.candidateId);
              if (slid.position.x !== current.position.x || slid.position.y !== current.position.y) {
                setCandidateGeometry("opening", candidateDragOperation.candidateId, slid);
                snappedToWall = true;
              }
            }
          } else {
            // 끝을 당겨서 놓으면, 같은 축선 위 벽 끝점에 잡은 쪽 모서리를 딱 붙인다.
            // (끄는 도중에도 자석 스냅이 걸리므로 여기서는 최종 확인만.)
            // 축은 박스 모양으로 재추측하지 않고 드래그 시작 때 판정한 값을 쓴다.
            const horizontal = candidateDragOperation.axis === "horizontal";
            const half = (horizontal ? current.boxPx.width : current.boxPx.height) / 2;
            const center = horizontal ? current.position.x : current.position.y;
            const cross = horizontal ? current.position.y : current.position.x;
            const movingSign = candidateDragOperation.mode === "resize-end" ? 1 : -1;
            const movingEdge = center + movingSign * half;
            const fixedEdge = center - movingSign * half;
            const bestTarget = findWallEdgeSnapTarget(horizontal, cross, movingEdge, {
              snapToOpeningsExcludingId: candidateDragOperation.candidateId
            });
            if (bestTarget !== null && Math.abs(bestTarget - fixedEdge) >= 8) {
              const nextLength = Math.abs(bestTarget - fixedEdge);
              const nextCenter = (bestTarget + fixedEdge) / 2;
              setCandidateGeometry("opening", candidateDragOperation.candidateId, {
                boxPx: horizontal ? { ...current.boxPx, width: nextLength } : { ...current.boxPx, height: nextLength },
                position: horizontal ? { x: nextCenter, y: current.position.y } : { x: current.position.x, y: nextCenter }
              });
              snappedToWall = true;
            }
          }
        }
        setUploadStatus(
          candidateDragOperation.mode !== "move"
            ? snappedToWall
              ? "끝이 벽에 딱 맞춰짐"
              : "후보 크기 조절됨"
            : snappedToWall
              ? "벽에 맞춰 배치됨"
              : "후보 위치 이동됨"
        );
      }
      setCandidateDragOperation(null);
      return;
    }

    if (wallDragOperation) {
      updateDraggedWall(wallDragOperation, getCanvasCoordinates(event));
      setWallDragOperation(null);
      return;
    }

    if (isDrawing && startPoint && currentPoint && tool === "wall") {
      const snappedEnd = snapEditorPoint(snapToOrthogonal(startPoint, getCanvasCoordinates(event)) as Point);
      if (startPoint.x !== snappedEnd.x || startPoint.y !== snappedEnd.y) {
        const nextWall = { id: `wall-${Date.now()}`, start: startPoint, end: snappedEnd };
        setWalls((currentWalls) => [...currentWalls, nextWall]);
      }
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
    }

    if (isSelectingEraseArea && partialEraserSelectedWall && eraseAreaStart && eraseAreaEnd) {
      setWalls((currentWalls) =>
        currentWalls.flatMap((wall) =>
          wall.id === partialEraserSelectedWall.id ? splitWallByEraseArea(wall, eraseAreaStart, eraseAreaEnd) : [wall]
        )
      );
      setPartialEraserSelectedWall(null);
      setIsSelectingEraseArea(false);
      setEraseAreaStart(null);
      setEraseAreaEnd(null);
    }
  }

  function handleCanvasMouseLeave() {
    if (isDragging) {
      stopCanvasPan();
    }
    setWallDragOperation(null);
    setCandidateDragOperation(null);
  }

  // 인식이 놓친 문/창문 수동 추가 — 문창문 도구에서 빈 곳 더블클릭.
  function handleCanvasDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "opening") return;
    const coords = getCanvasCoordinates(event);
    if (findOpeningCandidateHit(coords, Math.max(28, 28 / viewScale))) return;
    // 벽 근처에서 추가하면 처음부터 벽에 끼워진 상태로 생성한다.
    const defaultBox = { height: 14, width: 60 };
    const snappedGeometry = snappedOpeningGeometryOnWall(coords, defaultBox);
    const manualCandidate: FloorPlanCandidate = {
      boxPx: snappedGeometry?.boxPx ?? defaultBox,
      id: `manual-opening-${Date.now()}`,
      movable: true,
      position: snappedGeometry?.position ?? coords,
      source: "manual",
      status: "CONFIRMED",
      type: "DOOR"
    };
    setOpeningCandidates((candidates) => [...candidates, manualCandidate]);
    setSelectedCandidate({ id: manualCandidate.id, layer: "opening" });
    setUploadStatus("문 수동 추가 — 드래그로 이동, Alt+클릭으로 창문 전환");
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left - rect.width / 2;
    const pointerY = event.clientY - rect.top - rect.height / 2;
    const worldBeforeZoom = {
      x: pointerX / viewScale - viewOffset.x,
      y: pointerY / viewScale - viewOffset.y
    };
    const nextScale = Math.max(0.1, Math.min(10, viewScale * (event.deltaY > 0 ? 0.9 : 1.1)));

    setViewScale(nextScale);
    setViewOffset({
      x: pointerX / nextScale - worldBeforeZoom.x,
      y: pointerY / nextScale - worldBeforeZoom.y
    });
  }

  function handleCanvasAuxClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

  // 콘텐츠는 캔버스 중앙 기준으로 그려지므로, 셸 스크롤이 좌상단에 있으면
  // 도면이 화면 밖에 있는 것처럼 보인다. 스크롤을 항상 캔버스 중앙에 맞춘다.
  const centerCanvasScroll = useCallback(() => {
    const shell = containerRef.current;
    if (!shell) return;
    shell.scrollLeft = Math.max(0, (shell.scrollWidth - shell.clientWidth) / 2);
    shell.scrollTop = Math.max(0, (shell.scrollHeight - shell.clientHeight) / 2);
  }, []);

  useEffect(() => {
    if (viewMode === "2d") centerCanvasScroll();
  }, [viewMode, centerCanvasScroll]);

  function fitViewToWalls(targetWalls: Wall[]) {
    centerCanvasScroll();
    const points = targetWalls.flatMap((wall) => [wall.start, wall.end]);
    if (!points.length) {
      setViewScale(1);
      setViewOffset({ x: 0, y: 0 });
      return;
    }
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const padding = 60;
    const shell = containerRef.current;
    const viewportWidth = Math.min(shell?.clientWidth || CANVAS_WIDTH, CANVAS_WIDTH);
    const viewportHeight = Math.min(shell?.clientHeight || CANVAS_HEIGHT, CANVAS_HEIGHT);
    const contentWidth = Math.max(1, maxX - minX + padding * 2);
    const contentHeight = Math.max(1, maxY - minY + padding * 2);
    const nextScale = Math.max(0.1, Math.min(10, Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight)));
    setViewScale(nextScale);
    setViewOffset({ x: -(minX + maxX) / 2, y: -(minY + maxY) / 2 });
  }

  function zoomViewBy(factor: number) {
    const nextScale = Math.max(0.1, Math.min(10, viewScale * factor));
    setViewScale(nextScale);
  }

  // 벽·후보 배열이 바뀔 때마다 이전 상태를 이력에 쌓는다(실행 취소로 인한 변경은 제외).
  // 드래그 중 연속 갱신은 시작 시점 한 번만 쌓아, Ctrl+Z 한 번이 드래그 한 번을 되돌리게 한다.
  useEffect(() => {
    const last = lastHistorySnapshotRef.current;
    const changed = walls !== last.walls || openingCandidates !== last.openings || fixtureCandidates !== last.fixtures;
    const dragging = wallDragOperation !== null || candidateDragOperation !== null;
    if (changed) {
      if (editHistorySkipRef.current) {
        editHistorySkipRef.current = false;
      } else if (!dragHistoryPushedRef.current) {
        const history = editHistoryRef.current;
        history.past.push(last);
        if (history.past.length > 100) history.past.shift();
        history.future = [];
        // 드래그가 끝나는 프레임(놓으면서 스냅 보정)까지 같은 드래그로 취급한다.
        if (dragging) dragHistoryPushedRef.current = true;
      }
      lastHistorySnapshotRef.current = { fixtures: fixtureCandidates, openings: openingCandidates, walls };
    }
    if (!dragging) dragHistoryPushedRef.current = false;
  }, [walls, openingCandidates, fixtureCandidates, wallDragOperation, candidateDragOperation]);

  function clearWallSelectionState() {
    setSelectedWall(null);
    setHoveredWall(null);
    setPartialEraserSelectedWall(null);
    setSelectedWallRunRects(null);
    setSelectedCandidate(null);
  }

  // 도구를 바꾸면 후보 선택도 푼다 — 다른 도구에서 Delete가 엉뚱한 후보를 지우지 않게.
  useEffect(() => {
    setSelectedCandidate(null);
  }, [tool]);

  // 선택된 문/창문/설비 후보를 목록에서 제거한다(Delete 키). Ctrl+Z로 복구 가능.
  function removeSelectedCandidate(target: { id: string; layer: "opening" | "fixture" }) {
    const list = target.layer === "opening" ? openingCandidates : fixtureCandidates;
    const candidate = list.find((entry) => entry.id === target.id);
    const remove = (candidates: FloorPlanCandidate[]) => candidates.filter((entry) => entry.id !== target.id);
    if (target.layer === "opening") setOpeningCandidates(remove);
    else setFixtureCandidates(remove);
    setSelectedCandidate(null);
    setUploadStatus(`${candidate ? candidateTypeLabel(candidate.type) : "후보"} 삭제 (Delete)`);
  }

  function applyHistorySnapshot(snapshot: EditorHistorySnapshot) {
    editHistorySkipRef.current = true;
    setWalls(snapshot.walls);
    setOpeningCandidates(snapshot.openings);
    setFixtureCandidates(snapshot.fixtures);
    clearWallSelectionState();
  }

  function undoWallEdit() {
    const history = editHistoryRef.current;
    const previous = history.past.pop();
    if (!previous) {
      setUploadStatus("되돌릴 편집이 없습니다");
      return;
    }
    history.future.push(lastHistorySnapshotRef.current);
    applyHistorySnapshot(previous);
    setUploadStatus("실행 취소");
  }

  function redoWallEdit() {
    const history = editHistoryRef.current;
    const next = history.future.pop();
    if (!next) {
      setUploadStatus("다시 실행할 편집이 없습니다");
      return;
    }
    history.past.push(lastHistorySnapshotRef.current);
    applyHistorySnapshot(next);
    setUploadStatus("다시 실행");
  }

  // 키보드 단축키: Ctrl+Z 실행 취소, Ctrl+Shift+Z/Ctrl+Y 다시 실행, Esc 취소, Delete 선택 벽 삭제.
  // 최신 상태를 참조해야 하므로 매 렌더마다 다시 등록한다.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoWallEdit();
        else undoWallEdit();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redoWallEdit();
        return;
      }
      if (event.key === "Escape") {
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);
        // 재편집 중이던 가구는 조용히 사라지지 않게 원위치로 되돌린다.
        restorePendingFurnitureOrigin();
        setPendingFurniture(null);
        setSelectedFurnitureId(null);
        clearWallSelectionState();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && viewMode === "2d") {
        if (selectedCandidate) {
          event.preventDefault();
          removeSelectedCandidate(selectedCandidate);
          return;
        }
        if (selectedWall) {
          event.preventDefault();
          const wallId = selectedWall.id;
          removeWallById(wallId);
          setUploadStatus(`벽 ${wallId} 삭제 (Delete)`);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function loadImageDataFromUrl(imageUrl: string) {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus(`${file.name} 도면 등록중`);
    try {
      const sourceUploadPromise = uploadFloorPlanSource(file);
      const aiImageDataUrlPromise = fileToCompressedDataUrl(file);
      const sourceUpload = await sourceUploadPromise;
      const aiImageDataUrl = await aiImageDataUrlPromise;
      const imageUrl = URL.createObjectURL(file);

      setWalls([]);
      setHiddenWallIds(new Set());
      setSelectedWall(null);
      setHoveredWall(null);
      restorePendingFurnitureOrigin();
      setPendingFurniture(null);
      setSelectedFurnitureId(null);
      setOpeningCandidates([]);
      setFixtureCandidates([]);
      setDetectionBoxes([]);
      setSelectedWallRunRects(null);
      setRoboflowDetections(null);
      setRoboflowWallPostProcessSourceWalls([]);
      setUploadedImage(imageUrl);
      setUploadedAiImageDataUrl(aiImageDataUrl);
      setUploadedFloorPlanSource(sourceUpload ?? { imageUrl });
      setAiAnalysisStatus("도면 등록 완료. 도면 인식 버튼으로 자동 인식을 실행하세요.");
      setFloorPlanDraftId(null);
      setExtractionMeta({
        annotationCandidateCount: 0,
        aiGeneratedWallCount: 0,
        aiNoiseFlags: undefined,
        aiPlanStyle: undefined,
        aiSummary: undefined,
        aiDimensions: [],
        aiTextDetections: [],
        aiRoomCount: 0,
        detectedWallCount: 0,
        dimensionCandidateCount: 0,
        mainPlanBounds: undefined,
        needsReview: false,
        ocrStatus: "manual-scale-required",
        processingMs: undefined,
        removedNoiseCount: 0,
        scaleCandidates: [],
        scaleConfirmed: false
      });
      setIsScaleSet(false);
      scaleAutoAppliedRef.current = false;
      setUploadStatus(`${file.name} 도면 등록 완료`);
    } catch {
      setUploadStatus("도면 등록 실패");
    } finally {
      setIsProcessing(false);
      event.target.value = "";
    }
  }

  function isWallUsableForRoboflowPostProcess(wall: Wall) {
    const source = (wall as AiGeneratedWall).source;
    return source !== "ai-room-edge" && source !== "ai-missing-wall-hint" && !String(wall.id).startsWith("rf-wall");
  }

  async function runPrintedDimensionReading(forceRefresh = false) {
    const attachmentId = uploadedFloorPlanSource?.attachmentId;
    if (!attachmentId && !uploadedAiImageDataUrl) {
      setAiAnalysisStatus("먼저 도면을 업로드하세요");
      return;
    }

    setIsProcessing(true);
    setAiAnalysisStatus(forceRefresh ? "치수 다시 읽는 중" : "치수 숫자 읽는 중");
    try {
      const response = await floorPlanAuthorizedFetch(apiUrl("/floor-plans/ai-analysis"), {
        body: JSON.stringify({
          analysisMode: "dimension",
          forceRefresh,
          imageDataUrl: attachmentId ? undefined : uploadedAiImageDataUrl,
          model: "openai/floor-plan-vision",
          prompt: "인쇄된 평면도의 치수 숫자를 읽고 dimensions 배열로 분류해 주세요. 각 숫자는 kind(outer_total/outer_segment/room_span/wall_span/opening/furniture/fixture/area/ignore)로 분류합니다. 구조 치수(outer_total/outer_segment/room_span/wall_span)만 useForScale·useForWallGeneration을 true로 두고, 문/창문 폭은 opening, '1500 × 2000mm' 같은 가구 크기는 furniture, 면적(㎡)은 area로 둡니다. boundingBox와 targetLine은 0~1000 좌표로 넣되 불확실하면 null로 보냅니다. 같은 숫자라도 위치가 다르면 별도 항목으로 유지합니다.",
          sourceAttachmentId: attachmentId
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error(`Dimension reading failed: ${response.status}`);

      const result = (await response.json()) as {
        status: "ready" | "config-required" | "failed";
        summary: string;
        cached?: boolean;
        dimensions?: AiDimensionDetection[];
        textDetections?: Array<{ boundingBox?: unknown; confidence?: number; targetLine?: unknown; text: string }>;
      };
      if (result.status !== "ready") {
        setAiAnalysisStatus(result.summary);
        return;
      }

      const aiDimensions = result.dimensions ?? [];
      const textDetections = result.textDetections ?? [];
      const structuralCount = aiDimensions.filter((dimension) => isStructuralDimensionKind(normalizeDimensionKind(dimension.kind))).length;
      const openingCount = aiDimensions.filter((dimension) => normalizeDimensionKind(dimension.kind) === "opening").length;
      const furnitureCount = aiDimensions.filter((dimension) => {
        const kind = normalizeDimensionKind(dimension.kind);
        return kind === "furniture" || kind === "fixture";
      }).length;
      const dimensionCount = aiDimensions.length
        ? structuralCount
        : textDetections.reduce((count, detection) => count + parseDimensionTextsToMm(detection.text).length, 0);
      setExtractionMeta((currentMeta) => ({
        ...currentMeta,
        aiDimensions,
        aiModel: "openai/floor-plan-vision",
        aiPhase1Status: result.status,
        aiSummary: result.summary,
        aiTextDetections: textDetections,
        dimensionCandidateCount: dimensionCount,
        needsReview: dimensionCount > 0 || currentMeta.needsReview,
        ocrStatus: dimensionCount > 0 ? "ready" : currentMeta.ocrStatus
      }));
      const cacheTag = result.cached ? " (캐시)" : "";
      setAiAnalysisStatus(
        aiDimensions.length
          ? `${result.summary} 구조 치수 ${structuralCount} / 문창문 ${openingCount} / 가구 ${furnitureCount}개${cacheTag}`
          : dimensionCount > 0
            ? `${result.summary} 읽힌 치수 ${dimensionCount}개 (축척 확인 필요)${cacheTag}`
            : `${result.summary} 읽힌 치수가 없어 수동 확인이 필요합니다`
      );
    } catch {
      setAiAnalysisStatus("치수 읽기 실패");
    } finally {
      setIsProcessing(false);
    }
  }

  async function runOpeningDetection() {
    const attachmentId = uploadedFloorPlanSource?.attachmentId;
    if (!attachmentId && !uploadedAiImageDataUrl) {
      setAiAnalysisStatus("먼저 도면을 업로드하세요");
      return;
    }

    setIsProcessing(true);
    setIsScanningPlan(true);
    setAiAnalysisStatus("문/창문 후보 탐지중");
    try {
      const response = await floorPlanAuthorizedFetch(apiUrl("/floor-plans/opening-detection"), {
        body: JSON.stringify({
          imageDataUrl: attachmentId ? undefined : uploadedAiImageDataUrl,
          sourceAttachmentId: attachmentId
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error(`Opening detection failed: ${response.status}`);

      const result = (await response.json()) as {
        status: "ready" | "config-required" | "failed";
        summary: string;
        imageWidth?: number;
        imageHeight?: number;
        openings: Array<{
          id: string;
          type: "DOOR" | "WINDOW";
          confidence: number;
          source: string;
          boundingBox: { x: number; y: number; width: number; height: number };
        }>;
        walls?: Array<{
          id: string;
          confidence: number;
          boundingBox: { x: number; y: number; width: number; height: number };
        }>;
      };
      if (result.status !== "ready") {
        setAiAnalysisStatus(result.summary);
        return;
      }

      const imageAspect = Math.max(1e-6, (result.imageWidth || 1) / (result.imageHeight || 1));
      const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
      let drawWidth = CANVAS_WIDTH * 0.8;
      let drawHeight = drawWidth / imageAspect;
      if (imageAspect <= canvasAspect) {
        drawHeight = CANVAS_HEIGHT * 0.8;
        drawWidth = drawHeight * imageAspect;
      }
      const toEditorBox = (box: RoboflowDetectionBox) => convertRoboflowBoxToEditorBox(box, result.imageWidth, result.imageHeight);
      const detectedWalls = (result.walls ?? []).filter((wallBox) => wallBox.confidence >= ROBOFLOW_SITE_CONFIDENCE_THRESHOLD);
      const detectedOpenings = result.openings.filter((opening) => opening.confidence >= ROBOFLOW_OPENING_CONFIDENCE_THRESHOLD);
      const detected = detectedOpenings.map(
        (opening): FloorPlanCandidate => ({
          boxPx: {
            height: (opening.boundingBox.height / 1000) * drawHeight,
            width: (opening.boundingBox.width / 1000) * drawWidth
          },
          confidence: opening.confidence,
          id: `rf-${opening.id}`,
          label: `${opening.type === "DOOR" ? "문" : "창문"} 후보 ${Math.round(opening.confidence * 100)}%`,
          movable: true,
          position: {
            x: -drawWidth / 2 + ((opening.boundingBox.x + opening.boundingBox.width / 2) / 1000) * drawWidth,
            y: -drawHeight / 2 + ((opening.boundingBox.y + opening.boundingBox.height / 2) / 1000) * drawHeight
          },
          source: opening.source,
          status: "CANDIDATE",
          type: opening.type
        })
      );

      setRoboflowDetections({
        imageHeight: result.imageHeight,
        imageWidth: result.imageWidth,
        openings: detectedOpenings,
        summary: result.summary,
        walls: detectedWalls
      });
      setRoboflowWallPostProcessSourceWalls(walls.filter(isWallUsableForRoboflowPostProcess));
      setExtractionMeta((currentMeta) => ({ ...currentMeta, detectedWallCount: detectedWalls.length, needsReview: true }));
      setSelectedWallRunRects(null);
      setDetectionBoxes([
        ...detectedWalls.map((wallBox) => ({
          box: toEditorBox(wallBox.boundingBox),
          confidence: wallBox.confidence,
          type: "WALL" as const,
          variant: "raw" as const
        })),
        ...detectedOpenings.map((opening) => ({ box: toEditorBox(opening.boundingBox), confidence: opening.confidence, type: opening.type }))
      ]);
      setOpeningCandidates((current) => [...current.filter((candidate) => !String(candidate.id).startsWith("rf-")), ...detected]);
      setAiAnalysisStatus(
        `${result.summary} Roboflow 원본 박스 저장됨: 벽 ${detectedWalls.length}개, 문/창문 ${detectedOpenings.length}개. 인식 보정을 눌러 3D 변환용 벽으로 정리하세요.`
      );
    } catch {
      setAiAnalysisStatus("도면 인식 실패");
    } finally {
      setIsProcessing(false);
      setIsScanningPlan(false);
    }
  }

  function snapWallsToImageEvidence(wallsToSnap: Wall[], imageData: ImageData, options?: { darkThreshold?: number; searchRadiusPx?: number }) {
    const imageWidth = imageData.width;
    const imageHeight = imageData.height;
    const darkThreshold = options?.darkThreshold ?? 185;
    const searchRadius = options?.searchRadiusPx ?? Math.max(6, Math.round(Math.min(imageWidth, imageHeight) * 0.012));
    const imageAspect = imageWidth / imageHeight;
    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
    let drawWidth = CANVAS_WIDTH * 0.8;
    let drawHeight = drawWidth / imageAspect;
    if (imageAspect <= canvasAspect) {
      drawHeight = CANVAS_HEIGHT * 0.8;
      drawWidth = drawHeight * imageAspect;
    }
    const editorPerImagePx = drawWidth / imageWidth;
    const isDarkAt = (x: number, y: number) => {
      const pixelX = Math.round(x);
      const pixelY = Math.round(y);
      if (pixelX < 0 || pixelY < 0 || pixelX >= imageWidth || pixelY >= imageHeight) return false;
      const offset = (pixelY * imageWidth + pixelX) * 4;
      const luminance = 0.299 * imageData.data[offset] + 0.587 * imageData.data[offset + 1] + 0.114 * imageData.data[offset + 2];
      return luminance < darkThreshold;
    };

    return wallsToSnap.map((wall) => {
      const horizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
      const axisEditor = horizontal ? wall.start.y : wall.start.x;
      const spanStartEditor = horizontal ? Math.min(wall.start.x, wall.end.x) : Math.min(wall.start.y, wall.end.y);
      const spanEndEditor = horizontal ? Math.max(wall.start.x, wall.end.x) : Math.max(wall.start.y, wall.end.y);
      const toImage = (editorValue: number, vertical: boolean) =>
        vertical ? (editorValue + drawHeight / 2) / editorPerImagePx : (editorValue + drawWidth / 2) / editorPerImagePx;
      const axisImage = toImage(axisEditor, horizontal);
      const spanStartImage = toImage(spanStartEditor, !horizontal);
      const spanEndImage = toImage(spanEndEditor, !horizontal);

      const sampleCount = 9;
      const inset = (spanEndImage - spanStartImage) * 0.12;
      const offsets: number[] = [];
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const along = spanStartImage + inset + ((spanEndImage - spanStartImage - inset * 2) * sampleIndex) / Math.max(1, sampleCount - 1);
        // 벽 축의 수직 방향으로 어두운 픽셀 오프셋들의 평균을 구한다.
        let darkSum = 0;
        let darkCount = 0;
        for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
          const dark = horizontal ? isDarkAt(along, axisImage + offset) : isDarkAt(axisImage + offset, along);
          if (dark) {
            darkSum += offset;
            darkCount += 1;
          }
        }
        if (darkCount > 0) offsets.push(darkSum / darkCount);
      }
      if (offsets.length < Math.ceil(sampleCount / 2)) return wall;

      const sortedOffsets = [...offsets].sort((left, right) => left - right);
      const medianOffsetImage = sortedOffsets[Math.floor(sortedOffsets.length / 2)];
      const deltaEditor = medianOffsetImage * editorPerImagePx;
      if (!Number.isFinite(deltaEditor) || Math.abs(deltaEditor) < 0.5) return wall;

      return horizontal
        ? { ...wall, end: { ...wall.end, y: wall.end.y + deltaEditor }, start: { ...wall.start, y: wall.start.y + deltaEditor } }
        : { ...wall, end: { ...wall.end, x: wall.end.x + deltaEditor }, start: { ...wall.start, x: wall.start.x + deltaEditor } };
    });
  }

  async function applyRoboflowWallPostProcessing() {
    if (!roboflowDetections) {
      setAiAnalysisStatus("먼저 도면 인식으로 Roboflow 원본 박스를 가져오세요");
      return;
    }

    const currentSourceWalls = walls.filter(isWallUsableForRoboflowPostProcess);
    const fallbackSourceWalls = currentSourceWalls.length ? currentSourceWalls : walls.filter((wall) => {
      const source = (wall as AiGeneratedWall).source;
      return source !== "ai-room-edge" && source !== "ai-missing-wall-hint";
    });
    const fusionSourceWalls = roboflowWallPostProcessSourceWalls.length ? roboflowWallPostProcessSourceWalls : fallbackSourceWalls;

    // 파란 벽 박스 + (벽 라인에 정렬한) 노란 창문 박스를 벽 생성 기준으로 — 창문 구간의 벽 검출
    // 구멍을 메워 벽 라인 연속성을 확보한다. 최종 벽 데이터에서는 문·창문 자리 모두 되뚫는다(아래 참고).
    const rawWallBoundingBoxes = roboflowDetections.walls.map((wallBox) => wallBox.boundingBox);
    const alignedWindowWallBoxes = roboflowDetections.openings
      .filter((opening) => opening.type === "WINDOW")
      .map((opening) => alignWindowBoxToWallLine({ ...opening.boundingBox, confidence: opening.confidence }, rawWallBoundingBoxes))
      .filter((box): box is RoboflowBoundingBox => box !== null);

    const detectionWallResult = buildWallsFromDetectionBoxes({
      canvasHeight: CANVAS_HEIGHT,
      canvasWidth: CANVAS_WIDTH,
      currentWalls: fusionSourceWalls,
      imageHeight: roboflowDetections.imageHeight,
      imageWidth: roboflowDetections.imageWidth,
      minConfidence: 0.3,
      minGeneratedWallCount: 1,
      openingBoxes: roboflowDetections.openings.filter((opening) => opening.type === "DOOR").map((opening) => opening.boundingBox),
      pixelToMmRatio,
      wallBoxes: [
        ...roboflowDetections.walls.map((wallBox) => ({ ...wallBox.boundingBox, confidence: wallBox.confidence })),
        ...alignedWindowWallBoxes
      ]
    });

    if (!detectionWallResult.generatedWallCount) {
      setAiAnalysisStatus(`${roboflowDetections.summary} 후처리로 확정할 벽이 부족합니다. threshold를 낮추거나 직접 벽을 보정하세요.`);
      return;
    }

    let snappedWalls = detectionWallResult.walls;
    let snappedWallBoxes: RoboflowDetectionOverlayBox[] = detectionWallResult.generatedWallBoxes;
    if (uploadedImage) {
      const evidenceImageData = await loadImageDataFromUrl(uploadedImage).catch(() => null);
      if (evidenceImageData) {
        snappedWalls = snapWallsToImageEvidence(detectionWallResult.walls, evidenceImageData);
        snappedWallBoxes = snappedWalls.map((wall: Wall, index: number) => {
          const originalBox = detectionWallResult.generatedWallBoxes[index];
          const original = detectionWallResult.walls[index];
          const deltaX = wall.start.x - original.start.x;
          const deltaY = wall.start.y - original.start.y;
          return {
            ...originalBox,
            variant: "postprocessed" as const,
            box: {
              x1: originalBox.box.x1 + deltaX,
              x2: originalBox.box.x2 + deltaX,
              y1: originalBox.box.y1 + deltaY,
              y2: originalBox.box.y2 + deltaY
            }
          };
        });
      }
    }

    setHiddenWallIds(new Set());
    setSelectedWall(null);
    setHoveredWall(null);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, detectedWallCount: detectionWallResult.walls.length, needsReview: true }));
    const postProcessedWallBoxes = snappedWallBoxes.map((wallBox) => ({ ...wallBox, variant: "postprocessed" as const }));
    const rawWallDisplayBoxes = roboflowDetections.walls.map((wallBox) => ({
      box: convertRoboflowBoxToEditorBox(wallBox.boundingBox, roboflowDetections.imageWidth, roboflowDetections.imageHeight),
      confidence: wallBox.confidence,
      type: "WALL" as const,
      variant: "raw" as const
    }));
    const adjustedWallBoxes = buildAdjustedWallBoxesFromRawAndGenerated(rawWallDisplayBoxes, postProcessedWallBoxes);
    const cornerTrimmedWallBoxes = trimWallBoxCornerOverlaps(adjustedWallBoxes);
    const rawOpeningDisplayBoxes = roboflowDetections.openings.map((opening) => ({
      box: convertRoboflowBoxToEditorBox(opening.boundingBox, roboflowDetections.imageWidth, roboflowDetections.imageHeight),
      confidence: opening.confidence,
      type: opening.type
    }));
    const fittedOpeningBoxes = snapOpeningBoxEdgesToNearbyWallBreaks(
      fitOpeningBoxesToPostProcessedWalls(rawOpeningDisplayBoxes, cornerTrimmedWallBoxes),
      rawWallDisplayBoxes
    );
    const openingLineAlignedWallBoxes = alignWallBoxesToFittedOpeningLines(cornerTrimmedWallBoxes, fittedOpeningBoxes);
    const cornerAlignedWallBoxes = alignConnectedPerpendicularWallBoxCorners(openingLineAlignedWallBoxes);
    setDetectionBoxes([...cornerAlignedWallBoxes, ...fittedOpeningBoxes]);
    setSelectedWallRunRects(null);

    // 문/창문 후보의 위치·크기를 벽에 맞춰 다듬어진(fitted) 박스로 동기화한다.
    // 벽 틈(live cut)은 후보 기하에서 뚫리므로, 여기서 맞춰두지 않으면 후처리 직후
    // 틈 위치가 인식 원본 박스 기준으로 살짝 어긋나 보인다. 편집 시작점도 벽에 딱 맞게 된다.
    setOpeningCandidates((candidates) =>
      candidates.map((candidate) => {
        if (!candidate.position || !candidate.boxPx) return candidate;
        let bestBox: { x1: number; x2: number; y1: number; y2: number } | null = null;
        let bestDistance = Infinity;
        for (const fitted of fittedOpeningBoxes) {
          if (String(fitted.type).toUpperCase() !== candidate.type.toUpperCase()) continue;
          const box = normalizeOverlayBox(fitted.box);
          const distance = Math.hypot((box.x1 + box.x2) / 2 - candidate.position.x, (box.y1 + box.y2) / 2 - candidate.position.y);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestBox = box;
          }
        }
        // 너무 먼 매칭은 다른 후보의 박스일 가능성이 높아 건드리지 않는다.
        if (!bestBox || bestDistance > 60) return candidate;
        return {
          ...candidate,
          boxPx: { height: bestBox.y2 - bestBox.y1, width: bestBox.x2 - bestBox.x1 },
          position: { x: (bestBox.x1 + bestBox.x2) / 2, y: (bestBox.y1 + bestBox.y2) / 2 }
        };
      })
    );

    // 3D 벽 = 화면에 보이는 벽 박스를 그대로 변환(중심선). 문·창문 자리 모두 잘라서 뚫는다 —
    // 창문만 벽이 이어져 있으면 늘릴 때 스냅할 벽 끝점이 없어 문과 편집감이 달라진다.
    // (창문 검출 박스는 벽 라인 합성 단계에서 벽 연속성 확보용으로만 쓰고, 여기서 정확한 자리를 되뚫는다.)
    const openingCutBoxes = fittedOpeningBoxes.map((opening) => normalizeOverlayBox(opening.box));
    const wallsFromDisplayBoxes = cornerAlignedWallBoxes.flatMap((overlayBox, boxIndex) => {
      const box = normalizeOverlayBox(overlayBox.box);
      const horizontal = box.x2 - box.x1 >= box.y2 - box.y1;
      const thickness = Math.max(4, horizontal ? box.y2 - box.y1 : box.x2 - box.x1);
      const overlappingOpenings = openingCutBoxes.filter(
        (opening) => opening.x1 < box.x2 && opening.x2 > box.x1 && opening.y1 < box.y2 && opening.y2 > box.y1
      );
      const pieces = overlappingOpenings.length ? splitEditorBoxAtOpenings(box, overlappingOpenings, horizontal) : [box];
      return pieces
        .filter((piece) => (horizontal ? piece.x2 - piece.x1 : piece.y2 - piece.y1) > 2)
        .map((piece, pieceIndex) => {
          const centerX = (piece.x1 + piece.x2) / 2;
          const centerY = (piece.y1 + piece.y2) / 2;
          return {
            id: `wall-box-${boxIndex}-${pieceIndex}`,
            start: horizontal ? { x: piece.x1, y: centerY } : { x: centerX, y: piece.y1 },
            end: horizontal ? { x: piece.x2, y: centerY } : { x: centerX, y: piece.y2 },
            source: "roboflow-postprocessed",
            depthPx: thickness,
            thicknessPx: thickness
          };
        });
    }) as unknown as Wall[];
    setWalls(wallsFromDisplayBoxes);
    fitViewToWalls(wallsFromDisplayBoxes);

    setAiAnalysisStatus(`${roboflowDetections.summary} 후처리 완료: 화면 벽 ${cornerAlignedWallBoxes.length}개를 3D 벽으로 변환`);
    setUploadStatus(`벽 후처리 완료 — 3D 벽 ${wallsFromDisplayBoxes.length}개 (화면과 동일)`);
  }

  // 구조 치수 경계에 벽을 스냅해, 3D 방 크기·벽 간 거리를 도면 치수와 맞춘다.
  // Roboflow가 만든 벽은 픽셀 기하라 수십 mm 어긋날 수 있는데, 이걸 구조 치수 값으로 교정한다.
  function getStructuralBoundaryTolerancePx(boundaries: { horizontalLineY: number[]; verticalLineX: number[] }) {
    const allGaps: number[] = [];
    for (const lines of [boundaries.verticalLineX, boundaries.horizontalLineY]) {
      const sorted = [...lines].sort((a, b) => a - b);
      for (let index = 1; index < sorted.length; index += 1) allGaps.push(sorted[index] - sorted[index - 1]);
    }
    const minGap = allGaps.length ? Math.min(...allGaps) : 60;

    return Math.max(8, Math.min(45, minGap * 0.45));
  }

  function applyStructuralDimensionWallCorrection() {
    const boundaries = structuralWallBoundaries;
    const lineCount = boundaries.verticalLineX.length + boundaries.horizontalLineY.length;
    if (!lineCount) {
      setAiAnalysisStatus("보정할 구조 치수 경계가 없습니다. 도면 인식 → 치수 읽기 → 인식 보정을 먼저 하세요.");
      return;
    }
    if (!walls.length) {
      setAiAnalysisStatus("보정할 벽이 없습니다. 벽 후처리로 벽을 먼저 만드세요.");
      return;
    }
    // 다른 경계로 잘못 당기지 않게, 허용 오차를 경계 최소 간격의 45% 이하로 제한한다.
    const tolerancePx = getStructuralBoundaryTolerancePx(boundaries);
    const { movedCount, walls: corrected } = snapWallsToStructuralBoundaries(walls, boundaries, tolerancePx) as {
      movedCount: number;
      walls: Wall[];
    };
    setWalls(corrected);
    setSelectedWall(null);
    setHoveredWall(null);
    setUploadStatus(`구조 치수로 벽 ${movedCount}개 보정됨 (허용오차 ${Math.round(tolerancePx)}px)`);
    setAiAnalysisStatus(
      `구조 치수 경계에 벽 ${movedCount}/${walls.length}개 스냅 — 세로벽 기준선 ${boundaries.verticalLineX.length} / 가로벽 기준선 ${boundaries.horizontalLineY.length}. 3D 방 크기가 도면 치수에 맞춰졌습니다.`
    );
  }

  function applyStructuralDimensionMissingWallInference() {
    const boundaries = structuralWallBoundaries;
    const lineCount = boundaries.verticalLineX.length + boundaries.horizontalLineY.length;
    if (!lineCount) {
      setAiAnalysisStatus("누락 벽을 보완할 구조 치수 경계가 없습니다. 치수 읽기와 벽 후처리를 먼저 실행하세요.");
      return;
    }
    if (!walls.length) {
      setAiAnalysisStatus("누락 벽을 보완할 기준 벽이 없습니다. 벽 후처리로 기본 외곽/내벽을 먼저 만드세요.");
      return;
    }

    const tolerancePx = getStructuralBoundaryTolerancePx(boundaries);
    const snapped = snapWallsToStructuralBoundaries(walls, boundaries, tolerancePx) as {
      movedCount: number;
      walls: Wall[];
    };
    const inferred = inferMissingWallsFromStructuralBoundaries(snapped.walls, boundaries, tolerancePx, {
      minWallLengthPx: 45
    }) as { createdCount: number; createdWalls: Wall[]; walls: Wall[] };

    setWalls(inferred.walls);
    setHiddenWallIds(new Set());
    setSelectedWall(null);
    setHoveredWall(null);
    setUploadStatus(`치수 기준 누락 벽 ${inferred.createdCount}개 보완`);
    setAiAnalysisStatus(
      `구조 치수 경계 기준으로 기존 벽 ${snapped.movedCount}개를 맞추고, Roboflow가 놓친 후보 벽 ${inferred.createdCount}개를 추가했습니다. 문/창문 구멍은 3D 변환 단계의 opening 후보로 다시 잘립니다.`
    );
  }

  // 가까운 세로벽 X + 가로벽 Y 둘 다 반경 안일 때만 그 교차점(코너)에 스냅. 벽에서 멀면 null.
  // 축은 벽 중심선이므로, 클릭한 쪽(=방 안쪽)으로 두께 절반만큼 밀어 눈에 보이는 안쪽 면 꼭짓점에 붙인다.
  function findSnapCorner(point: Point): Point | null {
    const tolerance = 20 / viewScale;
    const nearest = (samples: Array<{ axis: number; thickness: number }>, target: number) => {
      let best: { axis: number; thickness: number } | null = null;
      let bestDistance = tolerance;
      for (const sample of samples) {
        // 거리는 중심선이 아니라 벽 면(중심선 ± 두께/2) 기준 — 두꺼운 벽의 면 코너 클릭도 반경 안에 들어온다.
        const distance = Math.max(0, Math.abs(sample.axis - target) - sample.thickness / 2);
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = sample;
        }
      }
      return best;
    };
    const snapX = nearest(wallAxisLines.verticalX, point.x);
    const snapY = nearest(wallAxisLines.horizontalY, point.y);
    if (snapX === null || snapY === null) return null;
    return {
      x: snapX.axis + Math.sign(point.x - snapX.axis) * (snapX.thickness / 2),
      y: snapY.axis + Math.sign(point.y - snapY.axis) * (snapY.thickness / 2)
    };
  }

  // 측정 점을 꼭짓점에 스냅(반경 안이면 코너, 아니면 그대로).
  function snapToWallCorner(point: Point): Point {
    return findSnapCorner(point) ?? point;
  }

  // 방 내부 재기: 가로/세로 측정 시작(두 점 클릭 모드로 전환).
  function startInteriorMeasure(target: "width" | "depth" | "scale") {
    setTool("interior");
    setInteriorMeasureTarget(target);
    setInteriorMeasureStart(null);
    setInteriorMeasureEnd(null);
    setInteriorMeasurePx(0);
    setInteriorCalibrationMm("");
    setUploadStatus(
      target === "scale"
        ? "축척 맞추기: 도면에서 실제 길이(mm)를 아는 두 점을 클릭하세요 (예: 치수가 적힌 벽의 양 끝)"
        : target === "width"
          ? "방 안쪽 '가로' 두 점을 클릭하세요"
          : "방 안쪽 '세로' 두 점을 클릭하세요"
    );
  }

  // 방금 잰 선의 실제 길이(mm)로 축척만 확정한다 — 방 가로/세로 치수와는 분리.
  function applyInteriorCalibration() {
    const realMm = Number(interiorCalibrationMm);
    if (!realMm || realMm <= 0 || interiorMeasurePx <= 0) return;
    const ratio = realMm / interiorMeasurePx;
    setPixelToMmRatio(ratio);
    setIsScaleSet(true);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
    setInteriorCalibrationMm("");
    // 측정선은 지운다 — 새 두 점을 찍으면 재교정할 수 있다.
    setInteriorMeasurePx(0);
    setInteriorMeasureStart(null);
    setInteriorMeasureEnd(null);
    setUploadStatus(`축척 맞춤: 1px = ${ratio.toFixed(2)}mm`);
  }

  function applyPrintedDimensionScale(dimension: PrintedDimensionChip) {
    // 벽 union 기반 전역 축척이 있으면 그걸 적용한다. AI targetLine 픽셀 길이는
    // 신뢰할 수 없으므로 전역 후보가 없을 때만 최후 수단으로 쓴다.
    let ratio = printedDimensionScale?.pixelToMmRatio ?? null;
    if (!ratio && dimension.targetLine) {
      const frame = computeBackgroundImageFrame(cachedBackgroundImage);
      const canvasLength = frame ? targetLineCanvasLength(dimension.targetLine, frame) : 0;
      if (canvasLength >= 8) ratio = dimension.realLengthMm / canvasLength;
    }
    if (!ratio) return;

    setPixelToMmRatio(ratio);
    setIsScaleSet(true);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
    setUploadStatus(`축척 적용됨(치수 ${dimension.text}): 1px = ${ratio.toFixed(2)}mm`);
  }

  // 벽 그리기 스냅도 도면에 정렬된 격자를 따른다 (격자에 보이는 대로 붙게).
  function snapEditorPoint(point: Point): Point {
    if (!gridSpec.aligned) return snapCanvasPoint(point) as Point;

    return {
      x: gridSpec.origin.x + Math.round((point.x - gridSpec.origin.x) / gridSpec.spacing) * gridSpec.spacing,
      y: gridSpec.origin.y + Math.round((point.y - gridSpec.origin.y) / gridSpec.spacing) * gridSpec.spacing
    };
  }

  function toggleCandidateStatus(layer: "opening" | "fixture", candidateId: string, status: CandidateStatus) {
    const updater = (candidates: FloorPlanCandidate[]) =>
      updateCandidateStatus(candidates, candidateId, status) as FloorPlanCandidate[];
    if (layer === "opening") setOpeningCandidates(updater);
    else setFixtureCandidates(updater);
    setUploadStatus(`후보 레이어 ${candidateId} ${status}`);
  }

  function setCandidateGeometry(
    layer: "opening" | "fixture",
    candidateId: string,
    geometry: { boxPx?: { height: number; width: number }; position: Point }
  ) {
    const updater = (candidates: FloorPlanCandidate[]) =>
      candidates.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, position: geometry.position, ...(geometry.boxPx ? { boxPx: geometry.boxPx } : {}) } : candidate
      );
    if (layer === "opening") setOpeningCandidates(updater);
    else setFixtureCandidates(updater);
  }

  // 문/창문을 벽에 끼워 넣기 — 중심을 벽 중심선에 붙이고, 두께는 벽 두께에,
  // 방향은 벽 방향에 맞춘다.
  // 벽 탐색은 중심 1점이 아니라 중심+양끝 5점으로 한다: 창문은 벽이 끊긴 '틈'에 놓이는
  // 경우가 많아, 중심은 양쪽 벽 끝에서 멀어도 후보의 끝은 벽에 닿아 있기 때문.
  // 벽 구간 안쪽으로 클램프하지 않는다 — 틈에 놓인 창문을 벽 몸통 위로 끌어당기는 부작용이
  // 있었고, 끝 정렬은 slideOpeningEdgesToSnap이 담당한다.
  function snappedOpeningGeometryOnWall(position: Point, boxPx: { height: number; width: number }) {
    const halfWidth = boxPx.width / 2;
    const halfHeight = boxPx.height / 2;
    const probes: Point[] = [
      position,
      { x: position.x - halfWidth, y: position.y },
      { x: position.x + halfWidth, y: position.y },
      { x: position.x, y: position.y - halfHeight },
      { x: position.x, y: position.y + halfHeight }
    ];
    // 포착 판정은 벽 중심선이 아니라 '표면' 기준으로 한다. 고정 반경을 쓰면 두꺼운 벽은
    // 겉면에 닿아도 중심선이 멀어 포착이 안 되고, 반경을 키우면 일부러 떼어 놓은 후보까지
    // 빨려 들어간다. 표면에서 12px 이내(=겹치거나 거의 닿음)일 때만 끼운다.
    const surfaceMargin = 12;
    // 뚜렷하게 길쭉한 후보(창문)는 코너에서 직교 벽이 더 가깝게 잡히면 긴 축이 90도
    // 뒤집혀 버린다 — 1차로 박스의 긴 축과 같은 방향인 벽만 보고, 없을 때만 전체로 넓힌다.
    // (문 박스는 거의 정사각형이라 방향을 신뢰할 수 없어 이 제한을 걸지 않는다.)
    const boxHorizontal = boxPx.width >= boxPx.height;
    const boxElongated = Math.max(boxPx.width, boxPx.height) >= Math.min(boxPx.width, boxPx.height) * 1.4;
    const findWall = (matchOrientationOnly: boolean) => {
      let best: Wall | null = null;
      let bestSurfaceDistance = Infinity;
      for (const probe of probes) {
        for (const candidateWall of walls) {
          if (matchOrientationOnly) {
            const wallHorizontal =
              Math.abs(candidateWall.end.x - candidateWall.start.x) >= Math.abs(candidateWall.end.y - candidateWall.start.y);
            if (wallHorizontal !== boxHorizontal) continue;
          }
          const thickness = Math.max(8, Number(candidateWall.thicknessPx ?? candidateWall.depthPx ?? 0) || 12);
          const surfaceDistance = distanceToWall(probe, candidateWall) - thickness / 2;
          if (surfaceDistance <= surfaceMargin && surfaceDistance < bestSurfaceDistance) {
            bestSurfaceDistance = surfaceDistance;
            best = candidateWall;
          }
        }
      }
      return best;
    };
    const wall = boxElongated ? findWall(true) ?? findWall(false) : findWall(false);
    if (!wall) return null;
    const horizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
    const wallThickness = Math.max(8, Number(wall.thicknessPx ?? wall.depthPx ?? 0) || 12);
    const openingLength = Math.max(boxPx.width, boxPx.height);
    if (horizontal) {
      const wallY = (wall.start.y + wall.end.y) / 2;
      return { boxPx: { height: wallThickness, width: openingLength }, horizontal, position: { x: position.x, y: wallY } };
    }
    const wallX = (wall.start.x + wall.end.x) / 2;
    return { boxPx: { height: openingLength, width: wallThickness }, horizontal, position: { x: wallX, y: position.y } };
  }

  // 이동해서 놓은 문/창문을, 길이는 유지한 채 가까운 끝이 이웃 벽에 닿도록 미끄러뜨린다.
  // (리사이즈 핸들뿐 아니라 통째로 옮길 때도 벽에 '착' 붙게.)
  // 축은 박스 모양으로 추측하지 않는다 — 문 박스는 거의 정사각형(문+회전 호)이라 추측이 틀리기
  // 쉬우므로, 끼워진 벽의 방향(horizontal)을 그대로 받아 그 축으로만 미끄러뜨린다.
  function slideOpeningEdgesToSnap(
    geometry: { boxPx: { height: number; width: number }; horizontal?: boolean; position: Point },
    excludeCandidateId?: string
  ) {
    const horizontal = geometry.horizontal ?? geometry.boxPx.width >= geometry.boxPx.height;
    const length = horizontal ? geometry.boxPx.width : geometry.boxPx.height;
    const center = horizontal ? geometry.position.x : geometry.position.y;
    const cross = horizontal ? geometry.position.y : geometry.position.x;
    let bestShift: number | null = null;
    for (const sign of [-1, 1] as const) {
      const edge = center + sign * (length / 2);
      const target = findWallEdgeSnapTarget(horizontal, cross, edge, {
        crossTolerancePx: (horizontal ? geometry.boxPx.height : geometry.boxPx.width) / 2,
        snapToOpeningsExcludingId: excludeCandidateId
      });
      if (target === null) continue;
      const shift = target - edge;
      if (bestShift === null || Math.abs(shift) < Math.abs(bestShift)) bestShift = shift;
    }
    if (bestShift === null || bestShift === 0) return geometry;
    const nextCenter = center + bestShift;
    return {
      boxPx: geometry.boxPx,
      position: horizontal ? { x: nextCenter, y: geometry.position.y } : { x: geometry.position.x, y: nextCenter }
    };
  }

  // edgeValue에 가장 가까운 스냅 대상을 찾는다(허용오차 내 없으면 null).
  // 문/창문 끝을 늘릴 때 자석처럼 붙이는 용도. 대상은 세 종류:
  // 1) 같은 축선 위 벽의 끝점  2) 직교하는 옆벽의 면(face) — 문이 옆벽에 '착' 붙는 경우
  // 3) (옵션) 같은 축선 위 이웃 문/창문의 가장자리 — 창문이 줄지어 있는 도면에서
  //    옆이 벽이 아니라 다른 창문이라 스냅이 안 걸리던 문제를 해결한다.
  function findWallEdgeSnapTarget(
    horizontal: boolean,
    cross: number,
    edgeValue: number,
    options?: { crossTolerancePx?: number; excludeWallId?: Wall["id"]; snapToOpeningsExcludingId?: string; tolerance?: number }
  ) {
    // 눈으로 '거의 붙었다' 싶은 간격에서도 자석이 걸리게 넉넉히 잡는다.
    // (벽 자체를 편집할 때는 옵션으로 더 좁게 준다 — 후보보다 정밀한 작업이라.)
    const tolerance = options?.tolerance ?? Math.max(36, 36 / viewScale);
    // cross 게이트 여유 — 창문처럼 검출 박스가 두꺼워 중심이 벽 중심선에서 벗어난 후보도
    // 자기 두께의 절반만큼은 같은 벽으로 인정해 스냅이 걸리게 한다.
    const extraCross = options?.crossTolerancePx ?? 0;
    let best: number | null = null;
    const consider = (target: number) => {
      const distance = Math.abs(target - edgeValue);
      if (distance <= tolerance && (best === null || distance < Math.abs(best - edgeValue))) best = target;
    };
    for (const wall of walls) {
      if (options?.excludeWallId !== undefined && String(wall.id) === String(options.excludeWallId)) continue;
      const wallHorizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
      const wallThickness = Math.max(14, Number(wall.thicknessPx ?? wall.depthPx ?? 0) || 12);
      if (wallHorizontal === horizontal) {
        // 같은 축선 위 벽: cross가 벽 중심선 근처일 때 끝점에 스냅.
        const wallCross = wallHorizontal ? (wall.start.y + wall.end.y) / 2 : (wall.start.x + wall.end.x) / 2;
        if (Math.abs(wallCross - cross) > wallThickness + extraCross) continue;
        consider(horizontal ? wall.start.x : wall.start.y);
        consider(horizontal ? wall.end.x : wall.end.y);
      } else {
        // 직교하는 옆벽: cross가 그 벽의 길이 범위 안일 때, 벽 중심선이 아니라
        // 양 면(중심 ± 두께/2)에 스냅해야 문 끝이 옆벽 면에 딱 맞는다.
        const spanA = horizontal ? wall.start.y : wall.start.x;
        const spanB = horizontal ? wall.end.y : wall.end.x;
        const spanMin = Math.min(spanA, spanB);
        const spanMax = Math.max(spanA, spanB);
        if (cross < spanMin - wallThickness - extraCross || cross > spanMax + wallThickness + extraCross) continue;
        const wallCenter = horizontal ? (wall.start.x + wall.end.x) / 2 : (wall.start.y + wall.end.y) / 2;
        consider(wallCenter - wallThickness / 2);
        consider(wallCenter + wallThickness / 2);
      }
    }
    if (options?.snapToOpeningsExcludingId !== undefined) {
      for (const candidate of openingCandidates) {
        if (candidate.id === options.snapToOpeningsExcludingId) continue;
        if (candidate.status === "REJECTED") continue;
        const box = candidate.boxPx;
        const position = candidate.position;
        if (!box || !position) continue;
        const candidateHorizontal = box.width >= box.height;
        if (candidateHorizontal !== horizontal) continue;
        const candidateCross = horizontal ? position.y : position.x;
        const candidateThickness = horizontal ? box.height : box.width;
        if (Math.abs(candidateCross - cross) > Math.max(candidateThickness, 14)) continue;
        const half = (horizontal ? box.width : box.height) / 2;
        const center = horizontal ? position.x : position.y;
        consider(center - half);
        consider(center + half);
      }
    }
    return best;
  }

  // 문/창문 후보 히트 테스트 — 크기(boxPx)가 있으면 사각형 기준으로 재고,
  // 긴 축 양끝 근처는 리사이즈 핸들로 판정한다.
  function findOpeningCandidateHit(
    point: Point,
    radius: number
  ): { axis: "horizontal" | "vertical"; candidate: FloorPlanCandidate; mode: "move" | "resize-start" | "resize-end" } | null {
    let best: { distance: number; hit: NonNullable<ReturnType<typeof findOpeningCandidateHit>> } | null = null;
    for (const candidate of openingCandidates) {
      const position = candidate.position ?? { x: 0, y: 0 };
      const box = candidate.boxPx;
      if (!box) {
        const distance = Math.hypot(position.x - point.x, position.y - point.y);
        if (distance <= radius && (!best || distance < best.distance)) {
          best = { distance, hit: { axis: "horizontal", candidate, mode: "move" } };
        }
        continue;
      }
      const halfWidth = box.width / 2;
      const halfHeight = box.height / 2;
      const outsideX = Math.max(Math.abs(point.x - position.x) - halfWidth, 0);
      const outsideY = Math.max(Math.abs(point.y - position.y) - halfHeight, 0);
      const distance = Math.hypot(outsideX, outsideY);
      if (distance > radius) continue;
      const horizontal = openingAxisIsHorizontal(position, box);
      // 리사이즈 핸들 판정폭 — 짧은 후보(가는 창문)는 고정폭이면 박스 대부분이 핸들이 돼
      // '옮기려는데 늘어나는' 오조작이 잦다. 긴 축의 1/4로 상한을 둬 가운데 절반은 항상 이동으로 남긴다.
      const boxLength = horizontal ? box.width : box.height;
      const endGrab = Math.min(Math.max(10, 10 / viewScale), boxLength / 4);
      let mode: "move" | "resize-start" | "resize-end" = "move";
      if (horizontal) {
        if (Math.abs(point.x - (position.x - halfWidth)) <= endGrab) mode = "resize-start";
        else if (Math.abs(point.x - (position.x + halfWidth)) <= endGrab) mode = "resize-end";
      } else if (Math.abs(point.y - (position.y - halfHeight)) <= endGrab) mode = "resize-start";
      else if (Math.abs(point.y - (position.y + halfHeight)) <= endGrab) mode = "resize-end";
      if (!best || distance < best.distance) {
        best = { distance, hit: { axis: horizontal ? "horizontal" : "vertical", candidate, mode } };
      }
    }
    return best?.hit ?? null;
  }

  // 문/창문 후보의 가로/세로 판정. 문 박스는 정사각형에 가까워 모양만으로 판별하면
  // 두꺼운 벽에서 축이 뒤집힌다 — 몸 붙인 벽(표면 22px 이내)이 있으면 그 방향을 따른다.
  function openingAxisIsHorizontal(position: Point, box: { height: number; width: number }) {
    const hit = findClosestWallBySurface(position, Math.max(22, 22 / viewScale));
    if (hit) return wallGeometryOf(hit.wall).horizontal;
    return box.width >= box.height;
  }

  function toggleOpeningCandidateType(candidateId: string) {
    const target = openingCandidates.find((candidate) => candidate.id === candidateId);
    if (!target) return;
    const nextType = target.type.toUpperCase() === "WINDOW" ? "DOOR" : "WINDOW";
    setOpeningCandidates((candidates) =>
      candidates.map((candidate) => (candidate.id === candidateId ? { ...candidate, type: nextType } : candidate))
    );
    setUploadStatus(`${candidateTypeLabel(target.type)} → ${candidateTypeLabel(nextType)} 전환`);
  }

  // 검토 대기 후보 일괄 처리 — minConfidence 이상인 CANDIDATE만 대상으로 한다(0이면 전체).
  function bulkSetCandidateStatus(minConfidence: number, status: CandidateStatus) {
    const apply = (candidates: FloorPlanCandidate[]) =>
      candidates.map((candidate) =>
        candidate.status === "CANDIDATE" && (candidate.confidence ?? 0) >= minConfidence ? { ...candidate, status } : candidate
      );
    setOpeningCandidates(apply);
    setFixtureCandidates(apply);
    const scopeLabel = minConfidence > 0 ? `신뢰도 ${Math.round(minConfidence * 100)}% 이상` : "대기 중 전체";
    setUploadStatus(`${scopeLabel} 후보 일괄 ${status === "CONFIRMED" ? "확정" : "삭제"}`);
  }

  // 방 내부 재기로 측정/입력한 실측값 — 저장 payload에 실어 가구 fit 판단의 근거로 남긴다.
  function buildRoomInteriorMeasurement() {
    const widthMm = Number(roomWidthMm);
    const depthMm = Number(roomDepthMm);
    return {
      areaM2: roomAreaM2,
      depthMm: depthMm > 0 ? Math.round(depthMm) : null,
      widthMm: widthMm > 0 ? Math.round(widthMm) : null
    };
  }

  // 3D 변환 결과를 JSON 파일로 다운로드 — 서버 저장과 별개로 로컬 보관/외부 활용용.
  function downloadRoom3DJson() {
    const snapshot = buildRoom3DSnapshot({
      fixtureCandidates,
      hiddenWallCount,
      landlordFurnitures: placedFurnitures.filter(isLandlordOptionFurniture),
      openingCandidates,
      walls3D: roomWalls3D
    });
    const payload = {
      exportedAt: new Date().toISOString(),
      pixelToMmRatio,
      room3d: snapshot,
      roomInterior: buildRoomInteriorMeasurement(),
      scaleConfirmed: isScaleSet,
      source: "roomlog-floor-plan-editor"
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `roomlog-3d-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setUploadStatus(`3D 데이터 JSON 다운로드 — 벽 ${snapshot.wallCount}개`);
  }

  async function saveFloorPlanDraft(nextStatus: "DRAFT" | "PUBLISHED" = "DRAFT") {
    const landlordOptionFurnitures = placedFurnitures.filter(isLandlordOptionFurniture);
    const isRegistering = nextStatus === "PUBLISHED";
    const payload = buildFloorPlanDraftPayload({
      extractionMeta,
      fixtureCandidates,
      hiddenWallCount,
      hiddenWallIds: Array.from(hiddenWallIds),
      landlordFurnitures: landlordOptionFurnitures,
      openingCandidates,
      pixelToMmRatio,
      roomInterior: buildRoomInteriorMeasurement(),
      scaleConfirmed: isScaleSet,
      status: nextStatus,
      uploadedFloorPlanSource,
      uploadedImage,
      walls,
      walls3D: roomWalls3D
    });

    if (isRegistering && roomWalls3D.length === 0) {
      setUploadStatus("등록하려면 먼저 3D 변환 데이터가 필요합니다");
      return;
    }

    if (isRegistering) {
      persistListingFloorPlanSnapshot(roomWalls3D, landlordOptionFurnitures);
    }

    try {
      setUploadStatus(isRegistering ? "도면 등록중" : "도면 저장중");
      const endpoint = floorPlanDraftId ? apiUrl(`/floor-plans/${floorPlanDraftId}`) : apiUrl("/floor-plans");
      const response = await floorPlanAuthorizedFetch(endpoint, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: floorPlanDraftId ? "PATCH" : "POST"
      });
      if (!response.ok) throw new Error(`Floor plan save failed: ${response.status}`);

      const saved = (await response.json()) as { id?: string };
      if (saved.id) setFloorPlanDraftId(saved.id);
      window.localStorage.setItem("floorPlanDraft", JSON.stringify({ ...payload, id: saved.id, savedAt: Date.now() }));
      // 매물 등록 폼이 읽어 갈 3D 스냅샷을 남긴다 — 이걸로 상세 "3D 보기"가 실제 도면을 렌더한다.
      persistListingFloorPlanSnapshot(roomWalls3D, landlordOptionFurnitures);
      const savedAtLabel = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      setUploadStatus(isRegistering ? "📢 등록 준비 완료" : `💾 초안 저장됨 · ${savedAtLabel}`);
    } catch {
      window.localStorage.setItem("floorPlanDraft", JSON.stringify({ ...payload, savedAt: Date.now(), status: "LOCAL_DRAFT" }));
      setUploadStatus(isRegistering ? "서버 저장 실패 — 매물 등록 화면에서 로컬 도면으로 이어갑니다" : "⚠️ 서버 저장 실패 — 이 브라우저에만 임시 저장됨");
    } finally {
      if (isRegistering) window.location.href = FLOOR_PLAN_LISTING_RETURN_PATH;
    }
  }

  function switchViewMode(nextMode: ViewMode) {
    if (nextMode === viewMode) return;
    const landlordOptionFurnitures = placedFurnitures.filter(isLandlordOptionFurniture);
    setViewMode(nextMode);
    if (nextMode !== "3d") return;

    // 3D 변환을 하면 매물 등록 폼이 바로 연결할 수 있게 스냅샷도 갱신한다(저장 전이라도).
    persistListingFloorPlanSnapshot(roomWalls3D, landlordOptionFurnitures);
    window.localStorage.setItem(
      "floorPlanData",
      JSON.stringify(buildFloorPlanLocalSnapshot({
        extractionMeta,
        fixtureCandidates,
        hiddenWallIds: Array.from(hiddenWallIds),
        landlordFurnitures: landlordOptionFurnitures,
        openingCandidates,
        pixelToMmRatio,
        roomInterior: buildRoomInteriorMeasurement(),
        timestamp: Date.now(),
        walls,
        walls3D: roomWalls3D
      }))
    );
  }

  function convertTo3D() {
    switchViewMode("3d");
  }

  return (
    <section className="floor-plan-editor wheretoput-floor-plan-editor" aria-label="도면 캔버스">
      {/* 예전 좌측 레일(모드 스위치 + 도구 목록)은 제거 — 도구는 캔버스 위 플로팅 툴바로 이동해
          맵이 화면 폭을 온전히 쓴다. */}
      <section className="floor-plan-canvas wheretoput-floor-plan-canvas" aria-label="도면 캔버스">
        <div className="floor-plan-upload-row">
          <input
            accept="image/*"
            className="floor-plan-file-input"
            disabled={isProcessing}
            id="floor-plan-source-input"
            onChange={handleImageUpload}
            type="file"
          />
          {/* 작업 순서대로 배치: 도면 등록 → 도면 인식(문/창문 탐지) → 인식 보정(벽 후처리) → 세부 조정(방 크기 재기) */}
          <label
            aria-disabled={isProcessing}
            className={`floor-plan-secondary floor-plan-upload-label${isProcessing ? " is-disabled" : ""}`}
            htmlFor="floor-plan-source-input"
          >
            도면 등록
          </label>
          <button
            className="floor-plan-secondary"
            disabled={isProcessing || (!uploadedFloorPlanSource?.attachmentId && !uploadedAiImageDataUrl)}
            onClick={() => runOpeningDetection()}
            title="Roboflow로 도면의 벽·문/창문을 자동 인식합니다"
            type="button"
          >
            도면 인식
          </button>
          <button
            className="floor-plan-secondary"
            disabled={isProcessing || !roboflowDetections}
            onClick={applyRoboflowWallPostProcessing}
            title="인식 결과를 3D 변환용 벽으로 정리합니다"
            type="button"
          >
            인식 보정
          </button>
          <button
            className={tool === "interior" ? "floor-plan-secondary active" : "floor-plan-secondary"}
            onClick={() => startInteriorMeasure("scale")}
            title="실제 길이를 아는 두 점을 클릭해 축척(1px=mm)을 맞춥니다"
            type="button"
          >
            세부 조정
          </button>
          <button
            aria-label={sidePanelOpen ? "요약 패널 닫기" : "요약 패널 열기"}
            className={sidePanelOpen ? "floor-plan-secondary floor-plan-panel-toggle active" : "floor-plan-secondary floor-plan-panel-toggle"}
            onClick={() => setSidePanelOpen((current) => !current)}
            style={{ marginLeft: "auto" }}
            title="도면 요약·후보 검토·가구 패널을 열고 닫습니다"
            type="button"
          >
            ☰
          </button>
        </div>

        {wallBoundsMm ? (
          // 축척 확정 전의 mm 수치는 가짜값이라 노출하지 않는다 — 안내 문구만 조용히 보여준다.
          <div className={`floor-plan-scale-banner${isScaleSet ? " is-set" : ""}`}>
            {isScaleSet
              ? `📐 전체 ${wallBoundsMm.widthMm.toLocaleString()}mm × ${wallBoundsMm.heightMm.toLocaleString()}mm`
              : "축척을 먼저 맞추세요 — '세부 조정 → 축척 맞추기'"}
          </div>
        ) : null}

        {printedDimensionChips.length || openingDimensionChips.length || furnitureDimensionChips.length ? (
          <div className="floor-plan-visible-dimension-strip" aria-label="읽힌 치수 빠른 확인">
            <span>구조 치수</span>
            {gridSpec.stepMm ? <code>격자 1칸={gridSpec.stepMm}mm</code> : null}
            {isScaleSet ? (
              <code>축척 적용됨 1px={pixelToMmRatio.toFixed(2)}mm</code>
            ) : printedDimensionScale ? (
              <code>
                축척 후보 1px={printedDimensionScale.pixelToMmRatio.toFixed(2)}mm (
                {printedDimensionScale.source.includes("dimension-line")
                  ? "치수선 검출 기준"
                  : printedDimensionScale.source.includes("wall-union")
                    ? "벽 탐지 기준"
                    : "AI 선 기준"})
              </code>
            ) : (
              <code>축척 후보 없음 — 도면 인식을 먼저 실행하세요</code>
            )}
            <div className="floor-plan-visible-dimension-chips">
              {printedDimensionChips.map((dimension) => (
                <button
                  className="floor-plan-dimension-chip"
                  disabled={!printedDimensionScale && !dimension.targetLine}
                  key={dimension.id}
                  onClick={() => applyPrintedDimensionScale(dimension)}
                  title={printedDimensionScale || dimension.targetLine ? "클릭하면 읽힌 치수 기준 축척을 적용합니다" : getPrintedDimensionLocationStatus(dimension)}
                  type="button"
                >
                  {dimension.text}
                  {dimension.confidence ? ` ${Math.round(dimension.confidence * 100)}%` : ""}
                  {!hasReliableDimensionPlacement(dimension) ? ` ${getPrintedDimensionLocationStatus(dimension)}` : ""}
                </button>
              ))}
            </div>
            {openingDimensionChips.length ? (
              <div className="floor-plan-visible-dimension-aside">
                <span>문/창문 폭 (벽 길이 아님)</span>
                <div className="floor-plan-visible-dimension-chips">
                  {openingDimensionChips.map((dimension) => (
                    <span className="floor-plan-dimension-chip is-opening" key={dimension.id} title="opening으로 분리 저장 — 축척/벽 생성에 쓰지 않음">
                      {dimension.text}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {furnitureDimensionChips.length ? (
              <div className="floor-plan-visible-dimension-aside">
                <span>가구/설비 (배치 검증용)</span>
                <div className="floor-plan-visible-dimension-chips">
                  {furnitureDimensionChips.map((dimension) => (
                    <span className="floor-plan-dimension-chip is-furniture" key={dimension.id} title="가구 치수 — 공간 크기 계산에 쓰지 않고 배치 가능 비교용으로만 보관">
                      {dimension.text}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="floor-plan-stage-wrap">
          {viewMode === "2d" ? (
            <div className="floor-plan-float-tools" role="toolbar" aria-label="편집 도구">
              {([
                ["wall", "벽 그리기", "드래그로 새 벽 추가", Pencil],
                ["select", "벽 편집", "몸통 드래그=이동 · 끝 드래그=길이 조절", MousePointer2],
                ["eraser", "지우기", "벽 클릭 삭제", Eraser],
                ["partial_eraser", "부분 지우기", "벽 일부 삭제", Scissors],
                ["hide", "숨기기", "3D 벽 숨기기", EyeOff],
                ["opening", "문창문", "드래그 이동 · 끝 늘리기 · 더블클릭 추가", DoorOpen],
                ["fixture", "설비", "고정 설비 후보 검토", Wrench],
                ["furniture", "옵션가구", "임대인 옵션 가구 배치", Armchair],
                ["none", "화면 이동", "캔버스 화면 끌기", Hand]
              ] as const).map(([toolId, label, hint, ToolIcon]) => (
                <button
                  className={tool === toolId ? "active" : ""}
                  key={toolId}
                  onClick={() => {
                    setTool(toolId as EditorTool);
                    setPartialEraserSelectedWall(null);
                    if (toolId !== "select") setSelectedWall(null);
                    if (toolId !== "fixture" && toolId !== "opening") {
                      restorePendingFurnitureOrigin();
                      setPendingFurniture(null);
                      setSelectedFurnitureId(null);
                    }
                  }}
                  title={`${label} — ${hint}`}
                  type="button"
                >
                  <ToolIcon size={17} strokeWidth={2.2} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {viewMode === "2d" ? (
          <div className="floor-plan-canvas-stage">
            <div className="floor-plan-canvas-shell" ref={containerRef}>
              <canvas
                className="floor-plan-drawing-canvas"
                onAuxClick={handleCanvasAuxClick}
                onContextMenu={(event) => event.preventDefault()}
                onDoubleClick={handleCanvasDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleCanvasMouseLeave}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                ref={canvasRef}
              />
            </div>
            {isScanningPlan ? (
              <div className="floor-plan-scan-overlay" role="status" aria-live="polite">
                <div className="floor-plan-scan-beam" aria-hidden="true" />
                <span className="floor-plan-scan-label">
                  도면 인식 중
                  <span className="floor-plan-scan-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
            ) : null}
            <div className="floor-plan-zoom-controls" role="group" aria-label="화면 배율 조절">
              <button aria-label="축소" onClick={() => zoomViewBy(1 / 1.2)} title="축소" type="button">
                −
              </button>
              <span className="floor-plan-zoom-value">{Math.round(viewScale * 100)}%</span>
              <button aria-label="확대" onClick={() => zoomViewBy(1.2)} title="확대" type="button">
                +
              </button>
              <button
                className="floor-plan-zoom-fit"
                disabled={walls.length === 0}
                onClick={() => fitViewToWalls(walls)}
                title="도면 전체가 보이도록 화면을 맞춥니다"
                type="button"
              >
                맞춤
              </button>
            </div>
            {walls.length === 0 && !uploadedImage && !isProcessing ? (
              <div className="floor-plan-empty-guide" aria-label="도면 시작 안내">
                <strong>도면을 등록해 시작하세요</strong>
                <p>도면 이미지를 올리면 벽·문/창문을 자동으로 인식해요. 도면이 없다면 왼쪽 드로잉 도구로 벽을 직접 그릴 수 있어요.</p>
                <div className="floor-plan-empty-guide-actions">
                  <label className="floor-plan-primary floor-plan-upload-label" htmlFor="floor-plan-source-input">
                    도면 이미지 등록
                  </label>
                  {availableDraft ? (
                    <button
                      className="floor-plan-secondary"
                      onClick={restoreSavedDraft}
                      title={
                        typeof availableDraft.savedAt === "number"
                          ? `${new Date(availableDraft.savedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} 저장본`
                          : "마지막으로 저장한 도면을 불러옵니다"
                      }
                      type="button"
                    >
                      이전 초안 이어서 하기
                    </button>
                  ) : null}
                  <button
                    className="floor-plan-secondary"
                    onClick={() => {
                      const starterWalls = getStarterWalls();
                      setWalls(starterWalls);
                      fitViewToWalls(starterWalls);
                      setUploadStatus("샘플 도면을 불러왔어요 — 자유롭게 수정해보세요");
                    }}
                    type="button"
                  >
                    샘플 도면으로 체험
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <RoomlogThreeFloorPlanView
            controlsEnabled={!pendingFurniture}
            furnitureData={placedFurnitures}
            onFloorPointerDown={handle3DFloorPointerDown}
            onFloorPointerMove={handle3DFloorPointerMove}
            onFurniturePointerDown={handleFurniturePointerDown}
            onPendingCancel={cancelPendingFurniturePlacement}
            onPendingConfirm={confirmPendingFurniturePlacement}
            onSelectedDelete={deleteSelectedFurniture}
            onSelectedMove={beginSelectedFurnitureMove}
            onSelectedRotateLeft={() => rotateSelectedFurniture(-1)}
            onSelectedRotateRight={() => rotateSelectedFurniture(1)}
            onWallPointerDown={handle3DWallPointerDown}
            pendingFurniture={pendingFurniture}
            selectedFurnitureId={selectedFurnitureId}
            selectedWallId={selectedWall?.id ?? null}
            wallsData={roomWalls3D}
          />
        )}
        </div>

        <div className="floor-plan-actions">
          {/* 캔버스 정리 버튼 줄(전체 지우기/샘플 복원/화면 초기화/숨김 복원)은 안 쓰여서 제거 —
             변환→저장→등록 핵심 흐름만 남긴다. */}
          {/* 저장 결과는 인라인 라벨 대신 잠깐 떴다 사라지는 토스트로 알린다(버튼 밀림 방지). */}
          <div className="floor-plan-actions-group floor-plan-actions-main" aria-label="변환과 저장">
            <div className={`floor-plan-view-toggle is-${viewMode}`} role="group" aria-label="도면 보기 전환">
              <span className="floor-plan-view-toggle-thumb" aria-hidden="true" />
              <button
                aria-pressed={viewMode === "3d"}
                className={viewMode === "3d" ? "active" : ""}
                onClick={convertTo3D}
                title="3D 변환"
                type="button"
              >
                3D
              </button>
              <button
                aria-pressed={viewMode === "2d"}
                className={viewMode === "2d" ? "active" : ""}
                onClick={() => switchViewMode("2d")}
                title="2D 편집"
                type="button"
              >
                2D
              </button>
            </div>
            <button
              className="floor-plan-secondary"
              disabled={roomWalls3D.length === 0}
              onClick={downloadRoom3DJson}
              title="3D 변환 결과(벽·문창문·설비·가구)를 JSON 파일로 내려받습니다"
              type="button"
            >
              JSON 내려받기
            </button>
            <button
              className="floor-plan-primary"
              disabled={isProcessing || walls.length === 0}
              onClick={() => saveFloorPlanDraft("DRAFT")}
              title="지금까지 그린 도면을 초안으로 저장합니다"
              type="button"
            >
              초안 저장
            </button>
            <button
              className="floor-plan-primary"
              disabled={isProcessing || roomWalls3D.length === 0}
              onClick={() => saveFloorPlanDraft("PUBLISHED")}
              title={roomWalls3D.length > 0 ? "도면을 매물 등록 화면에 연결합니다" : "등록하려면 먼저 3D 변환 데이터가 필요합니다"}
              type="button"
            >
              등록
            </button>
          </div>
        </div>

        {statusToasts.length > 0 ? (
          // 상태 메시지 토스트 스택 — 캔버스 하단 중앙에 최근 3개까지 쌓이고 몇 초 뒤 사라진다.
          <div className="floor-plan-toast-stack" aria-live="polite">
            {statusToasts.map((toast) => (
              <div className="floor-plan-toast" key={toast.id}>
                {toast.text}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <aside className={`floor-plan-sidepanel floor-plan-drawer${sidePanelOpen ? " is-open" : ""}`} aria-hidden={!sidePanelOpen} aria-label="도면 요약">
        <div className="floor-plan-drawer-head">
          <strong>내 도면</strong>
          <button className="floor-plan-secondary" onClick={() => setSidePanelOpen(false)} type="button">
            닫기
          </button>
        </div>
        {/* 드로어 내부 섹션은 <details> 드롭다운 — 안 보는 섹션은 접어서 스크롤을 줄인다 */}
        <details className="floor-plan-drawer-section">
          <summary>도면 상태</summary>
          <div className="floor-plan-drawer-section-body">
        <dl>
          <div>
            <dt>벽체</dt>
            <dd>{summary.wallCount}개{hiddenWallCount > 0 ? ` (숨김 ${hiddenWallCount})` : ""}</dd>
          </div>
          <div>
            <dt>예상 둘레</dt>
            <dd>{summary.approximateMeters}m</dd>
          </div>
          <div>
            <dt>축척</dt>
            <dd>{isScaleSet ? `1px=${pixelToMmRatio.toFixed(2)}mm` : "미설정 (세부 조정)"}</dd>
          </div>
          <div>
            <dt>문/창문 · 설비 확정</dt>
            <dd>
              {openingCandidates.filter((candidate) => candidate.status === "CONFIRMED").length}/{openingCandidates.length} ·{" "}
              {fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED").length}/{fixtureCandidates.length}
            </dd>
          </div>
          <div>
            <dt>저장</dt>
            <dd>{floorPlanDraftId ? "서버 저장됨" : "로컬 초안"}</dd>
          </div>
        </dl>
          </div>
        </details>

        <>
            {/* 방 크기 측정 — 캔버스 위 가로 스트립에서 드로어 섹션으로 이동. '세부 조정'에 들어가면 자동으로 펼쳐진다.
                축척(1px=mm)은 여기서 따로 확정하고, 가로/세로 재기는 확정된 축척을 소비만 한다. */}
            <details className="floor-plan-drawer-section" ref={interiorMeasureSectionRef}>
              <summary>방 크기 측정</summary>
              <div className="floor-plan-drawer-section-body">
                <div className="floor-plan-interior-measure-strip" aria-label="방 크기 측정">
                  <button
                    className={interiorMeasureTarget === "scale" ? "floor-plan-secondary active" : "floor-plan-secondary"}
                    onClick={() => startInteriorMeasure("scale")}
                    title="실제 길이를 아는 두 점을 클릭하고 mm를 입력하면 축척이 확정됩니다"
                    type="button"
                  >
                    축척 맞추기 (두 점)
                  </button>
                  <code>{isScaleSet ? `1px = ${pixelToMmRatio.toFixed(2)}mm` : "축척 없음"}</code>
                  {interiorMeasureTarget === "scale" && interiorMeasurePx > 0 ? (
                    <>
                      <code>{Math.round(interiorMeasurePx)}px = ? mm</code>
                      <input
                        aria-label="측정한 실제 길이"
                        onChange={(event) => setInteriorCalibrationMm(event.target.value)}
                        placeholder="이 선의 실제 길이 mm"
                        style={{ width: 130 }}
                        type="number"
                        value={interiorCalibrationMm}
                      />
                      <button className="floor-plan-primary" disabled={!interiorCalibrationMm} onClick={applyInteriorCalibration} type="button">
                        축척 확정
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </details>

            {printedDimensionChips.length ? (
              <details className="floor-plan-drawer-section">
                <summary>구조 치수</summary>
                <div className="floor-plan-drawer-section-body">
                <div className="floor-plan-furniture-actions">
                  {printedDimensionChips.map((dimension) => (
                    <button
                      className="floor-plan-dimension-chip"
                      disabled={!printedDimensionScale && !dimension.targetLine}
                      key={dimension.id}
                      onClick={() => applyPrintedDimensionScale(dimension)}
                      title={printedDimensionScale || dimension.targetLine ? "클릭하면 읽힌 치수 기준 축척을 적용합니다" : getPrintedDimensionLocationStatus(dimension)}
                      type="button"
                    >
                      {dimension.text}
                      {dimension.confidence ? ` ${Math.round(dimension.confidence * 100)}%` : ""}
                      {!hasReliableDimensionPlacement(dimension) ? ` ${getPrintedDimensionLocationStatus(dimension)}` : ""}
                    </button>
                  ))}
                </div>
                </div>
              </details>
            ) : null}

            {pendingCandidates.length > 0 || reviewedCandidateCount > 0 ? (
              <details className="floor-plan-drawer-section" aria-label="문창문·설비 후보 검토">
                <summary>
                  후보 검토 대기 <strong>{pendingCandidates.length}</strong>개
                  {reviewedCandidateCount > 0 ? <em> · 처리됨 {reviewedCandidateCount}</em> : null}
                </summary>
                <div className="floor-plan-drawer-section-body">
                  {pendingCandidates.length > 0 ? (
                    <div className="floor-plan-candidate-bulk">
                      <button
                        className="floor-plan-secondary"
                        disabled={highConfidencePendingCount === 0}
                        onClick={() => bulkSetCandidateStatus(0.8, "CONFIRMED")}
                        title="신뢰도 80% 이상 후보를 한 번에 확정합니다"
                        type="button"
                      >
                        80%↑ 모두 확정 ({highConfidencePendingCount})
                      </button>
                      <button className="floor-plan-secondary" onClick={() => bulkSetCandidateStatus(0, "CONFIRMED")} type="button">
                        전체 확정
                      </button>
                      <button className="floor-plan-secondary" onClick={() => bulkSetCandidateStatus(0, "REJECTED")} type="button">
                        전체 삭제
                      </button>
                    </div>
                  ) : null}
                {pendingCandidates.length > 0 ? (
                  <ul className="floor-plan-candidate-list">
                    {pendingCandidates.map(([layer, candidate]) => (
                      <li
                        key={`${layer}-${candidate.id}`}
                        onMouseEnter={() => setHoveredCandidateId(candidate.id)}
                        onMouseLeave={() => setHoveredCandidateId((current) => (current === candidate.id ? null : current))}
                      >
                        <span className={`floor-plan-candidate-badge is-${layer}`}>{candidateTypeLabel(candidate.type)}</span>
                        <span className="floor-plan-candidate-confidence">{Math.round((candidate.confidence ?? 0) * 100)}%</span>
                        <span className="floor-plan-candidate-actions">
                          <button onClick={() => toggleCandidateStatus(layer, candidate.id, "CONFIRMED")} type="button">
                            확정
                          </button>
                          <button className="is-reject" onClick={() => toggleCandidateStatus(layer, candidate.id, "REJECTED")} type="button">
                            삭제
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <code>모든 후보를 검토했어요 — 문창문 도구로 드래그(이동)·Alt+클릭(문↔창문)·더블클릭(추가)으로 계속 수정할 수 있어요</code>
                )}
                </div>
              </details>
            ) : null}
        </>

        {/* 가구 섹션은 가구 도구뿐 아니라 3D 보기에서도 노출 — 3D에서는 가구 배치가 주 작업인데
            도구 상태에만 묶여 있으면 '3D 배치 보기'로 바로 들어온 경우 가구 패널이 안 보인다. */}
        {tool === "furniture" || viewMode === "3d" ? (
          <>
            <details className="floor-plan-drawer-section">
              <summary>임대인 옵션 가구</summary>
              <div className="floor-plan-drawer-section-body floor-plan-furniture-library">
              <code>
                {furnitureCatalogStatus} {filteredFurnitureCatalog.length}/{furnitureCatalog.length} / 옵션 {landlordOptionFurnitures.length}
              </code>
              <div className="floor-plan-furniture-search">
                <input
                  aria-label="가구 검색" onChange={(event) => setFurnitureSearchQuery(event.target.value)}
                  placeholder="가구명, 브랜드, 카테고리 검색"
                  type="search"
                  value={furnitureSearchQuery}
                />
              </div>
              <div className="floor-plan-furniture-kind-tabs" role="tablist" aria-label="도면 캔버스">
                {furnitureKindFilters.map((kind) => (
                  <button
                    aria-selected={furnitureKindFilter === kind}
                    className={furnitureKindFilter === kind ? "active" : ""}
                    key={kind}
                    onClick={() => setFurnitureKindFilter(kind)}
                    role="tab"
                    type="button"
                  >
                    {kind}
                    <small>{kind === "전체" ? furnitureCatalog.length : furnitureKindCounts[kind] ?? 0}</small>
                  </button>
                ))}
              </div>
              <div className="floor-plan-furniture-grid">
                {filteredFurnitureCatalog.map((item) => {
                  const imageUrl = furnitureImageUrl(item);
                  // 측정한 방 크기 대비 가능/빡빡/불가 — MVP의 핵심 판단. 방을 안 쟀으면 표시하지 않는다.
                  const fit = judgeFurnitureFit(catalogItemFootprint(item), {
                    widthMm: Number(roomWidthMm) || null,
                    depthMm: Number(roomDepthMm) || null
                  });

                  return (
                    <button
                      className={pendingFurniture?.furniture_id === item.furniture_id ? "active" : ""}
                      key={item.furniture_id}
                      onClick={() => handleFurnitureSelect(item)}
                      type="button"
                    >
                      <span className="floor-plan-furniture-thumb" style={{ backgroundColor: item.color }}>
                        {imageUrl ? (
                          <img
                            alt=""
                            decoding="async"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                            src={imageUrl}
                          />
                        ) : null}
                      </span>
                      <strong>{item.name}</strong>
                      <small>
                        {furnitureCategoryLabel(item)} · {item.brand}
                      </small>
                      <em>{item.length.join("x")}mm</em>
                      {fit.verdict !== "unknown" ? (
                        <small
                          style={{
                            color: fit.verdict === "fit" ? "#0a7a3d" : fit.verdict === "tight" ? "#b45309" : "#b91c1c",
                            fontWeight: 700
                          }}
                        >
                          {describeFurnitureFit(fit)}
                        </small>
                      ) : null}
                      <b>{Number(item.price).toLocaleString()}원</b>
                    </button>
                  );
                })}
              </div>
              </div>
            </details>

          </>
        ) : null}

        <a href={FLOOR_PLAN_LISTING_RETURN_PATH}>매물등록</a>
      </aside>
    </section>
  );
}
