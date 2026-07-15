import type { MitunetFloorPlan, MitunetPolygon } from "@/lib/mitunet-floor-plan";

export type MitunetScenePolygon = {
  outer: [number, number][];
  holes: [number, number][][];
};

export type MitunetSceneLayout = {
  bounds: { centerX: number; centerZ: number; width: number; depth: number };
  wall: MitunetScenePolygon[];
  door: MitunetScenePolygon[];
  window: MitunetScenePolygon[];
};

const UNCALIBRATED_LONG_SIDE_METERS = 10;

export function createMitunetSceneLayout(plan: MitunetFloorPlan): MitunetSceneLayout {
  const [left, top, contentWidth, contentHeight] = plan.contentRect;
  const metresPerPixel = plan.millimetersPerPixel
    ? plan.millimetersPerPixel / 1_000
    : UNCALIBRATED_LONG_SIDE_METERS / Math.max(contentWidth, contentHeight);
  const centerPixelX = left + contentWidth / 2;
  const centerPixelZ = top + contentHeight / 2;

  const point = ([x, y]: [number, number]): [number, number] => [
    (x - centerPixelX) * metresPerPixel,
    (y - centerPixelZ) * metresPerPixel
  ];
  const polygon = (source: MitunetPolygon): MitunetScenePolygon => ({
    outer: source.outer.map(point),
    holes: source.holes.map((hole) => hole.map(point))
  });

  return {
    bounds: {
      centerX: 0,
      centerZ: 0,
      width: contentWidth * metresPerPixel,
      depth: contentHeight * metresPerPixel
    },
    wall: plan.polygons.wall.map(polygon),
    door: plan.polygons.door.map(polygon),
    window: plan.polygons.window.map(polygon)
  };
}
