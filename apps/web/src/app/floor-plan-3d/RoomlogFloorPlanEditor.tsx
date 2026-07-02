"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  createStarterWalls,
  createWallsFromDetectedLines,
  convertWallsToWheretoputRoom3D,
  convertWallsToWheretoputSimulator,
  detectFixtureCandidates,
  detectOpeningCandidates,
  detectWallLinesFromImageData,
  distanceToWall,
  estimateScaleCandidateFromDimensions,
  filterCommercialWallCandidates,
  moveCandidate,
  snapToOrthogonal,
  summarizeWalls,
  updateCandidateStatus
} from "./floor-plan-editor-model.mjs";

type EditorTool = "wall" | "select" | "eraser" | "partial_eraser" | "hide" | "opening" | "fixture" | "furniture" | "scale" | "none";
type ViewMode = "2d" | "3d";
type ExperienceMode = "landlord" | "resident";
type Point = { x: number; y: number };
type Wall = { id: string | number; start: Point; end: Point };
type WallSummary = { wallCount: number; approximateMeters: number; status: "초안" | "편집중" };
type CandidateStatus = "CANDIDATE" | "CONFIRMED" | "REJECTED";
type FloorPlanCandidate = {
  confidence?: number;
  id: string;
  label?: string;
  movable?: boolean;
  position: Point;
  sizeMm?: { depth?: number; width?: number };
  source: string;
  status: CandidateStatus;
  type: string;
  widthMm?: number;
};
type ScaleCandidate = {
  confidence: number;
  pixelLength: number;
  pixelToMmRatio: number;
  realLengthMm: number;
  source: string;
};
type ExtractionMeta = {
  detectedWallCount: number;
  ocrStatus: "ready" | "failed" | "manual-scale-required";
  processingMs?: number;
  removedNoiseCount: number;
  scaleCandidates: ScaleCandidate[];
  scaleConfirmed: boolean;
};
type DetectedLine = {
  confidence?: number;
  markers?: string[];
  orientation?: "horizontal" | "vertical";
  thickness?: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};
type DetectedWallResult = {
  dimensionCandidates?: Array<{ confidence: number; line: DetectedLine; source: string; text?: string }>;
  imageHeight: number;
  imageUrl: string;
  imageWidth: number;
  lines: DetectedLine[];
  removedNoiseCount?: number;
  scaleCandidates?: ScaleCandidate[];
  processingMs?: number;
};
type UploadedFloorPlanSource = { attachmentId?: string; imageUrl?: string };
type FurnitureCatalogItem = {
  brand: string;
  color: string;
  furniture_id: string;
  imageUrls?: string[];
  length: [number, number, number];
  modelUrl?: string;
  name: string;
  price: number;
  source?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
};
type PlacedFurniture = FurnitureCatalogItem & {
  editableBy?: ["LANDLORD"];
  furnitureId?: string;
  id: string;
  includedInLease?: boolean;
  locked?: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  sizeMm?: { depth: number; height?: number; width: number };
  source?: "LANDLORD_OPTION" | "RESIDENT_DESIGN" | string;
  visibleToTenant?: boolean;
};
type WheretoputWall3D = {
  dimensions: { width: number; height: number; depth: number };
  id: string;
  material?: "wall";
  original2D?: Wall;
  position: [number, number, number];
  rotation: [number, number, number];
  wall_id: string | number;
};

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1200;
const GRID_SIZE_PX = 25;
const DEFAULT_PIXEL_TO_MM_RATIO = 20;
const MAX_EXTRACTION_DIMENSION = 1600;
const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";
const TESSERACT_OCR_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    brand: "Roomlog Basic",
    color: "#8fb5ff",
    furniture_id: "furniture-bed-queen",
    length: [2000, 420, 1500],
    modelUrl: "/furniture-models/bed-queen.glb",
    name: "퀸 침대",
    price: 390000
  },
  {
    brand: "Wheretoput",
    color: "#f3b36a",
    furniture_id: "furniture-sofa-3",
    length: [2100, 760, 880],
    modelUrl: "/furniture-models/sofa-couch.glb",
    name: "3인 소파",
    price: 520000
  },
  {
    brand: "Roomlog Studio",
    color: "#9ed8b3",
    furniture_id: "furniture-desk",
    length: [1200, 740, 600],
    modelUrl: "/furniture-models/table-moon.glb",
    name: "책상",
    price: 160000
  },
  {
    brand: "Roomlog Studio",
    color: "#d6b0ff",
    furniture_id: "furniture-chair",
    length: [520, 820, 520],
    modelUrl: "/furniture-models/chair-kevi.glb",
    name: "의자",
    price: 69000
  },
  {
    brand: "Roomlog Storage",
    color: "#f1d17a",
    furniture_id: "furniture-wardrobe",
    length: [900, 1900, 580],
    modelUrl: "/furniture-models/wardrobe-cabinet.glb",
    name: "옷장",
    price: 240000
  }
];

