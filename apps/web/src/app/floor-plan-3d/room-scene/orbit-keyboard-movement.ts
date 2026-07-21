import type { WalkPoint } from "../walk/walk-collision";
import {
  cameraRelativeWalkDelta,
  combineWalkInput,
  type WalkAction
} from "../walk/walk-input";

export const ORBIT_MOVE_SPEED_METERS_PER_SECOND = 3;
export const ORBIT_MAX_FRAME_DELTA_SECONDS = 0.1;

type OrbitKeyboardTarget = {
  closest?: (selector: string) => unknown;
  isContentEditable?: boolean;
  tagName?: string;
};

const INTERACTIVE_TAG_NAMES = new Set(["a", "button", "input", "select", "textarea"]);

export function isOrbitKeyboardInteractiveTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;

  const element = target as OrbitKeyboardTarget;
  const tagName = element.tagName?.toLowerCase();
  return Boolean(
    (tagName && INTERACTIVE_TAG_NAMES.has(tagName))
    || element.isContentEditable
    || element.closest?.("[contenteditable='true'], [contenteditable='']")
  );
}

export function orbitKeyboardMovementDelta(
  keys: ReadonlySet<WalkAction>,
  forward: WalkPoint,
  frameDeltaSeconds: number
): WalkPoint {
  const input = combineWalkInput(keys, null);
  const distance = ORBIT_MOVE_SPEED_METERS_PER_SECOND
    * Math.min(Math.max(frameDeltaSeconds, 0), ORBIT_MAX_FRAME_DELTA_SECONDS);
  return cameraRelativeWalkDelta(input, forward, distance);
}
