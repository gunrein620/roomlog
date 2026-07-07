"use client";

// 월드=도면 프레임(미터)이므로 벽 패널은 무변환 배치.
// splat 쪽이 정합 변환을 받는다(splat-scene.tsx tuningFromTransform).

import type { JSX } from "react";
import type { SplatClipRoom } from "./splat-clip";
import { createWallPanels } from "./splat-walls";

type WallPanelSpec = ReturnType<typeof createWallPanels>[number];

/** Canvas 안에서 도면 벽 4면을 불투명 평면으로 렌더. 인터랙션 없음. */
export function SplatPlanWalls({ room }: { room?: SplatClipRoom }): JSX.Element {
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