function normalizeCatalogItem(item: FurnitureCatalogItem, index: number): FurnitureCatalogItem {
  const fallback = FURNITURE_CATALOG[index % FURNITURE_CATALOG.length];
  const [width, height, depth] = Array.isArray(item.length) ? item.length : fallback.length;

  return {
    brand: item.brand || fallback.brand,
    color: item.color || fallback.color,
    furniture_id: item.furniture_id || fallback.furniture_id,
    imageUrls: item.imageUrls,
    length: [
      Number.isFinite(Number(width)) ? Number(width) : fallback.length[0],
      Number.isFinite(Number(height)) ? Number(height) : fallback.length[1],
      Number.isFinite(Number(depth)) ? Number(depth) : fallback.length[2]
    ],
    modelUrl: item.modelUrl || fallback.modelUrl,
    name: item.name || fallback.name,
    price: Number.isFinite(Number(item.price)) ? Number(item.price) : fallback.price,
    source: item.source,
    sourceUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl
  };
}

class WallDetector {
  constructor(private readonly worker: Worker | null = null) {}

  async detectWalls(file: File) {
    if (this.worker) {
      try {
        return await detectWallsWithWorker(this.worker, file);
      } catch {
        return fallbackCanvasWallExtraction(file);
      }
    }

    return fallbackCanvasWallExtraction(file);
  }
}

async function fallbackCanvasWallExtraction(file: File): Promise<DetectedWallResult> {
    const imageUrl = URL.createObjectURL(file);
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Canvas context is not available");

    const { height, width } = scaledImageSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const startedAt = performance.now();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const lines = detectWallLinesFromImageData(imageData, {
      darkThreshold: 185,
      maxLines: 24,
      minRunLength: Math.max(32, Math.round(Math.min(canvas.width, canvas.height) * 0.08))
    }) as DetectedLine[];
    const commercialCandidates = filterCommercialWallCandidates(lines, { height: canvas.height, width: canvas.width }) as {
      dimensionCandidates: Array<{ confidence: number; line: DetectedLine; source: string; text?: string }>;
      removedNoiseCount: number;
      walls: DetectedLine[];
    };
    const scaleCandidate = estimateScaleCandidateFromDimensions(commercialCandidates.dimensionCandidates) as ScaleCandidate | null;

    return {
      dimensionCandidates: commercialCandidates.dimensionCandidates,
      imageHeight: canvas.height,
      imageUrl,
      imageWidth: canvas.width,
      lines: commercialCandidates.walls,
      removedNoiseCount: commercialCandidates.removedNoiseCount,
      scaleCandidates: scaleCandidate ? [scaleCandidate] : [],
      processingMs: Math.round(performance.now() - startedAt)
    };
}

function scaledImageSize(width: number, height: number) {
  const longSide = Math.max(width, height);
  if (longSide <= MAX_EXTRACTION_DIMENSION) return { height, width };

  const scale = MAX_EXTRACTION_DIMENSION / longSide;
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale))
  };
}

