"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createStarterWalls,
  createWallsFromDetectedLines,
  convertWallsToWheretoputRoom3D,
  convertWallsToWheretoputSimulator,
  detectWallLinesFromImageData,
  distanceToWall,
  snapToOrthogonal,
  summarizeWalls
} from "./floor-plan-editor-model.mjs";

type EditorTool = "wall" | "select" | "eraser" | "partial_eraser" | "hide" | "scale" | "none";
type ViewMode = "2d" | "3d";
type Point = { x: number; y: number };
type Wall = { id: string | number; start: Point; end: Point };
type WallSummary = { wallCount: number; approximateMeters: number; status: "초안" | "편집중" };
type DetectedLine = { x1: number; y1: number; x2: number; y2: number; orientation?: "horizontal" | "vertical" };
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

class WallDetector {
  async detectWalls(file: File) {
    const imageUrl = URL.createObjectURL(file);
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Canvas context is not available");

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const lines = detectWallLinesFromImageData(imageData, {
      darkThreshold: 185,
      minRunLength: Math.max(32, Math.round(Math.min(canvas.width, canvas.height) * 0.08))
    }) as DetectedLine[];

    return {
      imageHeight: canvas.height,
      imageUrl,
      imageWidth: canvas.width,
      lines
    };
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = source;
  });
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

function RoomFloor({ wallsData }: { wallsData: WheretoputWall3D[] }) {
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
    <mesh position={[bounds.centerX, 0, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[bounds.width, bounds.height]} />
      <meshBasicMaterial color="#f3d9a0" />
    </mesh>
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
  onWallPointerDown,
  selectedWallId,
  wallsData
}: {
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  return (
    <div className="floor-plan-3d-preview" data-renderer="wheretoput 3D room renderer">
      <Canvas camera={{ fov: 50, position: [14, 12, 18] }} shadows>
        <color attach="background" args={["#626260"]} />
        <ambientLight intensity={0.72} />
        <directionalLight castShadow intensity={1.4} position={[6, 12, 8]} />
        <RoomFloor wallsData={wallsData} />
        {wallsData.map((wall) => (
          <WallMesh
            isSelected={String(selectedWallId ?? "") === String(wall.wall_id)}
            key={wall.id}
            onPointerDown={onWallPointerDown}
            wall={wall}
          />
        ))}
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
  const [tool, setTool] = useState<EditorTool>("wall");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [walls, setWalls] = useState<Wall[]>(() => getStarterWalls());
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [hoveredWall, setHoveredWall] = useState<Wall | null>(null);
  const [hiddenWallIds, setHiddenWallIds] = useState<Set<string>>(() => new Set());
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [cachedBackgroundImage, setCachedBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("샘플 도면으로 시작");
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

  function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    const shouldPan = tool === "none";
    if (shouldPan) {
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

  function handleMouseUp(event: React.MouseEvent<HTMLCanvasElement>) {
    setIsDragging(false);
    setLastPanPoint(null);

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

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    setViewScale((currentScale) => Math.max(0.1, Math.min(10, currentScale * (event.deltaY > 0 ? 0.9 : 1.1))));
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus(`${file.name} 이미지 벽 추출 중`);
    try {
      const detector = new WallDetector();
      const result = await detector.detectWalls(file);
      const detectedWalls = createWallsFromDetectedLines(result.lines, {
        height: result.imageHeight,
        name: file.name,
        width: result.imageWidth
      }) as Wall[];

      setWalls(detectedWalls.length > 0 ? detectedWalls : getStarterWalls());
      setHiddenWallIds(new Set());
      setSelectedWall(null);
      setUploadedImage(result.imageUrl);
      setUploadStatus(`${file.name} 이미지 벽 ${detectedWalls.length}개 추출`);
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
    setScaleWall(null);
    setScaleRealLength("");
    setTool("wall");
    setUploadStatus(`축척 적용됨: 1px = ${(realLengthMm / pixelDistance).toFixed(2)}mm`);
  }

  function convertTo3D() {
    setViewMode((currentMode) => (currentMode === "2d" ? "3d" : "2d"));
    window.localStorage.setItem(
      "floorPlanData",
      JSON.stringify({ hiddenWallIds: Array.from(hiddenWallIds), pixelToMmRatio, timestamp: Date.now(), walls })
    );
  }

  return (
    <section className="floor-plan-editor wheretoput-floor-plan-editor" aria-label="Roomlog 3D 도면 편집기">
      <aside className="floor-plan-toolbar wheretoput-floor-plan-toolbar" aria-label="도면 도구">
        {[
          ["wall", "드로잉", "벽 그리기"],
          ["select", "선택", "벽 선택"],
          ["eraser", "지우기", "벽 삭제"],
          ["partial_eraser", "부분 지우기", "벽 일부 삭제"],
          ["hide", "숨기기", "3D 벽 숨기기"],
          ["none", "이동", "화면 이동"]
        ].map(([toolId, label, hint]) => (
          <button
            className={tool === toolId ? "active" : ""}
            key={toolId}
            onClick={() => {
              setTool(toolId as EditorTool);
              setPartialEraserSelectedWall(null);
              if (toolId !== "select") setSelectedWall(null);
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
          <button className="floor-plan-secondary" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} type="button">
            도면 등록
          </button>
          <button className="floor-plan-secondary" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} type="button">
            벽 자동 추출
          </button>
          <button className="floor-plan-secondary" onClick={() => setTool("scale")} type="button">
            축척
          </button>
          <span>{uploadStatus}</span>
        </div>

        {viewMode === "2d" ? (
          <div className="floor-plan-canvas-shell" ref={containerRef}>
            <canvas
              className="floor-plan-drawing-canvas"
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              ref={canvasRef}
            />
          </div>
        ) : (
          <RoomlogThreeFloorPlanView
            onWallPointerDown={handle3DWallPointerDown}
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
              setSelectedWall(null);
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
              setSelectedWall(null);
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
          <button className="floor-plan-primary" type="button">
            저장 초안
          </button>
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
            <dt>배율 조절</dt>
            <dd>{Math.round(viewScale * 100)}%</dd>
          </div>
          <div>
            <dt>축척</dt>
            <dd>{isScaleSet ? `1px=${pixelToMmRatio.toFixed(2)}mm` : "1px=20mm"}</dd>
          </div>
        </dl>

        {tool === "scale" ? (
          <div className="floor-plan-sim-preview">
            <span>축척 설정</span>
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
