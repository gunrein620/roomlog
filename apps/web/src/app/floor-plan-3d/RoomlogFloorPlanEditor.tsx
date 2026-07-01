"use client";

import { useMemo, useRef, useState } from "react";
import {
  createStarterWalls,
  createWall,
  createWallsFromRegisteredPlan,
  convertWallsTo3D,
  convertWallsToWheretoputSimulator,
  findNearestWall,
  removeWall,
  snapToGrid,
  summarizeWalls
} from "./floor-plan-editor-model.mjs";

type EditorTool = "wall" | "select" | "eraser";
type ViewMode = "2d" | "3d";
type Point = { x: number; y: number };
type Wall = { id: string; start: Point; end: Point };
type WallSummary = { wallCount: number; approximateMeters: number; status: "초안" | "편집중" };
type RegisteredPlan = {
  dataUrl?: string;
  height: number;
  name: string;
  source: "image" | "json";
  width: number;
};
type ViewerRotation = { yaw: number; pitch: number };
type ViewerDrag = ViewerRotation & { pointerId: number; x: number; y: number };
type ConvertedFloorPlan3D = {
  wallPanels: Array<{
    id: string;
    path: string;
    topLine: { start: Point; end: Point };
  }>;
  floor: { path: string };
};
type WheretoputWall = {
  dimensions: { width: number; height: number; depth: number };
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

const tools: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: "wall", label: "벽", hint: "드래그해서 수평/수직 벽 생성" },
  { id: "select", label: "선택", hint: "가까운 벽 선택" },
  { id: "eraser", label: "지우개", hint: "가까운 벽 삭제" }
];

function toSvgPoint(event: React.PointerEvent<SVGSVGElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * 960,
    y: ((event.clientY - rect.top) / rect.height) * 620
  };
}

function getStarterWalls(): Wall[] {
  return createStarterWalls() as Wall[];
}