function detectWallsWithWorker(worker: Worker, file: File): Promise<DetectedWallResult> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);

    loadImage(imageUrl)
      .then((image) => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas context is not available");

        const { height, width } = scaledImageSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type !== "result") return;
          worker.removeEventListener("message", handleMessage);
          const rawLines = Array.isArray(event.data.lines) ? event.data.lines : [];
          const commercialCandidates = filterCommercialWallCandidates(rawLines, {
            height: Number(event.data.imageHeight) || height,
            width: Number(event.data.imageWidth) || width
          }) as {
            dimensionCandidates: Array<{ confidence: number; line: DetectedLine; source: string; text?: string }>;
            removedNoiseCount: number;
            walls: DetectedLine[];
          };
          const scaleCandidate = estimateScaleCandidateFromDimensions([
            ...commercialCandidates.dimensionCandidates,
            ...(Array.isArray(event.data.dimensionCandidates) ? event.data.dimensionCandidates : [])
          ]) as ScaleCandidate | null;
          resolve({
            dimensionCandidates: commercialCandidates.dimensionCandidates,
            imageHeight: Number(event.data.imageHeight) || height,
            imageUrl,
            imageWidth: Number(event.data.imageWidth) || width,
            lines: commercialCandidates.walls,
            removedNoiseCount: commercialCandidates.removedNoiseCount + (Number(event.data.removedNoiseCount) || 0),
            scaleCandidates: scaleCandidate ? [scaleCandidate] : Array.isArray(event.data.scaleCandidates) ? event.data.scaleCandidates : [],
            processingMs: Number(event.data.processingMs) || undefined
          });
        };

        const handleError = (event: ErrorEvent) => {
          worker.removeEventListener("message", handleMessage);
          reject(event.error ?? new Error(event.message));
        };

        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError, { once: true });
        worker.postMessage(
          {
            imageData: context.getImageData(0, 0, width, height),
            maxDimension: MAX_EXTRACTION_DIMENSION,
            opencvUrl: OPENCV_URL,
            tesseractOcrUrl: TESSERACT_OCR_URL,
            type: "extract"
          },
          []
        );
      })
      .catch(reject);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = source;
  });
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

function isFurnitureCatalogItem(value: unknown): value is FurnitureCatalogItem {
  const item = value as FurnitureCatalogItem;

  return Boolean(
    item &&
      typeof item.brand === "string" &&
      typeof item.color === "string" &&
      typeof item.furniture_id === "string" &&
      Array.isArray(item.length) &&
      item.length.length === 3 &&
      item.length.every((dimension) => typeof dimension === "number" && Number.isFinite(dimension) && dimension > 0) &&
      typeof item.name === "string" &&
      typeof item.price === "number"
  );
}

function calculateDistance(p1: Point, p2: Point, pixelToMmRatio: number) {
  return Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) * pixelToMmRatio);
}

function snapCanvasPoint(point: Point) {
  return {
    x: Math.round(point.x / GRID_SIZE_PX) * GRID_SIZE_PX,
    y: Math.round(point.y / GRID_SIZE_PX) * GRID_SIZE_PX
  };
}

function projectPointOntoWall(point: Point, wall: Wall): Point {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return wall.start;

  const t = Math.max(
    0,
    Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared)
  );

  return {
    x: wall.start.x + dx * t,
    y: wall.start.y + dy * t
  };
}

function splitWallByEraseArea(wall: Wall, eraseStart: Point, eraseEnd: Point): Wall[] {
  const parameterOnLine = (point: Point) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return 0;
    return Math.max(0, Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared));
  };
  const tStart = Math.min(parameterOnLine(eraseStart), parameterOnLine(eraseEnd));
  const tEnd = Math.max(parameterOnLine(eraseStart), parameterOnLine(eraseEnd));
  const segments: Wall[] = [];

  if (tEnd - tStart < 0.05) return [wall];

  if (tStart > 0.05) {
    segments.push({
      id: `${wall.id}-a-${Date.now()}`,
      start: wall.start,
      end: {
        x: wall.start.x + (wall.end.x - wall.start.x) * tStart,
        y: wall.start.y + (wall.end.y - wall.start.y) * tStart
      }
    });
  }

  if (tEnd < 0.95) {
    segments.push({
      id: `${wall.id}-b-${Date.now()}`,
      start: {
        x: wall.start.x + (wall.end.x - wall.start.x) * tEnd,
        y: wall.start.y + (wall.end.y - wall.start.y) * tEnd
      },
      end: wall.end
    });
  }

  return segments;
}

function splitWallByRatio(wall: Wall, centerRatio: number): Wall[] {
  const wallPixels = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (wallPixels < GRID_SIZE_PX * 2) return [wall];

  const eraseRatio = Math.max(0.1, Math.min(0.28, (GRID_SIZE_PX * 2) / wallPixels));
  const tStart = Math.max(0, centerRatio - eraseRatio / 2);
  const tEnd = Math.min(1, centerRatio + eraseRatio / 2);

  return splitWallByEraseArea(
    wall,
    {
      x: wall.start.x + (wall.end.x - wall.start.x) * tStart,
      y: wall.start.y + (wall.end.y - wall.start.y) * tStart
    },
    {
      x: wall.start.x + (wall.end.x - wall.start.x) * tEnd,
      y: wall.start.y + (wall.end.y - wall.start.y) * tEnd
    }
  );
}

