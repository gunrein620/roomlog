"use client";

import { useMemo, useState } from "react";
import {
  createStarterWalls,
  createWall,
  findNearestWall,
  removeWall,
  snapToGrid,
  summarizeWalls
} from "./floor-plan-editor-model.mjs";

type EditorTool = "wall" | "select" | "eraser";
type Point = { x: number; y: number };
type Wall = { id: string; start: Point; end: Point };
type WallSummary = { wallCount: number; approximateMeters: number; status: "초안" | "편집중" };

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

export default function RoomlogFloorPlanEditor() {
  const [tool, setTool] = useState<EditorTool>("wall");
  const [walls, setWalls] = useState<Wall[]>(() => getStarterWalls());
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftWall, setDraftWall] = useState<Wall | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const summary = useMemo(() => summarizeWalls(walls) as WallSummary, [walls]);

  const selectedWall = walls.find((wall) => wall.id === selectedWallId) ?? null;

  function resetTransientState() {
    setDraftStart(null);
    setDraftWall(null);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toSvgPoint(event);

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
            }}
            type="button"
          >
            샘플 복원
          </button>
          <button className="floor-plan-primary" type="button">
            저장 초안
          </button>
        </div>
      </section>

      <aside className="floor-plan-sidepanel" aria-label="도면 정보">
        <div>
          <span>123123 FloorPlanEditor 코어</span>
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
            <dd>{summary.status}</dd>
          </div>
          <div>
            <dt>선택 벽</dt>
            <dd>{selectedWall ? selectedWall.id.replace("starter-", "") : "없음"}</dd>
          </div>
        </dl>
        <a href="/">마이페이지</a>
      </aside>
    </section>
  );
}