function buildWall(start: Point, end: Point, id: string): Wall | null {
  return createWall(start, end, id) as Wall | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseUploadedJsonWalls(source: unknown): Wall[] {
  if (!source || typeof source !== "object" || !("walls" in source)) return [];

  const walls = (source as { walls?: unknown }).walls;
  if (!Array.isArray(walls)) return [];

  return walls
    .map((wall, index) => {
      if (!wall || typeof wall !== "object") return null;
      const candidate = wall as { end?: Point; id?: string; start?: Point };
      if (!candidate.start || !candidate.end) return null;
      return createWall(candidate.start, candidate.end, candidate.id ?? `json-wall-${index + 1}`) as Wall | null;
    })
    .filter((wall): wall is Wall => Boolean(wall));
}

export default function RoomlogFloorPlanEditor() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tool, setTool] = useState<EditorTool>("wall");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [walls, setWalls] = useState<Wall[]>(() => getStarterWalls());
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftWall, setDraftWall] = useState<Wall | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [registeredPlan, setRegisteredPlan] = useState<RegisteredPlan | null>(null);
  const [uploadStatus, setUploadStatus] = useState("샘플 도면으로 시작");
  const [viewerRotation, setViewerRotation] = useState<ViewerRotation>({ yaw: -0.55, pitch: 1 });
  const [viewerDrag, setViewerDrag] = useState<ViewerDrag | null>(null);
  const summary = useMemo(() => summarizeWalls(walls) as WallSummary, [walls]);
  const convertedFloorPlan = useMemo(
    () =>
      convertWallsTo3D(walls, {
        height: 112,
        depth: 10,
        camera: viewerRotation
      }) as ConvertedFloorPlan3D,
    [walls, viewerRotation]
  );
  const wheretoputWalls = useMemo(
    () => convertWallsToWheretoputSimulator(walls) as WheretoputWall[],
    [walls]
  );

  const selectedWall = walls.find((wall) => wall.id === selectedWallId) ?? null;

  function resetTransientState() {
    setDraftStart(null);
    setDraftWall(null);
  }

  function extractWallsFromRegisteredPlan() {
    if (!registeredPlan) return;
    const extractedWalls = createWallsFromRegisteredPlan(registeredPlan) as Wall[];
    setWalls(extractedWalls);
    setSelectedWallId(null);
    setUploadStatus(`${registeredPlan.name} 벽 자동 추출 완료`);
  }

  function convertTo3D() {
    if (registeredPlan && walls.length === 0) {
      setWalls(createWallsFromRegisteredPlan(registeredPlan) as Wall[]);
    }
    resetTransientState();
    setViewMode((currentMode) => (currentMode === "2d" ? "3d" : "2d"));
  }

  function handlePlanUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    if (file.type === "application/json" || file.name.endsWith(".json")) {
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const parsedWalls = parseUploadedJsonWalls(parsed);
          setRegisteredPlan({ height: 620, name: file.name, source: "json", width: 960 });
          if (parsedWalls.length > 0) {
            setWalls(parsedWalls);
            setUploadStatus(`${file.name} JSON 벽 ${parsedWalls.length}개 등록`);
          } else {
            setUploadStatus(`${file.name} 등록됨 - 벽 자동 추출을 눌러주세요`);
          }
        } catch {
          setUploadStatus("JSON 도면을 읽지 못했습니다");
        }
      };
      reader.readAsText(file);
      return;
    }

    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => {
        setRegisteredPlan({
          dataUrl,
          height: image.naturalHeight || 900,
          name: file.name,
          source: "image",
          width: image.naturalWidth || 1280
        });
        setUploadStatus(`${file.name} 도면 등록 완료`);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toSvgPoint(event);

    if (viewMode === "3d") return;

    if (tool === "wall") {
      const snappedPoint = snapToGrid(point);
      setDraftStart(snappedPoint);
      setDraftWall({ id: "draft", start: snappedPoint, end: snappedPoint });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const nearestWall = findNearestWall(walls, point, 22) as Wall | null;

    if (tool === "select") {
      setSelectedWallId(nearestWall?.id ?? null);
      return;
    }

    if (tool === "eraser" && nearestWall) {
      setWalls((currentWalls) => removeWall(currentWalls, nearestWall.id));
      if (selectedWallId === nearestWall.id) {
        setSelectedWallId(null);
      }
    }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!draftStart || tool !== "wall") return;

    const nextDraftWall = buildWall(draftStart, toSvgPoint(event), "draft");
    setDraftWall(nextDraftWall);
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!draftStart || tool !== "wall") return;

    const nextWall = buildWall(draftStart, toSvgPoint(event), `wall-${Date.now()}`);
    if (nextWall) {
      setWalls((currentWalls) => [...currentWalls, nextWall]);
      setSelectedWallId(nextWall.id);
    }
    resetTransientState();
  }

  function handleViewerPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setViewerDrag({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ...viewerRotation
    });
  }

  function handleViewerPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!viewerDrag || viewerDrag.pointerId !== event.pointerId) return;

    setViewerRotation({
      yaw: viewerDrag.yaw + (event.clientX - viewerDrag.x) * 0.01,
      pitch: clamp(viewerDrag.pitch + (event.clientY - viewerDrag.y) * 0.006, 0.55, 1.45)
    });
  }

  function handleViewerPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (viewerDrag?.pointerId === event.pointerId) {
      setViewerDrag(null);
    }
  }

  return (
    <section className="floor-plan-editor" aria-label="Roomlog 3D 도면 편집기">
      <aside className="floor-plan-toolbar" aria-label="도면 도구">
        {tools.map((currentTool) => (
          <button
            className={tool === currentTool.id ? "active" : ""}
            data-tool={currentTool.id}
            key={currentTool.id}
            onClick={() => {
              setTool(currentTool.id);
              resetTransientState();
            }}
            title={currentTool.hint}
            type="button"
          >
            <strong>{currentTool.label}</strong>
            <span>{currentTool.hint}</span>
          </button>
        ))}
      </aside>

      <section className="floor-plan-canvas" aria-label="도면 캔버스">
        <div className="floor-plan-upload-row">
          <input
            accept="image/*,.json"
            className="floor-plan-file-input"
            onChange={handlePlanUpload}
            ref={fileInputRef}
            type="file"
          />
          <button className="floor-plan-secondary" onClick={() => fileInputRef.current?.click()} type="button">
            도면 등록
          </button>
          <button
            className="floor-plan-secondary"
            disabled={!registeredPlan}
            onClick={extractWallsFromRegisteredPlan}
            type="button"
          >
            벽 자동 추출
          </button>
          <span>{uploadStatus}</span>
        </div>

        {viewMode === "2d" ? (
          <svg
            className="floor-plan-svg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            role="img"
            viewBox="0 0 960 620"
          >
            <defs>
              <pattern id="roomlog-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" />
              </pattern>
            </defs>
            <rect className="floor-svg-grid" width="960" height="620" />
            {registeredPlan?.dataUrl ? (
              <image
                className="floor-plan-blueprint"
                href={registeredPlan.dataUrl}
                height="520"
                preserveAspectRatio="xMidYMid meet"
                width="860"
                x="50"
                y="50"
              />
            ) : null}
            {[...walls, ...(draftWall ? [draftWall] : [])].map((wall) => (
              <line
                className={`floor-svg-wall${wall.id === selectedWallId ? " selected" : ""}${
                  wall.id === "draft" ? " draft" : ""
                }`}
                key={wall.id}
                x1={wall.start.x}
                x2={wall.end.x}
                y1={wall.start.y}
                y2={wall.end.y}
              />
            ))}
          </svg>
        ) : (
          <svg
            aria-label="화면 드래그 회전 3D 도면"
            className="floor-plan-svg floor-plan-3d-preview"
            onPointerDown={handleViewerPointerDown}
            onPointerMove={handleViewerPointerMove}
            onPointerUp={handleViewerPointerUp}
            role="img"
            viewBox="0 0 960 620"
          >
            <defs>
              <linearGradient id="roomlog-wall-face" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#f8fbff" />
                <stop offset="100%" stopColor="#b9c6dc" />
              </linearGradient>
            </defs>
            <path className="floor-3d-plane" d={convertedFloorPlan.floor.path} />
            {convertedFloorPlan.wallPanels.map((panel) => (
              <g key={panel.id}>
                <path className="floor-3d-wall-panel" d={panel.path} />
                <line
                  className="floor-3d-wall-top"
                  x1={panel.topLine.start.x}
                  x2={panel.topLine.end.x}
                  y1={panel.topLine.start.y}
                  y2={panel.topLine.end.y}
                />
              </g>
            ))}
            <text className="floor-3d-hint" x="26" y="42">
              화면 드래그 회전
            </text>
          </svg>
        )}
        <div className="floor-plan-actions">
          <button
            className="floor-plan-secondary"
            onClick={() => {
              setWalls([]);
              setSelectedWallId(null);
              resetTransientState();
            }}
            type="button"
          >
            전체 지우기
          </button>
          <button
            className="floor-plan-secondary"
            onClick={() => {
              setWalls(getStarterWalls());
              setSelectedWallId(null);
              resetTransientState();
              setUploadStatus("샘플 도면 복원");
            }}
            type="button"
          >
            샘플 복원
          </button>
          <button
            className={viewMode === "3d" ? "floor-plan-primary" : "floor-plan-secondary"}
            onClick={convertTo3D}
            type="button"
          >
            {viewMode === "2d" ? "3D 변환" : "2D 편집"}
          </button>
          <button
            className="floor-plan-secondary"
            onClick={() => setViewerRotation({ yaw: -0.55, pitch: 1 })}
            type="button"
          >
            회전 초기화
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
            <dt>등록 도면</dt>
            <dd>{registeredPlan ? registeredPlan.name : "없음"}</dd>
          </div>
          <div>
            <dt>3D 벽 데이터</dt>
            <dd>{wheretoputWalls.length}개</dd>
          </div>
          <div>
            <dt>선택 벽</dt>
            <dd>{selectedWall ? selectedWall.id.replace("starter-", "") : "없음"}</dd>
          </div>
        </dl>
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
