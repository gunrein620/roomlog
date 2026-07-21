import type { WalkPoint } from "../walk/walk-collision";
import {
  cameraRelativeWalkDelta,
  combineWalkInput,
  type WalkAction
} from "../walk/walk-input";
import { isOrbitKeyboardInteractiveTarget } from "./orbit-keyboard-movement";

export const FURNITURE_MOVE_SPEED_METERS_PER_SECOND = 6;
export const FURNITURE_MAX_FRAME_DELTA_SECONDS = 0.1;

export type FurnitureInteractionMode = "explore" | "select" | "carry";
export type FurnitureShortcutAction =
  | "pickup-aimed"
  | "open-select"
  | "close-select"
  | "confirm"
  | "cancel";

export function resolveFurnitureShortcut(input: {
  aimedFurnitureId: string | null;
  code: string;
  mode: FurnitureInteractionMode;
  repeat: boolean;
  target: unknown;
}): FurnitureShortcutAction | null {
  if (input.repeat || isOrbitKeyboardInteractiveTarget(input.target)) return null;
  if (input.code === "KeyE" && input.mode === "explore") {
    return input.aimedFurnitureId ? "pickup-aimed" : "open-select";
  }
  if ((input.code === "KeyE" || input.code === "Escape") && input.mode === "select") {
    return "close-select";
  }
  if (input.code === "KeyQ" && input.mode === "carry") return "confirm";
  if (input.code === "Escape" && input.mode === "carry") return "cancel";
  return null;
}

export function furnitureFirstPersonMovementDelta(
  keys: ReadonlySet<WalkAction>,
  forward: WalkPoint,
  frameDeltaSeconds: number
): WalkPoint {
  const input = combineWalkInput(keys, null);
  const distance = FURNITURE_MOVE_SPEED_METERS_PER_SECOND
    * Math.min(Math.max(frameDeltaSeconds, 0), FURNITURE_MAX_FRAME_DELTA_SECONDS);
  return cameraRelativeWalkDelta(input, forward, distance);
}
