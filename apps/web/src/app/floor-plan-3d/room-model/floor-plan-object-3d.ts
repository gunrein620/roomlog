// 도면 객체를 wheretoput 3D 벽과 같은 좌표계로 변환한다.
// plan-extraction 타입 import 금지 규칙 때문에 필요한 구조만 받는다.

import type { FloorPlanObject3D, Point, Wall } from "./types";
import { DEFAULT_PIXEL_TO_MM_RATIO, WHERETOPUT_WALL_HEIGHT_M } from "./units";

type ObjectLike = {
  category: "opening" | "fixture" | "structure";
  center: Point;
  id: string;
  label?: string;
  rotationDeg: number;
  size: { height: number; width: number };
  status?: string;
  type: string;
};

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function wallCenterOffset(walls: readonly Wall[], pixelToMmRatio: number) {
  if (!walls.length) return { x: 0, z: 0 };
  const centers = walls.map((wall) => ({
    x: (((wall.start.x + wall.end.x) / 2) * pixelToMmRatio) / 1000,
    z: (((wall.start.y + wall.end.y) / 2) * pixelToMmRatio) / 1000
  }));

  return {
    x: centers.reduce((sum, center) => sum + center.x, 0) / centers.length,
    z: centers.reduce((sum, center) => sum + center.z, 0) / centers.length
  };
}

function objectHeightMeters(object: ObjectLike) {
  if (object.type === "window" || object.type === "balconyWindow") return 1.2;
  if (object.type === "column") return WHERETOPUT_WALL_HEIGHT_M;
  if (object.category === "opening") return 2;
  if (object.type === "stairs") return 0.4;

  return 0.85;
}

function objectYPosition(object: ObjectLike, height: number) {
  if (object.type === "window" || object.type === "balconyWindow") return 0.9 + height / 2;

  return height / 2;
}

function objectDepthMeters(object: ObjectLike, pixelToMmRatio: number) {
  if (object.category === "opening") return 0.08;
  if (object.type === "column") return Math.max(0.12, (object.size.height * pixelToMmRatio) / 1000);

  return Math.max(0.12, (object.size.height * pixelToMmRatio) / 1000);
}

function objectColor(object: ObjectLike) {
  if (object.type === "window" || object.type === "balconyWindow") return "#7ec8ff";
  if (object.category === "opening") return "#b08968";
  if (object.category === "structure") return "#4a4a52";

  return "#9aa3b2";
}

export function convertFloorPlanObjectsTo3D(
  objects: readonly ObjectLike[],
  walls: readonly Wall[],
  options: { pixelToMmRatio?: number } = {}
): FloorPlanObject3D[] {
  const pixelToMmRatio = options.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO;
  const offset = wallCenterOffset(walls, pixelToMmRatio);

  return objects
    .filter((object) => object.status !== "REJECTED")
    .map((object) => {
      const height = objectHeightMeters(object);
      const width = Math.max(0.08, (object.size.width * pixelToMmRatio) / 1000);
      const depth = objectDepthMeters(object, pixelToMmRatio);
      const x = (object.center.x * pixelToMmRatio) / 1000 - offset.x;
      const z = (object.center.y * pixelToMmRatio) / 1000 - offset.z;

      return {
        category: object.category,
        color: objectColor(object),
        id: object.id,
        label: object.label,
        position: [roundMetric(x), roundMetric(objectYPosition(object, height)), roundMetric(z)],
        rotation: [0, roundMetric((object.rotationDeg * Math.PI) / 180), 0],
        size: {
          depth: roundMetric(depth),
          height: roundMetric(height),
          width: roundMetric(width)
        },
        type: object.type
      };
    });
}
