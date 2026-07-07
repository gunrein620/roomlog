"use client";

// 월드=도면 프레임(미터)이므로 벽 패널은 무변환 배치.
// splat 쪽이 정합 변환을 받는다(splat-scene.tsx tuningFromTransform).

import type { JSX } from "react";
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import type { SplatClipRoom } from "./splat-clip";
import { createWallPanels } from "./splat-walls";

type WallPanelSpec = ReturnType<typeof createWallPanels>[number];

/**
 * Canvas 안에서 도면 벽을 렌더. `walls`(실 FloorPlan.walls)가 있으면 벽마다 실제 치수·위치·
 * 회전으로 박스를 그리고, 없으면 기존 4면 플레이스홀더 평면(createWallPanels)으로 대체한다.
 * 인터랙션 없음.
 */
export function SplatPlanWalls({
  room,
  walls
}: {
  room?: SplatClipRoom;
  walls?: readonly WheretoputWall3D[];
}): JSX.Element {
  if (walls && walls.length > 0) {
    return (
      <group>
        {walls.map((wall) => (
          <mesh key={wall.id} position={wall.position} rotation={wall.rotation}>
            <boxGeometry args={[wall.dimensions.width, wall.dimensions.height, wall.dimensions.depth]} />
            <meshLambertMaterial color="#f2f1ec" />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      {createWallPanels(room).map((panel: WallPanelSpec) => (
        <mesh key={panel.key} position={panel.position} rotation={[0, panel.rotationY, 0]}>
          <planeGeometry args={[panel.width, panel.height]} />
          <meshLambertMaterial color="#f2f1ec" />
        </mesh>
      ))}
    </group>
  );
}
