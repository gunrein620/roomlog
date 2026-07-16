"use client";

import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { TenantFurniture, TenantFurniturePlacementItem } from "@roomlog/types/tenant-furniture";
import type { WheretoputWall3D } from "@/app/floor-plan-3d/room-model/types";
import type { PlacementAnalysis } from "./placement-model";
import styles from "../../furniture.module.css";

type DragState = { furnitureId: string; offsetX: number; offsetZ: number };

function viewBoxForWalls(walls: readonly WheretoputWall3D[]) {
  const corners = walls.flatMap((wall) => {
    const halfWidth = wall.dimensions.width / 2;
    const halfDepth = wall.dimensions.depth / 2;
    const cos = Math.cos(wall.rotation[1]);
    const sin = Math.sin(wall.rotation[1]);
    return [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth]
    ].map(([x, z]) => ({
      x: wall.position[0] + x * cos - z * sin,
      z: wall.position[2] + x * sin + z * cos
    }));
  });
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minZ = Math.min(...corners.map((point) => point.z));
  const maxZ = Math.max(...corners.map((point) => point.z));
  const padding = Math.max(0.4, Math.max(maxX - minX, maxZ - minZ) * 0.08);

  return `${minX - padding} ${minZ - padding} ${maxX - minX + padding * 2} ${maxZ - minZ + padding * 2}`;
}

export function TopDownCanvas({
  analyses,
  furnitureById,
  items,
  onMove,
  onRotate,
  onSelect,
  selectedId,
  walls
}: {
  analyses: ReadonlyMap<string, PlacementAnalysis>;
  furnitureById: ReadonlyMap<string, TenantFurniture>;
  items: readonly TenantFurniturePlacementItem[];
  onMove: (furnitureId: string, position: [number, number]) => void;
  onRotate: (furnitureId: string) => void;
  onSelect: (furnitureId: string) => void;
  selectedId: string | null;
  walls: readonly WheretoputWall3D[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewBox = useMemo(() => viewBoxForWalls(walls), [walls]);

  function pointerToRoom(event: PointerEvent<SVGElement>) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, z: transformed.y };
  }

  function beginDrag(event: PointerEvent<SVGGElement>, item: TenantFurniturePlacementItem) {
    const point = pointerToRoom(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      furnitureId: item.furnitureId,
      offsetX: point.x - item.position[0],
      offsetZ: point.z - item.position[1]
    };
    onSelect(item.furnitureId);
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const point = pointerToRoom(event);
    if (!drag || !point) return;
    onMove(drag.furnitureId, [point.x - drag.offsetX, point.z - drag.offsetZ]);
  }

  function moveByKeyboard(event: KeyboardEvent<SVGGElement>, item: TenantFurniturePlacementItem) {
    const offsets: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-0.1, 0],
      ArrowRight: [0.1, 0],
      ArrowUp: [0, -0.1],
      ArrowDown: [0, 0.1]
    };
    const offset = offsets[event.key];
    if (offset) {
      event.preventDefault();
      onMove(item.furnitureId, [item.position[0] + offset[0], item.position[1] + offset[1]]);
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      onRotate(item.furnitureId);
    }
  }

  return (
    <div className={styles.canvasShell}>
      <svg
        ref={svgRef}
        className={styles.canvas}
        viewBox={viewBox}
        role="group"
        aria-label="매물 도면 위 가구 배치 캔버스"
        onPointerMove={moveDrag}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        <title>위에서 본 매물 도면과 내 가구 배치</title>
        {walls.map((wall) => (
          <rect
            key={wall.id}
            className={styles.wall}
            x={wall.position[0] - wall.dimensions.width / 2}
            y={wall.position[2] - wall.dimensions.depth / 2}
            width={wall.dimensions.width}
            height={wall.dimensions.depth}
            transform={`rotate(${wall.rotation[1] * 180 / Math.PI} ${wall.position[0]} ${wall.position[2]})`}
          />
        ))}
        {items.map((item, index) => {
          const furniture = furnitureById.get(item.furnitureId);
          const analysis = analyses.get(item.furnitureId);
          if (!furniture || !analysis) return null;
          const points = analysis.footprint.corners.map((point) => `${point.x},${point.z}`).join(" ");
          const invalid = analysis.touchesWall || analysis.overlapsFurniture;
          const status = analysis.touchesWall ? "벽에 걸림" : analysis.overlapsFurniture ? "다른 가구와 겹침" : "배치 가능";

          return (
            <g
              key={item.furnitureId}
              className={styles.furniture}
              data-invalid={invalid}
              data-selected={selectedId === item.furnitureId}
              role="button"
              tabIndex={0}
              aria-label={`${furniture.label || furniture.category}, ${status}. 방향키로 이동, R키로 회전`}
              onPointerDown={(event) => beginDrag(event, item)}
              onKeyDown={(event) => moveByKeyboard(event, item)}
              onFocus={() => onSelect(item.furnitureId)}
            >
              <polygon className={styles.furnitureShape} points={points} />
              <text
                className={styles.furnitureIndex}
                x={analysis.footprint.center.x}
                y={analysis.footprint.center.z}
                fontSize="0.28"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <p className={styles.canvasHint}>가구를 끌어 이동 · 선택 후 90° 회전</p>
    </div>
  );
}
