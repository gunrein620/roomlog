"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CandidateStatus,
  DetectedWallResult,
  ExtractionMeta,
  FloorPlanCandidate,
  UploadedFloorPlanSource
} from "./plan-extraction/types";
import {
  createWallCandidatesFromRoomPolygons,
  createWallsFromDetectedLines,
  detectFixtureCandidates,
  detectOpeningCandidates,
  moveCandidate,
  snapNormalizedLineToWallEvidence,
  updateCandidateStatus
} from "./plan-extraction/wall-detection.mjs";
import { loadImage, normalizeMainPlanBounds, OPENCV_URL, WallDetector } from "./plan-extraction/wall-detector";
import {
  catalogKind,
  createFurnitureModel,
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
  convertWallsToWheretoputRoom3D,
  convertWallsToWheretoputSimulator,
  distanceToWall,
  moveWall,
  resizeWall,
  snapToOrthogonal,
  summarizeWalls
} from "./room-model/wall-model.mjs";
import { RoomlogThreeFloorPlanView } from "./room-scene/RoomlogThreeFloorPlanView";

type EditorTool = "wall" | "select" | "eraser" | "partial_eraser" | "hide" | "opening" | "fixture" | "furniture" | "scale" | "none";
type ViewMode = "2d" | "3d";
type WallDragMode = "move" | "resize-start" | "resize-end";
type WallDragOperation = { mode: WallDragMode; originPoint: Point; originalWall: Wall; wallId: Wall["id"] };
type FloorPlanAiModelId =
  | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  | "nvidia/cosmos3-nano-reasoner"
  | "openai/floor-plan-vision";

type FloorPlanAiAnalysisResult = {
  analysisMode?: "dimension" | "candidate-review" | "room-structure";
  candidateReviews?: Array<{
    confidence?: number;
    id: string;
    reason?: string;
    verdict: "keep" | "reject" | "review";
  }>;
  missingWallHints?: Array<{
    confidence?: number;
    description: string;
    line?: { x1: number; y1: number; x2: number; y2: number };
    orientation?: "horizontal" | "vertical";
  }>;
  model: FloorPlanAiModelId;
  noiseFlags?: { decorativeHatching: boolean; watermark: boolean };
  planStyle?: "solid-filled" | "double-line-hollow" | "hatched" | "gray-fill";
  rawText?: string;
  rooms?: Array<{
    confidence: number;
    label: string;
    polygon: Array<{ x: number; y: number }>;
  }>;
  scaleCandidates?: Array<{
    confidence: number;
    pixelLength?: number;
    pixelToMmRatio?: number;
    realLengthMm: number;
    source: string;
  }>;
  status: "ready" | "config-required" | "failed";
  summary: string;
  textDetections?: Array<{ confidence?: number; text: string }>;
};
type AiDimensionDetection = { confidence?: number; realLengthMm: number; text: string };
type AiGeneratedWall = Wall & { markers?: string[]; source?: "ai-missing-wall-hint" | "ai-room-edge" };
type AiWallCandidatePayload = {
  end: Point;
  id: string;
  lengthPx: number;
  orientation: "horizontal" | "vertical" | "diagonal";
  originalWallId: string;
  start: Point;
};
type FloorPlanAiRequest = {
  analysisMode?: "dimension" | "candidate-review" | "room-structure";
  imageDataUrl?: string | null;
  model: FloorPlanAiModelId;
  sourceAttachmentId?: string;
  wallCandidates?: AiWallCandidatePayload[];
};
type AiCandidateOverlaySource = {
  imageHeight?: number;
  imageUrl?: string | null;
  imageWidth?: number;
};

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1200;
const WALL_EDIT_HANDLE_RADIUS = 16;
const AI_IMAGE_MAX_DIMENSION = 1600;
const AI_CANDIDATE_REVIEW_MAX_DATA_URL_LENGTH = 90_000;
const FLOOR_PLAN_AI_MODELS: Array<{ id: FloorPlanAiModelId; label: string }> = [
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron Omni" },
  { id: "nvidia/cosmos3-nano-reasoner", label: "Cosmos3 Reasoner" },
  { id: "openai/floor-plan-vision", label: "OpenAI Vision" }
];
const FURNITURE_KIND_FILTERS = ["전체", "침대", "식탁", "의자", "소파", "책상", "서랍", "옷장", "기타"] as const;
type FurnitureKindFilter = (typeof FURNITURE_KIND_FILTERS)[number];

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
  const values: number[] = [];

  for (const match of trimmedText.matchAll(/(\d+(?:[.,]\d+)?)\s*(mm|밀리미터|cm|센티미터|m|미터)/gi)) {
    const realLengthMm = convertDimensionToMm(match[1], match[2]);
    if (realLengthMm && realLengthMm >= 1000) values.push(realLengthMm);
  }

  if (values.length) return values;

  const bareMillimeterMatch = trimmedText.matchAll(/\b(\d{3,5})\b/g);
  // 단위 없는 3-5자리 치수는 mm로 처리한다. 국내 평면도 치수선은 보통 2760, 5040처럼 mm 값만 적힌다.
  for (const match of bareMillimeterMatch) {
    const realLengthMm = Number(match[1]);
    if (realLengthMm >= 1000 && realLengthMm <= 30000) values.push(realLengthMm);
  }

  return values;
}

function parseDimensionTextToMm(text: string) {
  return parseDimensionTextsToMm(text)[0] ?? null;
}

function snapWallToLengthBounds(wall: Wall, bounds: { maxX: number; maxY: number; minX: number; minY: number }, tolerancePx = GRID_SIZE_PX * 2) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);

  if (isHorizontal) {
    const y = Math.round((wall.start.y + wall.end.y) / 2);
    let startX = Math.min(wall.start.x, wall.end.x);
    let endX = Math.max(wall.start.x, wall.end.x);
    const length = endX - startX;

    if (length >= width * 0.55) {
      startX = bounds.minX;
      endX = bounds.maxX;
    } else {
      if (Math.abs(startX - bounds.minX) <= tolerancePx) startX = bounds.minX;
      if (Math.abs(startX - bounds.maxX) <= tolerancePx) startX = bounds.maxX;
      if (Math.abs(endX - bounds.minX) <= tolerancePx) endX = bounds.minX;
      if (Math.abs(endX - bounds.maxX) <= tolerancePx) endX = bounds.maxX;
    }

    return { ...wall, end: { x: endX, y }, start: { x: startX, y } };
  }

  const x = Math.round((wall.start.x + wall.end.x) / 2);
  let startY = Math.min(wall.start.y, wall.end.y);
  let endY = Math.max(wall.start.y, wall.end.y);
  const length = endY - startY;

  if (length >= height * 0.55) {
    startY = bounds.minY;
    endY = bounds.maxY;
  } else {
    if (Math.abs(startY - bounds.minY) <= tolerancePx) startY = bounds.minY;
    if (Math.abs(startY - bounds.maxY) <= tolerancePx) startY = bounds.maxY;
    if (Math.abs(endY - bounds.minY) <= tolerancePx) endY = bounds.minY;
    if (Math.abs(endY - bounds.maxY) <= tolerancePx) endY = bounds.maxY;
  }

  return { ...wall, end: { x, y: endY }, start: { x, y: startY } };
}