function getStarterWalls(): Wall[] {
  return createStarterWalls() as Wall[];
}

function createFurnitureModel(item: FurnitureCatalogItem, position: [number, number, number] = [0, 0, 0]): PlacedFurniture {
  return {
    ...item,
    id: `furniture-${item.furniture_id}-${Date.now()}`,
    position: [position[0], item.length[1] / 2000, position[2]],
    rotation: [0, 0, 0],
    scale: 1
  };
}

function createLandlordOptionFurniture(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    editableBy: ["LANDLORD"],
    furnitureId: furniture.furniture_id,
    includedInLease: true,
    locked: true,
    sizeMm: { depth: furniture.length[2], height: furniture.length[1], width: furniture.length[0] },
    source: "LANDLORD_OPTION",
    visibleToTenant: true
  };
}

function createResidentDesignFurniture(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    source: furniture.source === "LANDLORD_OPTION" ? furniture.source : "RESIDENT_DESIGN"
  };
}

function isLandlordOptionFurniture(furniture: PlacedFurniture) {
  return furniture.source === "LANDLORD_OPTION" || furniture.locked === true;
}

function isLockedFurnitureForResident(furniture: PlacedFurniture, experienceMode: ExperienceMode) {
  return experienceMode === "resident" && isLandlordOptionFurniture(furniture);
}

function getFurnitureDimensions(furniture: Pick<PlacedFurniture, "length" | "scale">) {
  return {
    depth: Math.max(0.05, (furniture.length[2] / 1000) * furniture.scale),
    height: Math.max(0.05, (furniture.length[1] / 1000) * furniture.scale),
    width: Math.max(0.05, (furniture.length[0] / 1000) * furniture.scale)
  };
}

function RoomFloor({
  onFloorPointerDown,
  wallsData
}: {
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  wallsData: WheretoputWall3D[];
}) {
  const bounds = useMemo(() => {
    if (wallsData.length === 0) {
      return { centerX: 0, centerZ: 0, height: 8, width: 8 };
    }

    const points = wallsData.flatMap((wall) => {
      const half = wall.dimensions.width / 2;
      const angle = wall.rotation[1];
      return [
        {
          x: wall.position[0] - Math.cos(angle) * half,
          z: wall.position[2] - Math.sin(angle) * half
        },
        {
          x: wall.position[0] + Math.cos(angle) * half,
          z: wall.position[2] + Math.sin(angle) * half
        }
      ];
    });
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minZ = Math.min(...points.map((point) => point.z));
    const maxZ = Math.max(...points.map((point) => point.z));

    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      height: Math.max(0.5, maxZ - minZ - 0.1),
      width: Math.max(0.5, maxX - minX - 0.1)
    };
  }, [wallsData]);

  return (
    <mesh onPointerDown={onFloorPointerDown} position={[bounds.centerX, 0, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[bounds.width, bounds.height]} />
      <meshBasicMaterial color="#f3d9a0" />
    </mesh>
  );
}

