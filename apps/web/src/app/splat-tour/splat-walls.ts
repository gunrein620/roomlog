import { SPLAT_CLIP_ROOM } from "./splat-clip";
import type { SplatClipPoint, SplatClipRoom } from "./splat-clip";

export const WALL_CLIP_INSET_METERS = 0.12;
export const WALL_CLIP_FLOOR_BAND_METERS = 0.1;
export const WALL_CLIP_CEILING_MARGIN_METERS = 0.3;

export interface WallPanelSpec {
  key: string;
  position: [number, number, number];
  rotationY: number;
  width: number;
  height: number;
}

export function isWallShellPoint(
  point: SplatClipPoint,
  room: SplatClipRoom = SPLAT_CLIP_ROOM
): boolean {
  const insideWallShell =
    Math.abs(point.x) > room.width / 2 - WALL_CLIP_INSET_METERS ||
    Math.abs(point.z) > room.depth / 2 - WALL_CLIP_INSET_METERS;
  const insideWallHeight =
    point.y > WALL_CLIP_FLOOR_BAND_METERS &&
    point.y < room.height + WALL_CLIP_CEILING_MARGIN_METERS;

  return insideWallShell && insideWallHeight;
}

export function readWallReplaceParam(search: string): boolean | undefined {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawValue = params.get("splatWalls");

  if (rawValue === null) return undefined;

  const value = rawValue.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;

  return undefined;
}

export function resolveWallReplace(search: string, fallback: boolean): boolean {
  return readWallReplaceParam(search) ?? fallback;
}

export function createWallPanels(room: SplatClipRoom = SPLAT_CLIP_ROOM): WallPanelSpec[] {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;
  const halfHeight = room.height / 2;

  return [
    {
      key: "north",
      position: [0, halfHeight, -halfDepth],
      rotationY: 0,
      width: room.width,
      height: room.height
    },
    {
      key: "south",
      position: [0, halfHeight, halfDepth],
      rotationY: Math.PI,
      width: room.width,
      height: room.height
    },
    {
      key: "west",
      position: [-halfWidth, halfHeight, 0],
      rotationY: Math.PI / 2,
      width: room.depth,
      height: room.height
    },
    {
      key: "east",
      position: [halfWidth, halfHeight, 0],
      rotationY: -Math.PI / 2,
      width: room.depth,
      height: room.height
    }
  ];
}