export default function RoomlogFloorPlanEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extractionWorkerRef = useRef<Worker | null>(null);
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
  const [uploadStatus, setUploadStatus] = useState("샘플 도면으로 시작");
  const [selectedAiModel, setSelectedAiModel] = useState<FloorPlanAiModelId>("openai/floor-plan-vision");
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState("AI 정밀 수치 읽기 대기");
  const [lastAiAnalysis, setLastAiAnalysis] = useState<FloorPlanAiAnalysisResult | null>(null);
  const [lastRoomStructureAnalysis, setLastRoomStructureAnalysis] = useState<FloorPlanAiAnalysisResult | null>(null);
  const [aiReviewedWallCandidates, setAiReviewedWallCandidates] = useState<AiWallCandidatePayload[]>([]);
  const [opencvReady, setOpenCvReady] = useState(false);
  const [lastExtractionMs, setLastExtractionMs] = useState<number | null>(null);
  const [floorPlanDraftId, setFloorPlanDraftId] = useState<string | null>(null);
  const [pixelToMmRatio, setPixelToMmRatio] = useState(DEFAULT_PIXEL_TO_MM_RATIO);
  const [isScaleSet, setIsScaleSet] = useState(false);
  const [scaleWall, setScaleWall] = useState<Wall | null>(null);
  const [scaleRealLength, setScaleRealLength] = useState("");
  const [manualAiScaleRealLength, setManualAiScaleRealLength] = useState("");
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
  const wheretoputWalls = useMemo(() => convertWallsToWheretoputSimulator(walls as never) as WheretoputWall3D[], [walls]);
  const roomWalls3D = useMemo(
    () => convertWallsToWheretoputRoom3D(visibleWalls as never, { pixelToMmRatio }) as WheretoputWall3D[],
    [pixelToMmRatio, visibleWalls]
  );
  const aiTextDetections = useMemo(() => {
    const seen = new Set<string>();
    const aiRawTextDetectionSources = [lastAiAnalysis?.rawText, lastAiAnalysis?.summary, extractionMeta.aiRawText, extractionMeta.aiSummary].flatMap((text) =>
      text ? [{ confidence: 0.35, text }] : []
    );

    return [...(lastAiAnalysis?.textDetections ?? []), ...(extractionMeta.aiTextDetections ?? []), ...aiRawTextDetectionSources].filter((detection) => {
      const key = `${detection.text}:${detection.confidence ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    });
  }, [
    extractionMeta.aiRawText,
    extractionMeta.aiSummary,
    extractionMeta.aiTextDetections,
    lastAiAnalysis?.rawText,
    lastAiAnalysis?.summary,
    lastAiAnalysis?.textDetections
  ]);
  const aiDimensionDetections = useMemo<AiDimensionDetection[]>(() => {
    const seen = new Set<string>();

    return aiTextDetections.flatMap((detection) => {
      return parseDimensionTextsToMm(detection.text).flatMap((realLengthMm) => {
        const key = String(realLengthMm);
        if (seen.has(key)) return [];
        seen.add(key);

        return [{ confidence: detection.confidence, realLengthMm, text: `${realLengthMm}mm` }];
      });
    });
  }, [aiTextDetections]);
  const visibleAiDimensionDetections = useMemo(
    () => {
      const seen = new Set<number>();

      return aiDimensionDetections
        .filter((dimension) => dimension.realLengthMm >= 1000)
        .sort((a, b) => b.realLengthMm - a.realLengthMm)
        .filter((dimension) => {
          if (seen.has(dimension.realLengthMm)) return false;
          seen.add(dimension.realLengthMm);

          return true;
        })
        .slice(0, 2);
    },
    [aiDimensionDetections]
  );
  const aiCandidateReviewSummary = useMemo(() => {
    const reviews = lastAiAnalysis?.candidateReviews ?? [];

    return {
      keep: reviews.filter((review) => review.verdict === "keep").length,
      reject: reviews.filter((review) => review.verdict === "reject").length,
      review: reviews.filter((review) => review.verdict === "review").length
    };
  }, [lastAiAnalysis?.candidateReviews]);
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
    if (experienceMode === "resident" && (tool === "opening" || tool === "fixture" || tool === "scale")) {
      setTool("furniture");
      setSelectedWall(null);
    }
  }, [experienceMode, tool]);
  const getExtractionWorker = useCallback(() => {
    if (!extractionWorkerRef.current) {
      extractionWorkerRef.current = new Worker(new URL("./plan-extraction/floor-plan-extraction.worker.ts", import.meta.url));
    }

    return extractionWorkerRef.current;
  }, []);

  const preloadOpenCvWorker = useCallback(() => {
    const worker = getExtractionWorker();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "ready") return;
      setOpenCvReady(Boolean(event.data.ready));
      worker.removeEventListener("message", handleMessage);
    };

    worker.addEventListener("message", handleMessage);
    worker.postMessage({ opencvUrl: OPENCV_URL, type: "preload" });
  }, [getExtractionWorker]);

  useEffect(() => {
    const scheduleIdle = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 250));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const idleId = scheduleIdle(() => preloadOpenCvWorker());

    return () => {
      cancelIdle(idleId as never);
      extractionWorkerRef.current?.terminate();
      extractionWorkerRef.current = null;
    };
  }, [preloadOpenCvWorker]);

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

    if (uploadedImage && cachedBackgroundImage?.complete) {
      const imageAspect = cachedBackgroundImage.width / cachedBackgroundImage.height;
      const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
      let drawWidth = CANVAS_WIDTH * 0.8;
      let drawHeight = drawWidth / imageAspect;
      if (imageAspect <= canvasAspect) {
        drawHeight = CANVAS_HEIGHT * 0.8;
        drawWidth = drawHeight * imageAspect;
      }

      context.globalAlpha = backgroundOpacity;
      context.drawImage(cachedBackgroundImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.globalAlpha = 1;
    }

    context.strokeStyle = "#e0e0e0";
    context.lineWidth = 0.5 / viewScale;
    for (let x = -5000; x <= 5000; x += GRID_SIZE_PX) {
      context.beginPath();
      context.moveTo(x, -5000);
      context.lineTo(x, 5000);
      context.stroke();
    }
    for (let y = -5000; y <= 5000; y += GRID_SIZE_PX) {
      context.beginPath();
      context.moveTo(-5000, y);
      context.lineTo(5000, y);
      context.stroke();
    }

    const drawWall = (wall: Wall, variant: "normal" | "ai-room" | "ai-missing" | "draft" | "selected" | "hover" | "scale" | "erase" | "hidden") => {
      const colors = {
        "ai-missing": "#d97706",
        "ai-room": "#00a36c",
        draft: "rgba(43, 43, 43, 0.7)",
        erase: "#ff0000",
        hidden: "rgba(121, 130, 145, 0.42)",
        hover: "#0066ff",
        normal: "rgba(43, 43, 43, 0.82)",
        scale: "rgba(0, 68, 255, 0.76)",
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

      if (variant !== "scale" && variant !== "erase") {
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

    if (scaleWall && tool === "scale") drawWall(scaleWall, "scale");
    if (isDrawing && startPoint && currentPoint) drawWall({ id: "draft", start: startPoint, end: currentPoint }, "draft");
    if (isSelectingEraseArea && eraseAreaStart && eraseAreaEnd) {
      drawWall({ id: "erase-draft", start: eraseAreaStart, end: eraseAreaEnd }, "erase");
    }

    context.restore();
  }, [
    backgroundOpacity,
    cachedBackgroundImage,
    currentPoint,
    eraseAreaEnd,
    eraseAreaStart,
    hoveredWall,
    hiddenWallIds,
    isDrawing,
    isSelectingEraseArea,
    fixtureCandidates,
    openingCandidates,
    partialEraserSelectedWall,
    pixelToMmRatio,
    scaleWall,
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
    setUploadStatus(`${nextFurniture.name} 위치 지정. 배치완료를 눌러 확정하세요`);
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
    setUploadStatus(`${nextFurniture.name} 90도 회전`);
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
    if (tool === "wall" || tool === "scale") {
      const snappedStart = snapCanvasPoint(coords);
      setStartPoint(snappedStart);
      setCurrentPoint(snappedStart);
      setIsDrawing(true);
      return;
    }

    if (tool === "select") {
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

    if (isDrawing && startPoint && (tool === "wall" || tool === "scale")) {
      setCurrentPoint(snapCanvasPoint(snapToOrthogonal(startPoint, coords)));
      return;
    }

    if (isSelectingEraseArea && partialEraserSelectedWall) {
      setEraseAreaEnd(projectPointOntoWall(coords, partialEraserSelectedWall));
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

    if (isDrawing && startPoint && currentPoint && (tool === "wall" || tool === "scale")) {
      const snappedEnd = snapCanvasPoint(snapToOrthogonal(startPoint, getCanvasCoordinates(event)));
      if (startPoint.x !== snappedEnd.x || startPoint.y !== snappedEnd.y) {
        const nextWall = { id: `wall-${Date.now()}`, start: startPoint, end: snappedEnd };
        if (tool === "scale") {
          setScaleWall(nextWall);
        } else {
          setWalls((currentWalls) => [...currentWalls, nextWall]);
        }
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
    if (!(event.ctrlKey || event.metaKey || event.altKey)) return;
    event.preventDefault();
    setViewScale((currentScale) => Math.max(0.1, Math.min(10, currentScale * (event.deltaY > 0 ? 0.9 : 1.1))));
    setUploadStatus("Ctrl/Cmd/Alt 휠로 확대");
  }

  function handleCanvasAuxClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

  async function requestFloorPlanAiAnalysis(request: FloorPlanAiRequest) {
    const token = await getFloorPlanAccessToken();
    const response = await fetch(apiUrl("/floor-plans/ai-analysis"), {
      body: JSON.stringify({
        analysisMode: request.analysisMode,
        imageDataUrl: request.sourceAttachmentId ? undefined : request.imageDataUrl,
        model: request.model,
        sourceAttachmentId: request.sourceAttachmentId,
        wallCandidates: request.wallCandidates
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    if (!response.ok) throw new Error(`AI floor plan analysis failed: ${response.status}`);

    return (await response.json()) as FloorPlanAiAnalysisResult;
  }

  function applyAiDimensionAnalysisResult(result: FloorPlanAiAnalysisResult) {
    const scaleCandidates = (result.scaleCandidates ?? []).map((candidate) => ({
      confidence: candidate.confidence,
      pixelLength: candidate.pixelLength ?? 0,
      pixelToMmRatio: candidate.pixelToMmRatio ?? 0,
      realLengthMm: candidate.realLengthMm,
      source: candidate.source
    }));
    const usableScaleCandidates = scaleCandidates.filter((candidate) => candidate.pixelLength > 0 && candidate.pixelToMmRatio > 0);
    const bestScaleCandidate = usableScaleCandidates[0];

    setLastAiAnalysis(result);
    setExtractionMeta((currentMeta) => ({
      ...currentMeta,
      aiModel: result.model,
      aiPhase1Status: result.status,
      aiRawText: result.rawText,
      aiSummary: result.summary,
      aiTextDetections: result.textDetections ?? [],
      ocrStatus: result.status === "ready" ? "ready" : currentMeta.ocrStatus,
      scaleCandidates: [...usableScaleCandidates, ...currentMeta.scaleCandidates]
    }));
    if (bestScaleCandidate) {
      setPixelToMmRatio(bestScaleCandidate.pixelToMmRatio);
      setIsScaleSet(false);
    }

    return { bestScaleCandidate, usableScaleCandidates };
  }

  function applyAiCandidateReviewResult(result: FloorPlanAiAnalysisResult, wallCandidates: AiWallCandidatePayload[]) {
    const reviewCount = result.candidateReviews?.length ?? 0;
    const rejectCount = result.candidateReviews?.filter((review) => review.verdict === "reject").length ?? 0;

    setAiReviewedWallCandidates(wallCandidates);
    setLastAiAnalysis(result);
    setExtractionMeta((currentMeta) => ({
      ...currentMeta,
      aiCandidateReviewCount: reviewCount,
      aiModel: result.model,
      aiPhase2Status: result.status,
      aiRawText: result.rawText,
      aiRejectedWallCandidateCount: rejectCount,
      aiSummary: result.summary,
      needsReview: result.status === "ready" ? true : currentMeta.needsReview,
      ocrStatus: result.status === "ready" ? "ready" : currentMeta.ocrStatus
    }));
  }

  function applyAiRoomStructureResult(result: FloorPlanAiAnalysisResult) {
    setLastRoomStructureAnalysis(result);
    setExtractionMeta((currentMeta) => ({
      ...currentMeta,
      aiModel: result.model,
      aiNoiseFlags: result.noiseFlags,
      aiPhaseRoomStructureStatus: result.status,
      aiPlanStyle: result.planStyle,
      aiRoomCount: result.rooms?.length ?? 0,
      aiRoomStructureSummary: result.summary,
      needsReview: result.status === "ready" ? true : currentMeta.needsReview
    }));
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

  function createAiGeneratedWallsFromRoomStructure(
    result: FloorPlanAiAnalysisResult | null,
    imageData: ImageData | null,
    plan: { height: number; name: string; width: number }
  ) {
    if (!result || result.status !== "ready" || !imageData) return [];

    const roomEdgeLines = createWallCandidatesFromRoomPolygons(result.rooms ?? [], imageData, {
      minEvidenceConfidence: 0.12,
      minLength: Math.max(16, Math.min(imageData.width, imageData.height) * 0.035)
    });
    const missingHintLines = (result.missingWallHints ?? []).flatMap((hint) => {
      if (!hint.line) return [];
      const snappedLine = snapNormalizedLineToWallEvidence(hint.line, imageData, { minConfidence: 0.12 });

      return snappedLine ? [{ ...snappedLine, markers: ["ai-missing-wall-hint", ...(snappedLine.markers ?? [])] }] : [];
    });
    const roomWalls = createWallsFromDetectedLines(roomEdgeLines, {
      height: plan.height,
      maxWalls: 48,
      name: `${plan.name}-ai-room`,
      width: plan.width
    }).map((wall: Wall, index: number) => ({ ...wall, id: `ai-room-wall-${index + 1}`, markers: ["ai-room-edge"], source: "ai-room-edge" }));
    const missingWalls = createWallsFromDetectedLines(missingHintLines, {
      height: plan.height,
      maxWalls: 16,
      name: `${plan.name}-ai-missing`,
      width: plan.width
    }).map((wall: Wall, index: number) => ({ ...wall, id: `ai-missing-wall-${index + 1}`, markers: ["ai-missing-wall-hint"], source: "ai-missing-wall-hint" }));

    return [...roomWalls, ...missingWalls] as AiGeneratedWall[];
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus(opencvReady ? `${file.name} 도면 분석중` : `${file.name} 추출 엔진 준비중 - fallback 가능`);
    try {
      const sourceUploadPromise = uploadFloorPlanSource(file);
      const aiImageDataUrlPromise = fileToCompressedDataUrl(file);
      const sourceUpload = await sourceUploadPromise;
      const aiImageDataUrl = await aiImageDataUrlPromise;
      let roomStructureResult: FloorPlanAiAnalysisResult | null = null;
      if (selectedAiModel === "openai/floor-plan-vision") {
        try {
          setAiAnalysisStatus("OpenAI room-structure 분석중");
          roomStructureResult = await requestFloorPlanAiAnalysis({
            analysisMode: "room-structure",
            imageDataUrl: sourceUpload?.attachmentId ? undefined : aiImageDataUrl,
            model: "openai/floor-plan-vision",
            sourceAttachmentId: sourceUpload?.attachmentId
          });
          applyAiRoomStructureResult(roomStructureResult);
        } catch {
          setAiAnalysisStatus("OpenAI room-structure 분석 실패 - OpenCV 추출만 진행");
        }
      }
      const detector = new WallDetector(getExtractionWorker());
      const result = await detector.detectWalls(file, { doubleLineClosing: roomStructureResult?.planStyle === "double-line-hollow" });
      const detectedWalls = createWallsFromDetectedLines(result.lines, {
        height: result.imageHeight,
        name: file.name,
        width: result.imageWidth
      }) as Wall[];
      const aiStructureImageData = roomStructureResult?.status === "ready" ? await loadImageDataFromUrl(aiImageDataUrl).catch(() => null) : null;
      const aiGeneratedWalls = createAiGeneratedWallsFromRoomStructure(roomStructureResult, aiStructureImageData, {
        height: result.imageHeight,
        name: file.name,
        width: result.imageWidth
      });
      const nextWalls = [...detectedWalls, ...aiGeneratedWalls] as Wall[];
      if (process.env.NODE_ENV !== "production") {
        (window as typeof window & {
          __roomlogFloorPlanDebug?: { aiGeneratedWalls: Wall[]; detectedWalls: Wall[]; extractionResult: DetectedWallResult; roomStructureResult: FloorPlanAiAnalysisResult | null };
        }).__roomlogFloorPlanDebug = { aiGeneratedWalls, detectedWalls, extractionResult: result, roomStructureResult };
      }
      const scaleCandidates = result.scaleCandidates ?? [];
      const bestScaleCandidate = scaleCandidates[0];
      const nextOpeningCandidates = detectOpeningCandidates({
        gaps: result.lines,
        pixelToMmRatio: bestScaleCandidate?.pixelToMmRatio ?? pixelToMmRatio
      }) as FloorPlanCandidate[];
      const nextFixtureCandidates = detectFixtureCandidates({
        labels: [],
        pixelToMmRatio: bestScaleCandidate?.pixelToMmRatio ?? pixelToMmRatio,
        shapes: []
      }) as FloorPlanCandidate[];

      setWalls(nextWalls);
      setHiddenWallIds(new Set());
      setSelectedWall(null);
      setPendingFurniture(null);
      setSelectedFurnitureId(null);
      setOpeningCandidates(nextOpeningCandidates);
      setFixtureCandidates(nextFixtureCandidates);
      setUploadedImage(result.imageUrl);
      setUploadedAiImageDataUrl(aiImageDataUrl);
      setUploadedFloorPlanSource(sourceUpload ?? { imageUrl: result.imageUrl });
      setLastAiAnalysis(null);
      setAiReviewedWallCandidates([]);
      if (!roomStructureResult) setLastRoomStructureAnalysis(null);
      setAiAnalysisStatus("AI 정밀 수치 읽기 대기");
      setFloorPlanDraftId(null);
      setLastExtractionMs(result.processingMs ?? null);
      setExtractionMeta({
        annotationCandidateCount: result.annotationCandidates?.length ?? 0,
        aiGeneratedWallCount: aiGeneratedWalls.length,
        aiNoiseFlags: roomStructureResult?.noiseFlags,
        aiPlanStyle: roomStructureResult?.planStyle,
        aiRoomCount: roomStructureResult?.rooms?.length ?? 0,
        detectedWallCount: nextWalls.length,
        dimensionCandidateCount: result.dimensionCandidates?.length ?? 0,
        mainPlanBounds: normalizeMainPlanBounds(result.mainPlanBounds),
        needsReview: result.needsReview ?? false,
        ocrStatus: bestScaleCandidate ? "ready" : "manual-scale-required",
        processingMs: result.processingMs,
        removedNoiseCount: result.removedNoiseCount ?? 0,
        scaleCandidates,
        scaleConfirmed: false
      });
      setIsScaleSet(false);
      if (bestScaleCandidate) {
        setPixelToMmRatio(bestScaleCandidate.pixelToMmRatio);
      }
      const opencvStatus = `${file.name} 확실한 벽 후보 ${detectedWalls.length}개 추출, 누락된 벽은 직접 그려주세요. ${
        bestScaleCandidate ? "축척 확인 필요" : "수동 축척 필요"
      }, AI 구조 후보 ${aiGeneratedWalls.length}개 병합, ${result.needsReview ? "정밀 검수 필요" : "검수 후 저장"}${result.processingMs ? ` (${result.processingMs}ms)` : ""}`;
      setUploadStatus(opencvStatus);

      if (selectedAiModel === "openai/floor-plan-vision") {
        try {
          await runVisionFirstExtractionPhases({
            imageDataUrl: sourceUpload?.attachmentId ? undefined : aiImageDataUrl,
            imageHeight: result.imageHeight,
            imageUrl: aiImageDataUrl || result.imageUrl,
            imageWidth: result.imageWidth,
            sourceAttachmentId: sourceUpload?.attachmentId,
            walls: nextWalls
          });
        } catch {
          setAiAnalysisStatus("OpenAI Vision 1단계/2단계 분석 실패 - OpenCV 추출 결과를 검수하세요");
        }
      }
    } catch {
      setUploadStatus("이미지 벽 추출 실패");
    } finally {
      setIsProcessing(false);
      event.target.value = "";
    }
  }

  async function runAiDimensionAnalysis() {
    const sourceAttachmentId = uploadedFloorPlanSource?.attachmentId;
    if (!sourceAttachmentId && !uploadedAiImageDataUrl) {
      setAiAnalysisStatus("먼저 도면 이미지를 업로드하세요");
      return;
    }

    setIsProcessing(true);
    setAiAnalysisStatus(`${FLOOR_PLAN_AI_MODELS.find((model) => model.id === selectedAiModel)?.label ?? "NVIDIA"} 분석중`);
    try {
      const result = await requestFloorPlanAiAnalysis({
        imageDataUrl: uploadedAiImageDataUrl,
        model: selectedAiModel,
        sourceAttachmentId
      });
      const { usableScaleCandidates } = applyAiDimensionAnalysisResult(result);
      setAiAnalysisStatus(
        result.status === "ready"
          ? `${result.summary} ${usableScaleCandidates.length ? "축척 후보 확인 필요" : "치수 텍스트를 참고해 수동 축척 필요"}`
          : result.summary
      );
    } catch {
      setAiAnalysisStatus("AI 정밀 수치 읽기 실패");
    } finally {
      setIsProcessing(false);
    }
  }

  function buildAiWallCandidatePayload(sourceWalls: Wall[] = walls) {
    return sourceWalls.slice(0, 80).map((wall, index): AiWallCandidatePayload => {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const orientation = absDx > absDy * 2 ? "horizontal" : absDy > absDx * 2 ? "vertical" : "diagonal";

      return {
        end: wall.end,
        id: `W${index + 1}`,
        lengthPx: Math.hypot(dx, dy),
        orientation,
        originalWallId: String(wall.id),
        start: wall.start
      };
    });
  }

  async function createAiCandidateOverlayDataUrl(candidates: AiWallCandidatePayload[], source?: AiCandidateOverlaySource) {
    const sourceCanvas = canvasRef.current;
    const sourceImageUrl = source?.imageUrl ?? uploadedAiImageDataUrl;
    const sourceImage = sourceImageUrl ? await loadImage(sourceImageUrl).catch(() => null) : null;
    if (!sourceCanvas && !sourceImage) return uploadedAiImageDataUrl;

    const sizes = [
      { fontSize: 18, height: 720, labelHeight: 26, labelWidth: 42, width: 960 },
      { fontSize: 16, height: 600, labelHeight: 24, labelWidth: 38, width: 800 },
      { fontSize: 14, height: 480, labelHeight: 22, labelWidth: 34, width: 640 }
    ];
    const qualities = [0.68, 0.54, 0.42, 0.32];
    let fallbackDataUrl = uploadedAiImageDataUrl;

    for (const size of sizes) {
      const overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = size.width;
      overlayCanvas.height = size.height;
      const context = overlayCanvas.getContext("2d");
      if (!context) return fallbackDataUrl;

      const imageWidth = Math.max(1, source?.imageWidth ?? sourceImage?.naturalWidth ?? sourceImage?.width ?? 0);
      const imageHeight = Math.max(1, source?.imageHeight ?? sourceImage?.naturalHeight ?? sourceImage?.height ?? 0);
      const useImageSource = Boolean(sourceImage && source?.imageUrl);
      const scaleX = size.width / (useImageSource ? imageWidth : CANVAS_WIDTH);
      const scaleY = size.height / (useImageSource ? imageHeight : CANVAS_HEIGHT);
      if (useImageSource && sourceImage) {
        context.drawImage(sourceImage, 0, 0, size.width, size.height);
      } else if (sourceCanvas) {
        context.drawImage(sourceCanvas, 0, 0, size.width, size.height);
      }
      context.save();
      context.font = `bold ${size.fontSize}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      const imageAspect = imageWidth / imageHeight;
      const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
      let drawWidth = CANVAS_WIDTH * 0.8;
      let drawHeight = drawWidth / imageAspect;
      if (imageAspect <= canvasAspect) {
        drawHeight = CANVAS_HEIGHT * 0.8;
        drawWidth = drawHeight * imageAspect;
      }
      const editorToImagePoint = (point: Point) => {
        const imageScale = drawWidth / imageWidth;

        return {
          x: (point.x + drawWidth / 2) / imageScale,
          y: (point.y + drawHeight / 2) / imageScale
        };
      };
      const candidateToOverlayPoint = (point: Point) => {
        if (useImageSource) {
          const imagePoint = editorToImagePoint(point);

          return { x: imagePoint.x * scaleX, y: imagePoint.y * scaleY };
        }

        return {
          x: (CANVAS_WIDTH / 2 + (point.x + viewOffset.x) * viewScale) * scaleX,
          y: (CANVAS_HEIGHT / 2 + (point.y + viewOffset.y) * viewScale) * scaleY
        };
      };

      context.strokeStyle = "rgba(0, 102, 255, 0.92)";
      context.lineCap = "round";
      context.lineWidth = Math.max(2, Math.round(size.width / 320));
      candidates.forEach((candidate) => {
        const start = candidateToOverlayPoint(candidate.start);
        const end = candidateToOverlayPoint(candidate.end);
        if (
          (start.x < 0 && end.x < 0) ||
          (start.x > size.width && end.x > size.width) ||
          (start.y < 0 && end.y < 0) ||
          (start.y > size.height && end.y > size.height)
        ) {
          return;
        }
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      });

      candidates.forEach((candidate) => {
        const midPoint = { x: (candidate.start.x + candidate.end.x) / 2, y: (candidate.start.y + candidate.end.y) / 2 };
        const { x: screenX, y: screenY } = candidateToOverlayPoint(midPoint);
        if (screenX < 0 || screenX > size.width || screenY < 0 || screenY > size.height) return;

        context.fillStyle = "rgba(0, 102, 255, 0.92)";
        context.fillRect(screenX - size.labelWidth / 2, screenY - size.labelHeight / 2, size.labelWidth, size.labelHeight);
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2;
        context.strokeRect(screenX - size.labelWidth / 2, screenY - size.labelHeight / 2, size.labelWidth, size.labelHeight);
        context.fillStyle = "#ffffff";
        context.fillText(candidate.id, screenX, screenY + 1);
      });

      context.restore();

      for (const quality of qualities) {
        const dataUrl = overlayCanvas.toDataURL("image/jpeg", quality);
        fallbackDataUrl = dataUrl;
        if (dataUrl.length <= AI_CANDIDATE_REVIEW_MAX_DATA_URL_LENGTH) return dataUrl;
      }
    }

    return fallbackDataUrl;
  }

  async function runVisionFirstExtractionPhases(input: {
    imageDataUrl?: string | null;
    imageHeight: number;
    imageUrl: string;
    imageWidth: number;
    sourceAttachmentId?: string;
    walls: Wall[];
  }) {
    setAiAnalysisStatus("OpenAI Vision 1단계: 도면 치수와 구조 단서 분석중");
    const phase1 = await requestFloorPlanAiAnalysis({
      imageDataUrl: input.imageDataUrl,
      model: "openai/floor-plan-vision",
      sourceAttachmentId: input.sourceAttachmentId
    });
    const { usableScaleCandidates } = applyAiDimensionAnalysisResult(phase1);
    if (phase1.status !== "ready") {
      setAiAnalysisStatus(phase1.summary);
      return;
    }

    const wallCandidates = buildAiWallCandidatePayload(input.walls);
    if (!wallCandidates.length) {
      setAiAnalysisStatus(`${phase1.summary} OpenCV 벽 후보가 없어 2단계 검토는 건너뜀`);
      return;
    }

    setAiAnalysisStatus("OpenAI Vision 2단계: OpenCV 벽 후보 검토중");
    const candidateOverlayDataUrl = await createAiCandidateOverlayDataUrl(wallCandidates, {
      imageHeight: input.imageHeight,
      imageUrl: input.imageUrl,
      imageWidth: input.imageWidth
    });
    if (!candidateOverlayDataUrl) {
      setAiAnalysisStatus(`${phase1.summary} 후보 검토 이미지를 만들 수 없어 2단계 검토는 건너뜀`);
      return;
    }
    if (candidateOverlayDataUrl.length > AI_CANDIDATE_REVIEW_MAX_DATA_URL_LENGTH) {
      setAiAnalysisStatus(`${phase1.summary} 후보 검토 이미지가 커서 2단계 검토는 건너뜀`);
      return;
    }

    const phase2 = await requestFloorPlanAiAnalysis({
      analysisMode: "candidate-review",
      imageDataUrl: candidateOverlayDataUrl,
      model: "openai/floor-plan-vision",
      wallCandidates
    });
    applyAiCandidateReviewResult(phase2, wallCandidates);
    setAiAnalysisStatus(
      phase2.status === "ready"
        ? `${phase1.summary} ${usableScaleCandidates.length ? "축척 후보 확인 필요." : "치수 텍스트 확인 필요."} ${phase2.summary} 후보별 판정 확인`
        : phase2.summary
    );
  }

  async function runAiCandidateReview() {
    if (!uploadedImage || !walls.length) {
      setAiAnalysisStatus("먼저 도면을 업로드하고 벽 후보를 추출하세요");
      return;
    }

    const wallCandidates = buildAiWallCandidatePayload();
    setAiReviewedWallCandidates(wallCandidates);
    const candidateOverlayDataUrl = await createAiCandidateOverlayDataUrl(wallCandidates);
    if (!candidateOverlayDataUrl) {
      setAiAnalysisStatus("후보 검토 이미지를 만들 수 없습니다");
      return;
    }
    if (candidateOverlayDataUrl.length > AI_CANDIDATE_REVIEW_MAX_DATA_URL_LENGTH) {
      setAiAnalysisStatus("후보 검토 이미지가 커서 전송하지 않았습니다. 화면을 확대하지 않은 상태에서 다시 시도하세요");
      return;
    }

    setIsProcessing(true);
    setAiAnalysisStatus("OpenAI가 OpenCV 벽 후보 검토중");
    try {
      const result = await requestFloorPlanAiAnalysis({
        analysisMode: "candidate-review",
        imageDataUrl: candidateOverlayDataUrl,
        model: "openai/floor-plan-vision",
        wallCandidates
      });
      applyAiCandidateReviewResult(result, wallCandidates);
      setAiAnalysisStatus(result.status === "ready" ? `${result.summary} 후보별 판정 확인` : result.summary);
    } catch {
      setAiAnalysisStatus("AI 벽 후보 검토 실패");
    } finally {
      setIsProcessing(false);
    }
  }

  function removeRejectedAiWallCandidates() {
    const rejectedIds = new Set((lastAiAnalysis?.candidateReviews ?? []).filter((review) => review.verdict === "reject").map((review) => review.id));
    const rejectedWallIds = new Set(
      aiReviewedWallCandidates.filter((candidate) => rejectedIds.has(candidate.id)).map((candidate) => candidate.originalWallId)
    );
    if (!rejectedWallIds.size) {
      setUploadStatus("AI가 제외로 판정한 벽 후보가 없습니다");
      return;
    }

    const nextWalls = walls.filter((wall) => !rejectedWallIds.has(String(wall.id)));
    const nextHiddenWallIds = new Set([...hiddenWallIds].filter((wallId) => !rejectedWallIds.has(String(wallId))));
    setWalls(nextWalls);
    setHiddenWallIds(nextHiddenWallIds);
    setSelectedWall((currentWall) => (currentWall && rejectedWallIds.has(String(currentWall.id)) ? null : currentWall));
    setScaleWall((currentWall) => (currentWall && rejectedWallIds.has(String(currentWall.id)) ? null : currentWall));
    setHoveredWall((currentWall) => (currentWall && rejectedWallIds.has(String(currentWall.id)) ? null : currentWall));
    setExtractionMeta((currentMeta) => ({ ...currentMeta, detectedWallCount: nextWalls.length, needsReview: true }));
    setUploadStatus(`AI 제외 후보 ${walls.length - nextWalls.length}개 삭제`);
  }

  function normalizeWallLengths() {
    if (walls.length < 2) {
      setUploadStatus("길이를 맞출 벽이 부족합니다");
      return;
    }

    const points = walls.flatMap((wall) => [wall.start, wall.end]);
    const bounds = {
      maxX: Math.max(...points.map((point) => point.x)),
      maxY: Math.max(...points.map((point) => point.y)),
      minX: Math.min(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y))
    };
    const nextWalls = walls.map((wall) => snapWallToLengthBounds(wall, bounds));
    const changedCount = nextWalls.filter((wall, index) => {
      const previous = walls[index];
      return (
        previous.start.x !== wall.start.x ||
        previous.start.y !== wall.start.y ||
        previous.end.x !== wall.end.x ||
        previous.end.y !== wall.end.y
      );
    }).length;

    setWalls(nextWalls);
    setSelectedWall((currentWall) => (currentWall ? nextWalls.find((wall) => wall.id === currentWall.id) ?? null : null));
    setScaleWall((currentWall) => (currentWall ? nextWalls.find((wall) => wall.id === currentWall.id) ?? null : null));
    setHoveredWall((currentWall) => (currentWall ? nextWalls.find((wall) => wall.id === currentWall.id) ?? null : null));
    setExtractionMeta((currentMeta) => ({ ...currentMeta, detectedWallCount: nextWalls.length, needsReview: true }));
    setUploadStatus(changedCount ? `벽 길이 ${changedCount}개 보정` : "보정할 길이 차이가 없습니다");
  }

  function applyScale() {
    if (!scaleWall || !scaleRealLength) return;
    const pixelDistance = Math.hypot(scaleWall.end.x - scaleWall.start.x, scaleWall.end.y - scaleWall.start.y);
    const realLengthMm = Number(scaleRealLength);
    if (!pixelDistance || !realLengthMm) return;

    setPixelToMmRatio(realLengthMm / pixelDistance);
    setIsScaleSet(true);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
    setScaleWall(null);
    setScaleRealLength("");
    setTool("wall");
    setUploadStatus(`축척 적용됨: 1px = ${(realLengthMm / pixelDistance).toFixed(2)}mm`);
  }

  function confirmSuggestedScale() {
    setIsScaleSet(true);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
    setUploadStatus(`축척 확인 완료: 1px = ${pixelToMmRatio.toFixed(2)}mm`);
  }

  function applyAiDimensionToSelectedWall(dimension: AiDimensionDetection) {
    if (!selectedWall) {
      setTool("select");
      setUploadStatus("치수를 적용할 벽을 먼저 선택하세요");
      return;
    }

    const pixelDistance = Math.hypot(selectedWall.end.x - selectedWall.start.x, selectedWall.end.y - selectedWall.start.y);
    if (!pixelDistance) {
      setUploadStatus("선택한 벽 길이를 계산할 수 없습니다");
      return;
    }

    const nextPixelToMmRatio = dimension.realLengthMm / pixelDistance;
    setPixelToMmRatio(nextPixelToMmRatio);
    setIsScaleSet(true);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
    setScaleWall(null);
    setScaleRealLength("");
    setTool("select");
    setUploadStatus(`AI 치수 ${dimension.text} 적용됨: 1px = ${nextPixelToMmRatio.toFixed(2)}mm`);
  }

  function applyManualAiScaleToSelectedWall() {
    if (!selectedWall) {
      setTool("select");
      setUploadStatus("축척을 적용할 벽을 먼저 선택하세요");
      return;
    }

    const pixelDistance = Math.hypot(selectedWall.end.x - selectedWall.start.x, selectedWall.end.y - selectedWall.start.y);
    const realLengthMm = Number(manualAiScaleRealLength);
    if (!pixelDistance || !Number.isFinite(realLengthMm) || realLengthMm <= 0) {
      setUploadStatus("선택 벽 실제 길이를 mm로 입력하세요");
      return;
    }

    const nextPixelToMmRatio = realLengthMm / pixelDistance;
    setPixelToMmRatio(nextPixelToMmRatio);
    setIsScaleSet(true);
    setExtractionMeta((currentMeta) => ({ ...currentMeta, scaleConfirmed: true }));
    setScaleWall(null);
    setScaleRealLength("");
    setManualAiScaleRealLength("");
    setTool("select");
    setUploadStatus(`선택 벽 축척 적용됨: 1px = ${nextPixelToMmRatio.toFixed(2)}mm`);
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
      setUploadStatus(nextStatus === "PUBLISHED" ? "발행 완료" : "저장 완료");
    } catch {
      window.localStorage.setItem("floorPlanDraft", JSON.stringify({ ...payload, savedAt: Date.now(), status: "LOCAL_DRAFT" }));
      setUploadStatus("API 저장 실패 - 로컬 임시 저장");
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
    setUploadStatus("임차인/일반사용자 배치 저장 완료");
  }

  return (
    <section className="floor-plan-editor wheretoput-floor-plan-editor" aria-label="Roomlog 3D 도면 편집기">
      <aside className="floor-plan-toolbar wheretoput-floor-plan-toolbar" aria-label="도면 도구">
        <div className="floor-plan-mode-switch" aria-label="사용 모드">
          <button
            className={experienceMode === "landlord" ? "active" : ""}
            onClick={() => setExperienceMode("landlord")}
            type="button"
          >
            <strong>집주인 모드</strong>
            <span>도면 생성/검수/발행</span>
          </button>
          <button
            className={experienceMode === "resident" ? "active" : ""}
            onClick={() => {
              setExperienceMode("resident");
              setViewMode("3d");
            }}
            type="button"
          >
            <strong>임차인/일반사용자 모드</strong>
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
              ["opening", "문창문", "문/창문 후보 검수"],
              ["fixture", "설비", "고정 설비 후보 검수"],
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
          <input accept="image/*" className="floor-plan-file-input" onChange={handleImageUpload} ref={fileInputRef} type="file" />
          {experienceMode === "landlord" ? (
            <>
              <button className="floor-plan-secondary" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} type="button">
                도면 등록
              </button>
              <button className="floor-plan-secondary" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} type="button">
                벽 자동 추출
              </button>
              <button className="floor-plan-secondary" onClick={() => setTool("scale")} type="button">
                축척
              </button>
              <select
                aria-label="NVIDIA 도면 AI 모델"
                className="floor-plan-ai-model-select"
                disabled={isProcessing}
                onChange={(event) => setSelectedAiModel(event.target.value as FloorPlanAiModelId)}
                value={selectedAiModel}
              >
                {FLOOR_PLAN_AI_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <button
                className="floor-plan-secondary"
                disabled={isProcessing || (!uploadedFloorPlanSource?.attachmentId && !uploadedAiImageDataUrl)}
                onClick={runAiDimensionAnalysis}
                type="button"
              >
                AI 정밀 수치 읽기
              </button>
              <button className="floor-plan-secondary" disabled={isProcessing || !uploadedImage || !walls.length} onClick={runAiCandidateReview} type="button">
                AI 후보 검토
              </button>
            </>
          ) : (
            <button className="floor-plan-secondary" onClick={() => setViewMode("3d")} type="button">
              3D 배치 보기
            </button>
          )}
          <span>{uploadStatus}</span>
          {uploadedImage || lastAiAnalysis ? <span>{aiAnalysisStatus}</span> : null}
        </div>

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
        </div>
      </section>

      <aside className="floor-plan-sidepanel" aria-label="도면 정보">
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
            <dt>OpenCV</dt>
            <dd>{opencvReady ? "준비됨" : "추출 엔진 준비중"}</dd>
          </div>
          <div>
            <dt>추출 시간</dt>
            <dd>{lastExtractionMs ? `${lastExtractionMs}ms` : "대기"}</dd>
          </div>
          <div>
            <dt>저장 ID</dt>
            <dd>{floorPlanDraftId ?? "로컬 초안"}</dd>
          </div>
          <div>
            <dt>사용 모드</dt>
            <dd>{experienceMode === "landlord" ? "집주인 모드" : "임차인/일반사용자 모드"}</dd>
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

            {tool === "scale" ? (
              <div className="floor-plan-sim-preview">
                <span>축척 설정</span>
                {extractionMeta.scaleCandidates[0] && !isScaleSet ? (
                  <>
                    <code>
                      자동 추정 {extractionMeta.scaleCandidates[0].realLengthMm}mm / {extractionMeta.scaleCandidates[0].pixelLength}px
                    </code>
                    <button className="floor-plan-primary" onClick={confirmSuggestedScale} type="button">
                      축척 확인
                    </button>
                  </>
                ) : null}
                {scaleWall ? (
                  <>
                    <input
                      aria-label="실제 길이 mm"
                      onChange={(event) => setScaleRealLength(event.target.value)}
                      placeholder="실제 길이 mm"
                      type="number"
                      value={scaleRealLength}
                    />
                    <button className="floor-plan-primary" disabled={!scaleRealLength} onClick={applyScale} type="button">
                      축척 적용
                    </button>
                  </>
                ) : (
                  <code>기준 벽을 그려주세요</code>
                )}
              </div>
            ) : null}

            {uploadedImage || lastAiAnalysis || aiTextDetections.length ? (
              <div className="floor-plan-sim-preview">
                <span>AI 분석 결과</span>
                <code>
                  {lastAiAnalysis
                    ? lastAiAnalysis.summary
                    : uploadedImage
                      ? "OpenAI Vision 분석 후 표시"
                      : "분석 결과 없음"}
                </code>
                <span>선택 벽 실제 길이</span>
                <input
                  onChange={(event) => setManualAiScaleRealLength(event.target.value)}
                  placeholder="mm 입력"
                  type="number"
                  value={manualAiScaleRealLength}
                />
                <button
                  className="floor-plan-primary"
                  disabled={!manualAiScaleRealLength}
                  onClick={applyManualAiScaleToSelectedWall}
                  type="button"
                >
                  선택 벽 축척 적용
                </button>
                {visibleAiDimensionDetections.length ? (
                  <>
                    <span>최대 가로/세로 치수</span>
                    <code>{selectedWall ? `선택 벽 ${selectedWall.id}에 적용` : "벽을 선택한 뒤 치수 적용"}</code>
                    <div className="floor-plan-furniture-actions">
                      {visibleAiDimensionDetections.map((dimension) => (
                        <button
                          className="floor-plan-secondary"
                          key={`${dimension.text}-${dimension.realLengthMm}`}
                          onClick={() => applyAiDimensionToSelectedWall(dimension)}
                          type="button"
                        >
                          {dimension.text} 축척 적용
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <code>{aiTextDetections.length ? "m/cm/mm 단위 치수만 적용 가능" : "아직 읽은 치수가 없습니다"}</code>
                )}
                {lastAiAnalysis?.candidateReviews?.length ? (
                  <>
                    <span>AI 후보 검토</span>
                    <code>
                      유지 {aiCandidateReviewSummary.keep} / 제외 {aiCandidateReviewSummary.reject} / 검토 {aiCandidateReviewSummary.review}
                    </code>
                    <div className="floor-plan-furniture-actions">
                      <button
                        className="floor-plan-secondary"
                        disabled={!aiCandidateReviewSummary.reject}
                        onClick={removeRejectedAiWallCandidates}
                        type="button"
                      >
                        AI 제외 후보 삭제
                      </button>
                      <button className="floor-plan-secondary" disabled={walls.length < 2} onClick={normalizeWallLengths} type="button">
                        벽 길이 자동 보정
                      </button>
                      {lastAiAnalysis.candidateReviews.slice(0, 8).map((review) => (
                        <code key={`${review.id}-${review.verdict}`}>
                          {review.id} {review.verdict} {review.confidence ? `${Math.round(review.confidence * 100)}%` : ""} {review.reason ?? ""}
                        </code>
                      ))}
                    </div>
                    {lastAiAnalysis.missingWallHints?.length ? (
                      <code>누락 후보: {lastAiAnalysis.missingWallHints.map((hint) => hint.description).join(" / ")}</code>
                    ) : null}
                  </>
                ) : null}
                {lastRoomStructureAnalysis?.analysisMode === "room-structure" ? (
                  <>
                    <span>AI 방 구조</span>
                    <code>
                      {lastRoomStructureAnalysis.planStyle ?? "style-unknown"} / rooms {lastRoomStructureAnalysis.rooms?.length ?? 0}
                    </code>
                  </>
                ) : null}
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
                  aria-label="가구 검색"
                  onChange={(event) => setFurnitureSearchQuery(event.target.value)}
                  placeholder="가구명, 브랜드, 카테고리 검색"
                  type="search"
                  value={furnitureSearchQuery}
                />
              </div>
              <div className="floor-plan-furniture-kind-tabs" role="tablist" aria-label="가구 카테고리">
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