function FurnitureBoxMesh({
  furniture,
  isPending = false,
  isSelected,
  onPointerDown
}: {
  furniture: PlacedFurniture;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  const dimensions = getFurnitureDimensions(furniture);

  return (
    <mesh
      onPointerDown={(event) => onPointerDown(furniture, event)}
      position={furniture.position}
      rotation={furniture.rotation}
      receiveShadow
      castShadow
    >
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshBasicMaterial
        color={isSelected ? "#2f55ff" : furniture.color}
        opacity={isPending ? 0.42 : isSelected ? 0.96 : 0.86}
        transparent
      />
    </mesh>
  );
}

function FurnitureGlbMesh({
  furniture,
  isPending = false,
  isSelected,
  onPointerDown
}: {
  furniture: PlacedFurniture;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  const gltf = useGLTF(furniture.modelUrl ?? FURNITURE_CATALOG[0].modelUrl ?? "");
  const dimensions = getFurnitureDimensions(furniture);
  const { modelOffsetY, scene, scale } = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.castShadow = true;
      child.receiveShadow = true;

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        material.transparent = isPending;
        material.opacity = isPending ? 0.48 : 1;
        material.needsUpdate = true;
      });
    });

    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());
    const actualWidth = Math.max(size.x, 0.001);
    const actualHeight = Math.max(size.y, 0.001);
    const actualDepth = Math.max(size.z, 0.001);
    const targetLongSide = Math.max(dimensions.width, dimensions.depth);
    const targetShortSide = Math.min(dimensions.width, dimensions.depth);
    const [targetWidth, targetDepth] =
      actualWidth >= actualDepth ? [targetLongSide, targetShortSide] : [targetShortSide, targetLongSide];
    const modelScale: [number, number, number] = [
      targetWidth / actualWidth,
      dimensions.height / actualHeight,
      targetDepth / actualDepth
    ];

    return {
      modelOffsetY: -box.min.y * modelScale[1],
      scale: modelScale,
      scene: clonedScene
    };
  }, [dimensions.depth, dimensions.height, dimensions.width, furniture.modelUrl, gltf.scene, isPending]);

  return (
    <group
      onPointerDown={(event) => onPointerDown(furniture, event)}
      position={[furniture.position[0], 0, furniture.position[2]]}
      rotation={furniture.rotation}
    >
      <primitive object={scene} position={[0, modelOffsetY, 0]} scale={scale} />
      {isSelected ? (
        <mesh position={[0, dimensions.height / 2, 0]}>
          <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
          <meshBasicMaterial color="#2f55ff" opacity={0.4} transparent wireframe />
        </mesh>
      ) : null}
    </group>
  );
}

