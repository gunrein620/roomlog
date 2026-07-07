import type { TourPreset } from "./tour-types";

// 약 3m(가로) × 4m(세로) 원룸을 가정한 더미 시점.
// 좌표계: x=가로, y=위(눈높이 1.5m), z=세로. 바닥 중앙이 원점.
// 현관은 +z 벽(z=+2), 창가는 -z 벽(z=-2)에 있다고 가정.
export const DEMO_PRESETS: TourPreset[] = [
  {
    id: "entrance",
    label: "현관",
    camera: { position: [0.6, 1.5, 1.5], target: [0, 1.4, -0.5] },
    minimap: { x: 62, y: 84 }
  },
  {
    id: "center",
    label: "방 중앙",
    camera: { position: [0, 1.5, 0.2], target: [0, 1.4, -2] },
    minimap: { x: 50, y: 50 }
  },
  {
    id: "window",
    label: "창가",
    camera: { position: [0, 1.5, -1.2], target: [0, 1.35, -2] },
    minimap: { x: 48, y: 16 }
  }
];
