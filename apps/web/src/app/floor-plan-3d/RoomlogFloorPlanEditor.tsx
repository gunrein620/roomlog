"use client";

import type { ThreeEvent } from "@react-three/fiber";
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
import {
  moveCandidate,
  updateCandidateStatus
} from "./plan-extraction/wall-detection.mjs";
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
  createPostProcessedWallOverlayBox,
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
  isLockedFurnitureForResident,
  moveFurnitureDraftToPoint,
  normalizeCatalogItem,
  rotateFurnitureQuarterTurn
} from "./furniture-placement";
import {
  buildFloorPlanDraftPayload,
  buildFloorPlanLocalSnapshot,
  buildResidentDesignPayload
} from "./room-model/room-payload";
import type {
  ExperienceMode,
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
  resizeWall,
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
const MAX_VISIBLE_PRINTED_DIMENSIONS = 24;
const WALL_EDIT_HANDLE_RADIUS = 16;
const AI_IMAGE_MAX_DIMENSION = 1600;
const FURNITURE_KIND_FILTERS = ["전체", "침대", "식탁", "의자", "소파", "책상", "서랍", "옷장", "기타"] as const;
type FurnitureKindFilter = (typeof FURNITURE_KIND_FILTERS)[number];

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
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
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

async function uploadFloorPlanSource(file: File): Promise<UploadedFloorPlanSource | null> {
  try {
    const token = await getFloorPlanAccessToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", "FLOOR_PLAN_SOURCE");
    const response = await fetch(apiUrl("/attachments"), {
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
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

export default function RoomlogFloorPlanEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("landlord");
  const [tool, setTool] = useState<EditorTool>("wall");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [walls, setWalls] = useState<Wall[]>(() => getStarterWalls());
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
  const [uploadStatus, setUploadStatus] = useState("도면을 등록하세요");
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState("문/창문 탐지 대기");
  const [floorPlanDraftId, setFloorPlanDraftId] = useState<string | null>(null);
  // 마지막 저장 결과 — 버튼 옆에 계속 표시해 "저장이 됐는지" 헷갈리지 않게 한다.
  const [saveState, setSaveState] = useState<{ kind: "draft" | "published" | "local"; at: number } | null>(null);
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
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [wallDragOperation, setWallDragOperation] = useState<WallDragOperation | null>(null);
  const [partialEraserSelectedWall, setPartialEraserSelectedWall] = useState<Wall | null>(null);
  const [isSelectingEraseArea, setIsSelectingEraseArea] = useState(false);
  const [eraseAreaStart, setEraseAreaStart] = useState<Point | null>(null);
  const [eraseAreaEnd, setEraseAreaEnd] = useState<Point | null>(null);
  const summary = useMemo(() => summarizeWalls(walls) as WallSummary, [walls]);
  const visibleWalls = useMemo(() => walls.filter((wall) => !hiddenWallIds.has(String(wall.id))), [hiddenWallIds, walls]);
  // 디버그 표시용이지만 확정된 축척을 넘겨 실치수와 일치시킨다(기본값 10mm/px 고정 방지).
  const wheretoputWalls = useMemo(
    () => convertWallsToWheretoputSimulator(walls as never, { pixelToMeterRatio: pixelToMmRatio / 1000 }) as WheretoputWall3D[],
    [pixelToMmRatio, walls]
  );
  const roomWalls3D = useMemo(
    () => convertWallsToWheretoputRoom3D(visibleWalls as never, { pixelToMmRatio }) as WheretoputWall3D[],
    [pixelToMmRatio, visibleWalls]
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
  const selectedFurniture = useMemo(
    () => placedFurnitures.find((furniture) => furniture.id === selectedFurnitureId) ?? null,
    [placedFurnitures, selectedFurnitureId]
  );
  const landlordOptionFurnitures = useMemo(() => placedFurnitures.filter(isLandlordOptionFurniture), [placedFurnitures]);
  const residentDesignFurnitures = useMemo(
    () => placedFurnitures.filter((furniture) => !isLandlordOptionFurniture(furniture)),
    [placedFurnitures]
  );
  const furnitureKindCounts = useMemo(
    () =>
      furnitureCatalog.reduce<Record<string, number>>((counts, item) => {
        const kind = catalogKind(item);
        counts[kind] = (counts[kind] ?? 0) + 1;

        return counts;
      }, {}),
    [furnitureCatalog]
  );
  const filteredFurnitureCatalog = useMemo(() => {
    const query = furnitureSearchQuery.trim().toLowerCase();

    return furnitureCatalog.filter((item) => {
      const kind = catalogKind(item);
      const matchesKind = furnitureKindFilter === "전체" || kind === furnitureKindFilter;
      const searchableText = `${item.name} ${item.brand} ${item.category ?? ""} ${item.source ?? ""}`.toLowerCase();
      const matchesQuery = !query || searchableText.includes(query);

      return matchesKind && matchesQuery;
    });
  }, [furnitureCatalog, furnitureKindFilter, furnitureSearchQuery]);

  useEffect(() => {
    let isActive = true;

    async function loadFurnitureCatalog() {
      try {
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

  useEffect(() => {
    if (experienceMode === "resident" && (tool === "opening" || tool === "fixture")) {
      setTool("furniture");
      setSelectedWall(null);
    }
  }, [experienceMode, tool]);
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
      if (isRoboflowPostProcessedWall) return;
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
      const color =
        candidate.status === "CONFIRMED" ? (layer === "opening" ? "#00a36c" : "#7a4fd6") : candidate.status === "REJECTED" ? "#9aa3b2" : "#ff8a00";
      context.save();
      context.globalAlpha = candidate.status === "REJECTED" ? 0.38 : 0.9;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 3 / viewScale;
      context.setLineDash(candidate.status === "CANDIDATE" ? [6 / viewScale, 4 / viewScale] : []);
      if (layer === "opening") {
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
      context.fillText(candidate.type, position.x, position.y - 16 / viewScale);
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
      const edgeSnapTolerance = 24;
      const areIntervalsNear = (startA: number, endA: number, startB: number, endB: number) =>
        Math.max(0, Math.max(startA, startB) - Math.min(endA, endB)) <= edgeSnapTolerance;
      const snapMergedWallOverlayBoxEdges = (boxes: Array<RoboflowDetectionOverlayBox["box"]>) => {
        const snappedBoxes = boxes.map((box) => ({ ...box }));

        for (let leftIndex = 0; leftIndex < snappedBoxes.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < snappedBoxes.length; rightIndex += 1) {
            const leftBox = snappedBoxes[leftIndex];
            const rightBox = snappedBoxes[rightIndex];

            if (areIntervalsNear(leftBox.x1, leftBox.x2, rightBox.x1, rightBox.x2)) {
              if (Math.abs(leftBox.y1 - rightBox.y1) <= edgeSnapTolerance) {
                const snappedY = Math.min(leftBox.y1, rightBox.y1);
                leftBox.y1 = snappedY;
                rightBox.y1 = snappedY;
              }
              if (Math.abs(leftBox.y2 - rightBox.y2) <= edgeSnapTolerance) {
                const snappedY = Math.max(leftBox.y2, rightBox.y2);
                leftBox.y2 = snappedY;
                rightBox.y2 = snappedY;
              }
            }

            if (areIntervalsNear(leftBox.y1, leftBox.y2, rightBox.y1, rightBox.y2)) {
              if (Math.abs(leftBox.x1 - rightBox.x1) <= edgeSnapTolerance) {
                const snappedX = Math.min(leftBox.x1, rightBox.x1);
                leftBox.x1 = snappedX;
                rightBox.x1 = snappedX;
              }
              if (Math.abs(leftBox.x2 - rightBox.x2) <= edgeSnapTolerance) {
                const snappedX = Math.max(leftBox.x2, rightBox.x2);
                leftBox.x2 = snappedX;
                rightBox.x2 = snappedX;
              }
            }
          }
        }

        return snappedBoxes;
      };
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
        const snappedWallBoxes = snapMergedWallOverlayBoxEdges(
          wallOverlayBoxes.map((overlayBox) => normalizeOverlayBox(overlayBox.box))
        );
        const openingAlignedSnappedWallBoxes = alignWallBoxesToFittedOpeningLines(
          snappedWallBoxes.map((box) => createPostProcessedWallOverlayBox(box)),
          openingOverlayBoxes
        );
        const cornerAlignedSnappedWallBoxes = alignConnectedPerpendicularWallBoxCorners(openingAlignedSnappedWallBoxes);
        const wallBoxes = cornerAlignedSnappedWallBoxes
          .map((overlayBox) => overlayBox.box)
          .filter((box) => box.x2 - box.x1 > 0 && box.y2 - box.y1 > 0);
        if (!wallBoxes.length) return;

        // 문/창문 박스: 벽을 이 자리에서 갈라(gap) 분리한다.
        const openingCutBoxes = openingOverlayBoxes.map((overlayBox) => normalizeOverlayBox(overlayBox.box));

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
      const drawOpeningOverlayBox = (overlayBox: RoboflowDetectionOverlayBox) => {
        const { box, confidence, type } = overlayBox;
        const color = detectionColors[type];
        context.strokeStyle = color;
        context.lineWidth = 2.4 / viewScale;
        context.globalAlpha = 0.62;
        context.fillStyle = color;
        context.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
        context.globalAlpha = 0.96;
        context.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
        context.globalAlpha = 1;

        drawOverlayConfidenceLabel(box, confidence, color);
      };

      context.save();
      if (hasPostProcessedWall) drawMergedWallOverlayBoxes();
      else wallOverlayBoxes.forEach(drawRawWallOverlayBox);
      openingOverlayBoxes.forEach(drawOpeningOverlayBox);
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
    openingCandidates,
    partialEraserSelectedWall,
    pixelToMmRatio,
    printedDimensionChips,
    printedDimensionLineSpans,
    printedDimensionScale,
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

  function findClosestWall(point: Point, maxDistance: number) {
    return walls.reduce<{ distance: number; wall: Wall | null }>(
      (closest, wall) => {
        const distance = distanceToWall(point, wall as never);
        return distance < closest.distance && distance < maxDistance ? { distance, wall } : closest;
      },
      { distance: Infinity, wall: null }
    ).wall;
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
    const nextWall =
      operation.mode === "move"
        ? (moveWall(operation.originalWall as never, {
            x: point.x - operation.originPoint.x,
            y: point.y - operation.originPoint.y
          }) as Wall)
        : (resizeWall(operation.originalWall as never, operation.mode === "resize-start" ? "start" : "end", point) as Wall);

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
    const previewFurniture = createFurnitureModel(item);
    setPendingFurniture(previewFurniture);
    setSelectedFurnitureId(null);
    setSelectedWall(null);
    setTool("furniture");
    setViewMode("3d");
    setUploadStatus(`${item.name} 배치 위치를 3D 바닥에서 클릭`);
  }

  function handle3DFloorPointerDown(event: ThreeEvent<PointerEvent>) {
    if (tool !== "furniture") return;
    event.stopPropagation();
    placeFurnitureAtPoint(event.point);
  }

  function placeFurnitureAtPoint(point: { x: number; z: number }) {
    if (!pendingFurniture) return;

    const nextFurniture = moveFurnitureDraftToPoint(pendingFurniture, point, roomWalls3D);
    setPendingFurniture(nextFurniture);
    setUploadStatus(`${nextFurniture.name} 위치 지정, 배치완료를 눌러 확정하세요`);
  }

  function confirmPendingFurniturePlacement() {
    if (!pendingFurniture) return;

    const nextFurniture = finalizeFurnitureDraft(pendingFurniture, experienceMode);
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, nextFurniture]);
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setUploadStatus(experienceMode === "landlord" ? `${nextFurniture.name} 임대인 옵션 가구 배치 완료` : `${nextFurniture.name} 배치 완료`);
  }

  function cancelPendingFurniturePlacement() {
    if (!pendingFurniture) return;

    const targetName = pendingFurniture.name;
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setUploadStatus(`${targetName} 배치 취소`);
  }

  function rotatePendingFurniture() {
    if (!pendingFurniture) return;

    const nextFurniture = rotateFurnitureQuarterTurn(pendingFurniture);
    setPendingFurniture(nextFurniture);
    setUploadStatus(`${nextFurniture.name} 90???뚯쟾`);
  }

  function handleFurniturePointerDown(furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    if (tool === "furniture" && pendingFurniture) {
      placeFurnitureAtPoint(event.point);
      return;
    }

    setSelectedFurnitureId(furniture.id);
    setSelectedWall(null);
    setPendingFurniture(null);
    setTool("furniture");
    setUploadStatus(
      isLockedFurnitureForResident(furniture, experienceMode)
        ? "임대인 옵션 가구는 세입자 모드에서 고정됩니다"
        : `${furniture.name} 선택`
    );
  }

  function rotateSelectedFurniture() {
    if (!selectedFurnitureId) return;
    if (selectedFurniture && isLockedFurnitureForResident(selectedFurniture, experienceMode)) {
      setUploadStatus("세입자는 임대인 옵션 가구를 변경할 수 없습니다");
      return;
    }
    setPlacedFurnitures((currentFurnitures) =>
      currentFurnitures.map((furniture) =>
        furniture.id === selectedFurnitureId
          ? rotateFurnitureQuarterTurn(furniture)
          : furniture
      )
    );
    setUploadStatus(`${selectedFurniture?.name ?? "가구"} 90도 회전`);
  }

  function removeSelectedFurniture() {
    if (!selectedFurnitureId) return;
    if (selectedFurniture && isLockedFurnitureForResident(selectedFurniture, experienceMode)) {
      setUploadStatus("세입자는 임대인 옵션 가구를 변경할 수 없습니다");
      return;
    }
    const targetName = selectedFurniture?.name ?? "가구";
    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((furniture) => furniture.id !== selectedFurnitureId));
    setSelectedFurnitureId(null);
    setUploadStatus(`${targetName} 삭제`);
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

    if (tool === "opening") {
      const closestCandidate = findClosestCandidate(openingCandidates, coords);
      if (closestCandidate) {
        toggleCandidateStatus("opening", closestCandidate.id, event.shiftKey ? "REJECTED" : "CONFIRMED");
      }
      return;
    }

    if (tool === "fixture") {
      const closestCandidate = findClosestCandidate(fixtureCandidates, coords);
      if (closestCandidate) {
        toggleCandidateStatus("fixture", closestCandidate.id, event.shiftKey ? "REJECTED" : "CONFIRMED");
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
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    // Legacy spec marker: Ctrl/Cmd/Alt ?좊줈 ?뺣?
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
    setUploadStatus(`화면 ${Math.round(nextScale * 100)}%`);
  }

  function handleCanvasAuxClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

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
      setAiAnalysisStatus("도면 등록 완료. 문/창문 탐지 버튼으로 Roboflow 탐지를 실행하세요.");
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
      const token = await getFloorPlanAccessToken();
      const response = await fetch(apiUrl("/floor-plans/ai-analysis"), {
        body: JSON.stringify({
          analysisMode: "dimension",
          forceRefresh,
          imageDataUrl: attachmentId ? undefined : uploadedAiImageDataUrl,
          model: "openai/floor-plan-vision",
          prompt: "인쇄된 평면도의 치수 숫자를 읽고 dimensions 배열로 분류해 주세요. 각 숫자는 kind(outer_total/outer_segment/room_span/wall_span/opening/furniture/fixture/area/ignore)로 분류합니다. 구조 치수(outer_total/outer_segment/room_span/wall_span)만 useForScale·useForWallGeneration을 true로 두고, 문/창문 폭은 opening, '1500 × 2000mm' 같은 가구 크기는 furniture, 면적(㎡)은 area로 둡니다. boundingBox와 targetLine은 0~1000 좌표로 넣되 불확실하면 null로 보냅니다. 같은 숫자라도 위치가 다르면 별도 항목으로 유지합니다.",
          sourceAttachmentId: attachmentId
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
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
    setAiAnalysisStatus("문/창문 후보 탐지중");
    try {
      const token = await getFloorPlanAccessToken();
      const response = await fetch(apiUrl("/floor-plans/opening-detection"), {
        body: JSON.stringify({
          imageDataUrl: attachmentId ? undefined : uploadedAiImageDataUrl,
          sourceAttachmentId: attachmentId
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
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
        `${result.summary} Roboflow 원본 박스 저장됨: 벽 ${detectedWalls.length}개, 문/창문 ${detectedOpenings.length}개. 벽 후처리 적용을 눌러 3D 변환용 벽으로 정리하세요.`
      );
    } catch {
      setAiAnalysisStatus("문/창문 탐지 실패");
    } finally {
      setIsProcessing(false);
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
      setAiAnalysisStatus("먼저 문/창문 탐지로 Roboflow 원본 박스를 가져오세요");
      return;
    }

    const currentSourceWalls = walls.filter(isWallUsableForRoboflowPostProcess);
    const fallbackSourceWalls = currentSourceWalls.length ? currentSourceWalls : walls.filter((wall) => {
      const source = (wall as AiGeneratedWall).source;
      return source !== "ai-room-edge" && source !== "ai-missing-wall-hint";
    });
    const fusionSourceWalls = roboflowWallPostProcessSourceWalls.length ? roboflowWallPostProcessSourceWalls : fallbackSourceWalls;

    // 파란 벽 박스 + (벽 라인에 정렬한) 노란 창문 박스를 벽 생성 기준으로. 창문 자리도 벽으로 이어짐. 문(DOOR)만 gap.
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

    // 3D 벽 = 화면에 보이는 벽 박스를 그대로 변환(중심선). 단 문(DOOR) 자리는 잘라서 뚫는다(창문은 이어짐 유지).
    const doorCutBoxes = fittedOpeningBoxes
      .filter((opening) => opening.type === "DOOR")
      .map((opening) => normalizeOverlayBox(opening.box));
    const wallsFromDisplayBoxes = cornerAlignedWallBoxes.flatMap((overlayBox, boxIndex) => {
      const box = normalizeOverlayBox(overlayBox.box);
      const horizontal = box.x2 - box.x1 >= box.y2 - box.y1;
      const thickness = Math.max(4, horizontal ? box.y2 - box.y1 : box.x2 - box.x1);
      const overlappingDoors = doorCutBoxes.filter(
        (door) => door.x1 < box.x2 && door.x2 > box.x1 && door.y1 < box.y2 && door.y2 > box.y1
      );
      const pieces = overlappingDoors.length ? splitEditorBoxAtOpenings(box, overlappingDoors, horizontal) : [box];
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
      setAiAnalysisStatus("보정할 구조 치수 경계가 없습니다. 문/창문 탐지 → 치수 읽기 → 벽 후처리를 먼저 하세요.");
      return;
    }
    if (!walls.length) {
      setAiAnalysisStatus("보정할 벽이 없습니다. 벽 후처리로 벽을 먼저 만드세요.");
      return;
    }
    // 다른 경계로 잘못 당기지 않게, 허용 오차를 경계 최소 간격의 45% 이하로 제한한다.
    const tolerancePx = getStructuralBoundaryTolerancePx(boundaries);
    const { movedCount, walls: corrected } = snapWallsToStructuralBoundaries(walls as never[], boundaries, tolerancePx) as {
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
    const snapped = snapWallsToStructuralBoundaries(walls as never[], boundaries, tolerancePx) as {
      movedCount: number;
      walls: Wall[];
    };
    const inferred = inferMissingWallsFromStructuralBoundaries(snapped.walls as never[], boundaries, tolerancePx, {
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
    // 연속 측정: 축척이 잡혔으니 남은 방 치수가 비어 있으면 바로 그 측정으로 넘어간다.
    const nextTarget = !roomWidthMm ? ("width" as const) : !roomDepthMm ? ("depth" as const) : null;
    if (nextTarget) {
      setInteriorMeasureTarget(nextTarget);
      setInteriorMeasurePx(0);
      setInteriorMeasureStart(null);
      setInteriorMeasureEnd(null);
      setUploadStatus(`축척 맞춤: 1px = ${ratio.toFixed(2)}mm — 이어서 방 안쪽 '${nextTarget === "width" ? "가로" : "세로"}' 두 점을 클릭하세요`);
    } else {
      setUploadStatus(`축척 맞춤: 1px = ${ratio.toFixed(2)}mm`);
    }
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

  function moveCandidateInLayer(layer: "opening" | "fixture", candidateId: string, delta: Point) {
    const updater = (candidates: FloorPlanCandidate[]) => moveCandidate(candidates, candidateId, delta) as FloorPlanCandidate[];
    if (layer === "opening") setOpeningCandidates(updater);
    else setFixtureCandidates(updater);
    setUploadStatus(`후보 레이어 ${candidateId} 이동`);
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

  async function saveFloorPlanDraft(nextStatus: "DRAFT" | "PUBLISHED" = "DRAFT") {
    const landlordOptionFurnitures = placedFurnitures.filter(isLandlordOptionFurniture);
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

    try {
      if (nextStatus === "PUBLISHED" && (!isScaleSet || roomWalls3D.length === 0 || walls.length === 0)) {
        setUploadStatus("발행 전 축척 확인과 3D 변환이 필요합니다");
        return;
      }
      setUploadStatus(nextStatus === "PUBLISHED" ? "도면 발행중" : "도면 저장중");
      const token = await getFloorPlanAccessToken();
      const endpoint = floorPlanDraftId ? apiUrl(`/floor-plans/${floorPlanDraftId}`) : apiUrl("/floor-plans");
      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: floorPlanDraftId ? "PATCH" : "POST"
      });
      if (!response.ok) throw new Error(`Floor plan save failed: ${response.status}`);

      const saved = (await response.json()) as { id?: string };
      if (saved.id) setFloorPlanDraftId(saved.id);
      window.localStorage.setItem("floorPlanDraft", JSON.stringify({ ...payload, id: saved.id, savedAt: Date.now() }));
      setSaveState({ kind: nextStatus === "PUBLISHED" ? "published" : "draft", at: Date.now() });
      setUploadStatus(nextStatus === "PUBLISHED" ? "발행 완료" : "저장 완료");
    } catch {
      window.localStorage.setItem("floorPlanDraft", JSON.stringify({ ...payload, savedAt: Date.now(), status: "LOCAL_DRAFT" }));
      setSaveState({ kind: "local", at: Date.now() });
      setUploadStatus("서버 저장 실패 — 이 브라우저에만 임시 저장됨");
    }
  }

  function convertTo3D() {
    const landlordOptionFurnitures = placedFurnitures.filter(isLandlordOptionFurniture);
    setViewMode((currentMode) => (currentMode === "2d" ? "3d" : "2d"));
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

  function saveResidentFurnitureDesign() {
    const landlordOptionFurnitures = placedFurnitures.filter(isLandlordOptionFurniture);
    const residentDesignFurnitures = placedFurnitures.filter((furniture) => !isLandlordOptionFurniture(furniture));
    const payload = buildResidentDesignPayload({
      fixtureCandidates,
      floorPlanDraftId,
      hiddenWallIds: Array.from(hiddenWallIds),
      landlordOptionFurnitures,
      openingCandidates,
      pixelToMmRatio,
      residentDesignFurnitures,
      savedAt: Date.now(),
      walls,
      walls3D: roomWalls3D
    });
    window.localStorage.setItem("residentFloorPlanDesign", JSON.stringify(payload));
    setUploadStatus("세입자용 배치 저장 완료");
  }

  return (
    <section className="floor-plan-editor wheretoput-floor-plan-editor" aria-label="도면 캔버스">
      <aside className="floor-plan-toolbar wheretoput-floor-plan-toolbar" aria-label="도면 캔버스">
        <div className="floor-plan-mode-switch" aria-label="도면 캔버스">
          <button
            className={experienceMode === "landlord" ? "active" : ""}
            onClick={() => setExperienceMode("landlord")}
            type="button"
          >
            <strong>집주인 모드</strong>
            <span>도면 생성/검토/발행</span>
          </button>
          <button
            className={experienceMode === "resident" ? "active" : ""}
            onClick={() => {
              setExperienceMode("resident");
              setViewMode("3d");
            }}
            type="button"
          >
            <strong>세입자 일반사용자 모드</strong>
            <span>가구 배치 체험</span>
          </button>
        </div>
        {(experienceMode === "landlord"
          ? [
              ["wall", "드로잉", "벽 그리기"],
              ["select", "선택", "벽 선택"],
              ["eraser", "지우기", "벽 삭제"],
              ["partial_eraser", "부분 지우기", "벽 일부 삭제"],
              ["hide", "숨기기", "3D 벽 숨기기"],
              ["opening", "문창문", "문/창문 후보 검토"],
              ["fixture", "설비", "고정 설비 후보 검토"],
              ["furniture", "옵션가구", "임대인 옵션 가구 배치"],
              ["none", "이동", "화면 이동"]
            ]
          : [
              ["furniture", "가구", "가구 배치"],
              ["select", "선택", "배치/벽 선택"],
              ["none", "이동", "화면 이동"]
            ]
        ).map(([toolId, label, hint]) => (
          <button
            className={tool === toolId ? "active" : ""}
            key={toolId}
            onClick={() => {
              setTool(toolId as EditorTool);
              setPartialEraserSelectedWall(null);
              if (toolId !== "select") setSelectedWall(null);
              if (toolId !== "fixture" && toolId !== "opening") {
                setPendingFurniture(null);
                setSelectedFurnitureId(null);
              }
            }}
            title={hint}
            type="button"
          >
            <strong>{label}</strong>
            <span>{hint}</span>
          </button>
        ))}
      </aside>

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
          {experienceMode === "landlord" ? (
            <>
              <label
                aria-disabled={isProcessing}
                className={`floor-plan-secondary floor-plan-upload-label${isProcessing ? " is-disabled" : ""}`}
                htmlFor="floor-plan-source-input"
              >
                도면 등록
              </label>
              <button
                className={tool === "interior" ? "floor-plan-secondary active" : "floor-plan-secondary"}
                onClick={() => startInteriorMeasure(isScaleSet ? "width" : "scale")}
                title="방 안쪽 두 점을 클릭해 가로/세로(mm)를 재고 면적을 구합니다 (축척이 없으면 축척 맞추기부터 시작)"
                type="button"
              >
                방 크기 재기
              </button>
              <button
                className="floor-plan-secondary"
                disabled={isProcessing || (!uploadedFloorPlanSource?.attachmentId && !uploadedAiImageDataUrl)}
                onClick={() => runOpeningDetection()}
                type="button"
              >
                문/창문 탐지
              </button>
              <button
                className="floor-plan-secondary"
                disabled={isProcessing || !roboflowDetections}
                onClick={applyRoboflowWallPostProcessing}
                type="button"
              >
                벽 후처리 적용
              </button>
            </>
          ) : (
            <button className="floor-plan-secondary" onClick={() => setViewMode("3d")} type="button">
              3D 배치 보기
            </button>
          )}
          <span>{uploadStatus}</span>
          {uploadedImage ? <span>{aiAnalysisStatus}</span> : null}
        </div>

        {wallBoundsMm ? (
          <div
            style={{
              margin: "8px 0",
              padding: "8px 12px",
              background: isScaleSet ? "#e6f0ff" : "#fff3cd",
              border: `1px solid ${isScaleSet ? "#4a86ff" : "#e0b400"}`,
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 14,
              whiteSpace: "nowrap"
            }}
          >
            📐 전체 {wallBoundsMm.widthMm.toLocaleString()}mm × {wallBoundsMm.heightMm.toLocaleString()}mm{" "}
            {isScaleSet ? "— 도면 외곽 치수와 비교하세요" : "— 축척 미적용, '방 내부 재기 → 축척 재기'로 맞추세요"}
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
              <code>축척 후보 없음 — 문/창문 탐지를 먼저 실행하세요</code>
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

        {viewMode === "2d" ? (
          <div className="floor-plan-canvas-shell" ref={containerRef}>
            <canvas
              className="floor-plan-drawing-canvas"
              onAuxClick={handleCanvasAuxClick}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleCanvasMouseLeave}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              ref={canvasRef}
            />
          </div>
        ) : (
          <RoomlogThreeFloorPlanView
            furnitureData={placedFurnitures}
            onFloorPointerDown={handle3DFloorPointerDown}
            onFurniturePointerDown={handleFurniturePointerDown}
            onWallPointerDown={handle3DWallPointerDown}
            pendingFurniture={pendingFurniture}
            selectedFurnitureId={selectedFurnitureId}
            selectedWallId={selectedWall?.id ?? null}
            wallsData={roomWalls3D}
          />
        )}

        <div className="floor-plan-actions">
          <button
            className="floor-plan-secondary"
            onClick={() => {
              setWalls([]);
              setHiddenWallIds(new Set());
              setPlacedFurnitures([]);
              setPendingFurniture(null);
              setSelectedWall(null);
              setSelectedFurnitureId(null);
              setUploadStatus("벽 전체 삭제");
            }}
            type="button"
          >
            전체 지우기
          </button>
          <button
            className="floor-plan-secondary"
            onClick={() => {
              setWalls(getStarterWalls());
              setHiddenWallIds(new Set());
              setPlacedFurnitures([]);
              setPendingFurniture(null);
              setSelectedWall(null);
              setSelectedFurnitureId(null);
              setUploadStatus("샘플 도면 복원");
            }}
            type="button"
          >
            샘플 복원
          </button>
          <button className={viewMode === "3d" ? "floor-plan-primary" : "floor-plan-secondary"} onClick={convertTo3D} type="button">
            {viewMode === "2d" ? "3D 변환" : "2D 편집"}
          </button>
          <button
            className="floor-plan-secondary"
            onClick={() => {
              setViewOffset({ x: 0, y: 0 });
              setViewScale(1);
            }}
            type="button"
          >
            Reset
          </button>
          <button
            className="floor-plan-secondary"
            disabled={hiddenWallCount === 0}
            onClick={() => {
              setHiddenWallIds(new Set());
              setUploadStatus("숨긴 벽 복원");
            }}
            type="button"
          >
            숨김 복원
          </button>
          {experienceMode === "landlord" ? (
            <>
              <button className="floor-plan-primary" disabled={isProcessing || walls.length === 0} onClick={() => saveFloorPlanDraft("DRAFT")} type="button">
                저장 초안
              </button>
              <button
                className="floor-plan-primary"
                disabled={isProcessing || walls.length === 0 || !isScaleSet}
                onClick={() => saveFloorPlanDraft("PUBLISHED")}
                type="button"
              >
                발행
              </button>
            </>
          ) : (
            <button className="floor-plan-primary" disabled={residentDesignFurnitures.length === 0} onClick={saveResidentFurnitureDesign} type="button">
              배치 저장
            </button>
          )}
          {saveState ? (
            <span
              aria-live="polite"
              style={{
                alignSelf: "center",
                padding: "4px 10px",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 13,
                background: saveState.kind === "published" ? "#dcfce7" : saveState.kind === "local" ? "#fef3c7" : "#e0edff",
                color: saveState.kind === "published" ? "#166534" : saveState.kind === "local" ? "#92400e" : "#1e40af"
              }}
            >
              {saveState.kind === "published" ? "📢 발행됨" : saveState.kind === "local" ? "⚠️ 로컬에만 저장됨" : "💾 초안 저장됨"}
              {" · "}
              {new Date(saveState.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      </section>

      <aside className="floor-plan-sidepanel" aria-label="도면 캔버스">
        <div>
          <span>wheretoput simulator model</span>
          <strong>방배 루미에르 402호</strong>
        </div>
        <dl>
          <div>
            <dt>벽체</dt>
            <dd>{summary.wallCount}개</dd>
          </div>
          <div>
            <dt>예상 둘레</dt>
            <dd>{summary.approximateMeters}m</dd>
          </div>
          <div>
            <dt>편집 상태</dt>
            <dd>{viewMode === "3d" ? "3D 변환됨" : summary.status}</dd>
          </div>
          <div>
            <dt>3D 벽 데이터</dt>
            <dd>{roomWalls3D.length}개</dd>
          </div>
          <div>
            <dt>숨긴 벽</dt>
            <dd>{hiddenWallCount}개</dd>
          </div>
          <div>
            <dt>확정 문창문</dt>
            <dd>{openingCandidates.filter((candidate) => candidate.status === "CONFIRMED").length}/{openingCandidates.length}개</dd>
          </div>
          <div>
            <dt>확정 고정설비</dt>
            <dd>{fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED").length}/{fixtureCandidates.length}개</dd>
          </div>
          <div>
            <dt>배율 조절</dt>
            <dd>{Math.round(viewScale * 100)}%</dd>
          </div>
          <div>
            <dt>축척</dt>
            <dd>{isScaleSet ? `1px=${pixelToMmRatio.toFixed(2)}mm` : "1px=10mm"}</dd>
          </div>
          <div>
            <dt>저장 ID</dt>
            <dd>{floorPlanDraftId ?? "로컬 초안"}</dd>
          </div>
          <div>
            <dt>사용 모드</dt>
            <dd>{experienceMode === "landlord" ? "집주인 모드" : "세입자 일반사용자 모드"}</dd>
          </div>
        </dl>

        {experienceMode === "landlord" ? (
          <>
            <div className="floor-plan-sim-preview">
              <span>후보 레이어</span>
              <code>
                벽 {summary.wallCount} / 문창문 {openingCandidates.length} / 고정설비 {fixtureCandidates.length}
              </code>
              <code>일반 클릭 확정, Shift 클릭 거절</code>
            </div>

            {printedDimensionChips.length ? (
              <div className="floor-plan-sim-preview">
                <span>구조 치수</span>
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
            ) : null}

            {tool === "interior" ? (
              <div className="floor-plan-sim-preview floor-plan-scale-selected-wall">
                <span>방 크기 측정 → 면적</span>
                {/* 축척(1px=mm)은 여기서 따로 확정한다. 아래 가로/세로 재기는 확정된 축척을 소비만 한다. */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className={interiorMeasureTarget === "scale" ? "floor-plan-secondary active" : "floor-plan-secondary"}
                    onClick={() => startInteriorMeasure("scale")}
                    title="실제 길이를 아는 두 점을 클릭하고 mm를 입력하면 축척이 확정됩니다"
                    type="button"
                  >
                    축척 맞추기 (두 점)
                  </button>
                  <code>{isScaleSet ? `1px = ${pixelToMmRatio.toFixed(2)}mm` : "축척 없음"}</code>
                </div>

                {interiorMeasureTarget === "scale" && interiorMeasurePx > 0 ? (
                  <>
                    <code>방금 잰 길이: {Math.round(interiorMeasurePx)}px = ? mm</code>
                    <input
                      aria-label="측정한 실제 길이"
                      onChange={(event) => setInteriorCalibrationMm(event.target.value)}
                      placeholder="이 선의 실제 길이 mm"
                      type="number"
                      value={interiorCalibrationMm}
                    />
                    <button className="floor-plan-primary" disabled={!interiorCalibrationMm} onClick={applyInteriorCalibration} type="button">
                      축척 맞추기
                    </button>
                  </>
                ) : null}

                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="floor-plan-secondary" onClick={() => startInteriorMeasure("width")} type="button">
                    가로 재기
                  </button>
                  <input
                    aria-label="방 가로 mm"
                    onChange={(event) => setRoomWidthMm(event.target.value)}
                    placeholder="가로 mm"
                    style={{ width: 90 }}
                    type="number"
                    value={roomWidthMm}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="floor-plan-secondary" onClick={() => startInteriorMeasure("depth")} type="button">
                    세로 재기
                  </button>
                  <input
                    aria-label="방 세로 mm"
                    onChange={(event) => setRoomDepthMm(event.target.value)}
                    placeholder="세로 mm"
                    style={{ width: 90 }}
                    type="number"
                    value={roomDepthMm}
                  />
                </div>

                {roomAreaM2 !== null ? (
                  <code style={{ background: "#e6f0ff", padding: "4px 8px", borderRadius: 4, fontWeight: 700 }}>
                    이 방 약 {roomAreaM2.toFixed(1)}㎡ ({roomWidthMm}×{roomDepthMm}mm)
                  </code>
                ) : (
                  <code>가로·세로 둘 다 재면 면적이 나옵니다</code>
                )}
              </div>
            ) : null}

            {[...openingCandidates.map((candidate) => ["opening", candidate] as const), ...fixtureCandidates.map((candidate) => ["fixture", candidate] as const)]
              .slice(0, 6)
              .map(([layer, candidate]) => (
                <div className="floor-plan-sim-preview" key={`${layer}-${candidate.id}`}>
                  <span>{layer === "opening" ? "문창문 후보" : "고정설비 후보"}</span>
                  <code>
                    {candidate.type} / {candidate.status} / {Math.round((candidate.confidence ?? 0) * 100)}%
                  </code>
                  <div className="floor-plan-furniture-actions">
                    <button className="floor-plan-secondary" onClick={() => toggleCandidateStatus(layer, candidate.id, "CONFIRMED")} type="button">
                      확정
                    </button>
                    <button className="floor-plan-secondary" onClick={() => toggleCandidateStatus(layer, candidate.id, "REJECTED")} type="button">
                      삭제
                    </button>
                    <button className="floor-plan-secondary" onClick={() => moveCandidateInLayer(layer, candidate.id, { x: 4, y: 0 })} type="button">
                      이동
                    </button>
                  </div>
                </div>
              ))}
          </>
        ) : null}

        {experienceMode === "resident" || tool === "furniture" ? (
          <>
            <div className="floor-plan-furniture-library">
              <span>{experienceMode === "landlord" ? "임대인 옵션 가구" : "wheretoput furniture picker"}</span>
              <code>
                {furnitureCatalogStatus} {filteredFurnitureCatalog.length}/{furnitureCatalog.length} / 옵션 {landlordOptionFurnitures.length} / 내 배치{" "}
                {residentDesignFurnitures.length}
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
                {FURNITURE_KIND_FILTERS.map((kind) => (
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
                        {catalogKind(item)} · {item.brand}
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

            <div className="floor-plan-sim-preview">
              <span>선택 가구</span>
              {selectedFurniture ? (
                <>
                  <code>
                    {selectedFurniture.name} / {selectedFurniture.position.map((value) => value.toFixed(2)).join(", ")}
                  </code>
                  <div className="floor-plan-furniture-actions">
                    <button
                      className="floor-plan-secondary"
                      disabled={isLockedFurnitureForResident(selectedFurniture, experienceMode)}
                      onClick={rotateSelectedFurniture}
                      type="button"
                    >
                      90도 회전
                    </button>
                    <button
                      className="floor-plan-secondary"
                      disabled={isLockedFurnitureForResident(selectedFurniture, experienceMode)}
                      onClick={removeSelectedFurniture}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                  <code>
                    {isLockedFurnitureForResident(selectedFurniture, experienceMode)
                      ? "임대인 옵션 가구는 세입자 모드에서 고정됩니다"
                      : "배치완료된 가구는 바닥 클릭으로 이동하지 않습니다"}
                  </code>
                </>
              ) : pendingFurniture ? (
                <>
                  <code>
                    {pendingFurniture.name} / {pendingFurniture.position.map((value) => value.toFixed(2)).join(", ")}
                  </code>
                  <div className="floor-plan-furniture-actions">
                    <button onClick={confirmPendingFurniturePlacement} type="button">
                      배치완료
                    </button>
                    <button className="floor-plan-secondary" onClick={rotatePendingFurniture} type="button">
                      90도 회전
                    </button>
                    <button className="floor-plan-secondary" onClick={cancelPendingFurniturePlacement} type="button">
                      취소
                    </button>
                  </div>
                  <code>3D 바닥을 클릭해 위치를 잡고 배치완료를 눌러 확정</code>
                </>
              ) : (
                <code>가구 카드를 선택해주세요</code>
              )}
            </div>
          </>
        ) : null}

        <div className="floor-plan-sim-preview">
          <span>position / rotation / dimensions</span>
          <code>
            {wheretoputWalls[0]
              ? `${wheretoputWalls[0].position.join(", ")} / ${wheretoputWalls[0].rotation.join(", ")} / ${
                  wheretoputWalls[0].dimensions.width
                }m`
              : "벽 데이터 없음"}
          </code>
        </div>
        <a href="/">마이페이지</a>
      </aside>
    </section>
  );
}