function FurnitureMesh(props: {
  furniture: PlacedFurniture;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  if (!props.furniture.modelUrl) {
    return <FurnitureBoxMesh {...props} />;
  }

  return (
    <Suspense fallback={<FurnitureBoxMesh {...props} />}>
      <FurnitureGlbMesh {...props} />
    </Suspense>
  );
}

function WallMesh({
  isSelected,
  onPointerDown,
  wall
}: {
  isSelected: boolean;
  onPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  wall: WheretoputWall3D;
}) {
  return (
    <mesh
      onPointerDown={(event) => onPointerDown(wall, event)}
      position={wall.position}
      rotation={wall.rotation}
      receiveShadow
      castShadow
    >
      <boxGeometry args={[wall.dimensions.width, wall.dimensions.height, wall.dimensions.depth]} />
      <meshBasicMaterial color={isSelected ? "#2f55ff" : "#eeeeec"} opacity={isSelected ? 0.92 : 0.78} transparent />
    </mesh>
  );
}

function RoomlogThreeFloorPlanView({
  furnitureData,
  onFloorPointerDown,
  onFurniturePointerDown,
  onWallPointerDown,
  pendingFurniture,
  selectedFurnitureId,
  selectedWallId,
  wallsData
}: {
  furnitureData: PlacedFurniture[];
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onFurniturePointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  pendingFurniture: PlacedFurniture | null;
  selectedFurnitureId: string | null;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  return (
    <div className="floor-plan-3d-preview" data-renderer="wheretoput 3D room renderer">
      <Canvas camera={{ fov: 50, position: [14, 12, 18] }} shadows>
        <color attach="background" args={["#626260"]} />
        <ambientLight intensity={0.72} />
        <directionalLight castShadow intensity={1.4} position={[6, 12, 8]} />
        <RoomFloor onFloorPointerDown={onFloorPointerDown} wallsData={wallsData} />
        {wallsData.map((wall) => (
          <WallMesh
            isSelected={String(selectedWallId ?? "") === String(wall.wall_id)}
            key={wall.id}
            onPointerDown={onWallPointerDown}
            wall={wall}
          />
        ))}
        {furnitureData.map((furniture) => (
          <FurnitureMesh
            furniture={furniture}
            isSelected={selectedFurnitureId === furniture.id}
            key={furniture.id}
            onPointerDown={onFurniturePointerDown}
          />
        ))}
        {pendingFurniture ? (
          <FurnitureMesh furniture={pendingFurniture} isPending isSelected={false} onPointerDown={onFurniturePointerDown} />
        ) : null}
        <OrbitControls
          enableDamping
          makeDefault
          maxDistance={42}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={5}
          minPolarAngle={0.2}
          target={[0, 0, 0]}
        />
      </Canvas>
      <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>
    </div>
  );
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
  const [placedFurnitures, setPlacedFurnitures] = useState<PlacedFurniture[]>([]);
  const [pendingFurniture, setPendingFurniture] = useState<PlacedFurniture | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [openingCandidates, setOpeningCandidates] = useState<FloorPlanCandidate[]>([]);
  const [fixtureCandidates, setFixtureCandidates] = useState<FloorPlanCandidate[]>([]);
  const [extractionMeta, setExtractionMeta] = useState<ExtractionMeta>({
    detectedWallCount: 0,
    ocrStatus: "manual-scale-required",
    removedNoiseCount: 0,
    scaleCandidates: [],
    scaleConfirmed: false
  });
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFloorPlanSource, setUploadedFloorPlanSource] = useState<UploadedFloorPlanSource | null>(null);
  const [cachedBackgroundImage, setCachedBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("샘플 도면으로 시작");
  const [opencvReady, setOpenCvReady] = useState(false);
  const [lastExtractionMs, setLastExtractionMs] = useState<number | null>(null);
  const [floorPlanDraftId, setFloorPlanDraftId] = useState<string | null>(null);
  const [pixelToMmRatio, setPixelToMmRatio] = useState(DEFAULT_PIXEL_TO_MM_RATIO);
  const [isScaleSet, setIsScaleSet] = useState(false);
  const [scaleWall, setScaleWall] = useState<Wall | null>(null);
  const [scaleRealLength, setScaleRealLength] = useState("");
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
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
      extractionWorkerRef.current = new Worker(new URL("./floor-plan-extraction.worker.ts", import.meta.url));
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

    const drawWall = (wall: Wall, variant: "normal" | "draft" | "selected" | "hover" | "scale" | "erase" | "hidden") => {
      const colors = {
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
      if (variant === "draft" || variant === "hidden") context.setLineDash([3 / viewScale, 3 / viewScale]);
      context.beginPath();
      context.moveTo(wall.start.x, wall.start.y);
      context.lineTo(wall.end.x, wall.end.y);
      context.stroke();
      context.setLineDash([]);

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
    if (selectedFurniture && isLockedFurnitureForResident(selectedFurniture, experienceMode)) {
      setUploadStatus("세입자는 임대인 옵션 가구를 변경할 수 없습니다");
      return;
    }

    const nextPosition: [number, number, number] = [
      Number(point.x.toFixed(2)),
      pendingFurniture ? pendingFurniture.length[1] / 2000 : selectedFurniture?.position[1] ?? 0,
      Number(point.z.toFixed(2))
    ];

    if (pendingFurniture) {
      const baseFurniture = {
        ...pendingFurniture,
        id: `furniture-${pendingFurniture.furniture_id}-${Date.now()}`,
        position: nextPosition
      };
      const nextFurniture =
        experienceMode === "landlord" ? createLandlordOptionFurniture(baseFurniture) : createResidentDesignFurniture(baseFurniture);
      setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, nextFurniture]);
      setPendingFurniture(null);
      setSelectedFurnitureId(nextFurniture.id);
      setUploadStatus(experienceMode === "landlord" ? `${nextFurniture.name} 임대인 옵션 가구 배치 완료` : `${nextFurniture.name} 배치 완료`);
      return;
    }

    if (selectedFurnitureId) {
      setPlacedFurnitures((currentFurnitures) =>
        currentFurnitures.map((furniture) =>
          furniture.id === selectedFurnitureId ? { ...furniture, position: nextPosition } : furniture
        )
      );
      setUploadStatus(`${selectedFurniture?.name ?? "가구"} 위치 이동`);
    }
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
          ? { ...furniture, rotation: [0, Number((furniture.rotation[1] + Math.PI / 2).toFixed(4)), 0] }
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
      setSelectedWall(selectedWall?.id === closestWall?.id ? null : closestWall);
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

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus(opencvReady ? `${file.name} 도면 분석중` : `${file.name} 추출 엔진 준비중 - fallback 가능`);
    try {
      const sourceUploadPromise = uploadFloorPlanSource(file);
      const detector = new WallDetector(getExtractionWorker());
      const result = await detector.detectWalls(file);
      const sourceUpload = await sourceUploadPromise;
      const detectedWalls = createWallsFromDetectedLines(result.lines, {
        height: result.imageHeight,
        name: file.name,
        width: result.imageWidth
      }) as Wall[];
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

      setWalls(detectedWalls.length > 0 ? detectedWalls : getStarterWalls());
      setHiddenWallIds(new Set());
      setSelectedWall(null);
      setPendingFurniture(null);
      setSelectedFurnitureId(null);
      setOpeningCandidates(nextOpeningCandidates);
      setFixtureCandidates(nextFixtureCandidates);
      setUploadedImage(result.imageUrl);
      setUploadedFloorPlanSource(sourceUpload ?? { imageUrl: result.imageUrl });
      setFloorPlanDraftId(null);
      setLastExtractionMs(result.processingMs ?? null);
      setExtractionMeta({
        detectedWallCount: detectedWalls.length,
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
      setUploadStatus(
        `${file.name} 벽 후보 ${detectedWalls.length}개 추출, ${
          bestScaleCandidate ? "축척 확인 필요" : "수동 축척 필요"
        }, 검수 후 저장${result.processingMs ? ` (${result.processingMs}ms)` : ""}`
      );
    } catch {
      setUploadStatus("이미지 벽 추출 실패");
    } finally {
      setIsProcessing(false);
      event.target.value = "";
    }
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
    const room3d = {
      fixtures: fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
      furnitures: landlordOptionFurnitures,
      hiddenWallCount,
      openings: openingCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
      walls: roomWalls3D,
      wallCount: roomWalls3D.length
    };
    const nextExtractionMeta = { ...extractionMeta, scaleConfirmed: isScaleSet };
    const payload = {
      extractionMeta: nextExtractionMeta,
      fixtures: fixtureCandidates,
      furnitures: landlordOptionFurnitures,
      hiddenWallIds: Array.from(hiddenWallIds),
      openings: openingCandidates,
      pixelToMmRatio,
      room3d,
      sourceAttachmentId: uploadedFloorPlanSource?.attachmentId,
      sourceImageUrl: uploadedFloorPlanSource?.imageUrl ?? uploadedImage ?? undefined,
      status: nextStatus,
      walls
    };

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
      JSON.stringify({
        extractionMeta,
        fixtures: fixtureCandidates,
        furnitures: landlordOptionFurnitures,
        hiddenWallIds: Array.from(hiddenWallIds),
        openings: openingCandidates,
        pixelToMmRatio,
        room3d: {
          fixtures: fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
          furnitures: landlordOptionFurnitures,
          openings: openingCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
          walls: roomWalls3D
        },
        timestamp: Date.now(),
        walls
      })
    );
  }

  function saveResidentFurnitureDesign() {
    const landlordOptionFurnitures = placedFurnitures.filter(isLandlordOptionFurniture);
    const residentDesignFurnitures = placedFurnitures.filter((furniture) => !isLandlordOptionFurniture(furniture));
    const payload = {
      fixtures: fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
      furnitures: residentDesignFurnitures,
      hiddenWallIds: Array.from(hiddenWallIds),
      lockedFurnitures: landlordOptionFurnitures,
      mode: "resident",
      openings: openingCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
      pixelToMmRatio,
      room3d: { walls: roomWalls3D },
      savedAt: Date.now(),
      sourceFloorPlanDraftId: floorPlanDraftId,
      walls
    };
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
            </>
          ) : (
            <button className="floor-plan-secondary" onClick={() => setViewMode("3d")} type="button">
              3D 배치 보기
            </button>
          )}
          <span>{uploadStatus}</span>
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
            <dd>{isScaleSet ? `1px=${pixelToMmRatio.toFixed(2)}mm` : "1px=20mm"}</dd>
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
                {furnitureCatalogStatus} / 옵션 {landlordOptionFurnitures.length} / 내 배치 {residentDesignFurnitures.length}
              </code>
              <div className="floor-plan-furniture-grid">
                {furnitureCatalog.map((item) => (
                  <button
                    className={pendingFurniture?.furniture_id === item.furniture_id ? "active" : ""}
                    key={item.furniture_id}
                    onClick={() => handleFurnitureSelect(item)}
                    type="button"
                  >
                    <i style={{ backgroundColor: item.color }} />
                    <strong>{item.name}</strong>
                    <small>{item.brand}</small>
                    <em>{item.length.join("x")}mm</em>
                    <b>{Number(item.price).toLocaleString()}원</b>
                  </button>
                ))}
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
                      : "가구 도구에서 바닥을 클릭하면 위치 이동"}
                  </code>
                </>
              ) : pendingFurniture ? (
                <code>{pendingFurniture.name} 배치 위치를 3D 바닥에서 클릭</code>
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
