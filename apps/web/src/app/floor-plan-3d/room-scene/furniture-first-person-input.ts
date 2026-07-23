import { combineWalkInput, type WalkAction } from "../walk/walk-input";
import { isOrbitKeyboardInteractiveTarget } from "./orbit-keyboard-movement";

// 6m/s는 방 안에서 너무 빨랐다 — 25% 감속(사용자 피드백).
export const FURNITURE_MOVE_SPEED_METERS_PER_SECOND = 4.5;
export const FURNITURE_MAX_FRAME_DELTA_SECONDS = 0.1;
/** Q/E 섬세(연속) 회전 속도 — 초당 90도. */
export const FURNITURE_ROTATE_SPEED_RADIANS_PER_SECOND = Math.PI / 2;

export type FurnitureFlyPoint = { x: number; y: number; z: number };

export type FurnitureInteractionMode = "explore" | "select" | "carry";
export type FurnitureShortcutAction =
  | "pickup-aimed"
  | "open-select"
  | "close-select"
  | "rotate-left"
  | "rotate-right"
  | "cancel"
  | "remove";

export function resolveFurnitureShortcut(input: {
  aimedFurnitureId: string | null;
  code: string;
  mode: FurnitureInteractionMode;
  repeat: boolean;
  target: unknown;
}): FurnitureShortcutAction | null {
  if (input.repeat || isOrbitKeyboardInteractiveTarget(input.target)) return null;
  if (input.code === "KeyE" && input.mode === "explore") {
    return input.aimedFurnitureId ? "pickup-aimed" : null;
  }
  if ((input.code === "Digit2" || input.code === "Numpad2") && input.mode !== "select") {
    return "open-select";
  }
  if ((input.code === "Digit2" || input.code === "Numpad2" || input.code === "Escape") && input.mode === "select") {
    return "close-select";
  }
  if ((input.code === "Digit1" || input.code === "Numpad1") && input.mode === "carry") return "rotate-left";
  if ((input.code === "Digit3" || input.code === "Numpad3") && input.mode === "carry") return "rotate-right";
  // Q는 더 이상 배치 고정이 아니다 — 고정은 좌클릭, Q/E는 섬세 회전(fineRotateKeyDirection).
  if (input.code === "KeyR" && input.mode === "carry") return "remove";
  if (input.code === "Escape" && input.mode === "carry") return "cancel";
  return null;
}

/** Q/E 섬세(연속) 회전 키의 방향 — Q=왼쪽, E=오른쪽. 운반(carry) 중에만 적용한다. */
export function fineRotateKeyDirection(code: string): -1 | 1 | null {
  if (code === "KeyQ") return -1;
  if (code === "KeyE") return 1;
  return null;
}

// 자유시점(비행) 이동 — W/S는 바라보는 방향 그대로(위를 보고 전진하면 위로 상승),
// A/D는 수평 스트레이프. 걷기 모드처럼 XZ 평면에 눌러 붙이지 않는다.
export function furnitureFlyMovementDelta(
  keys: ReadonlySet<WalkAction>,
  forward: FurnitureFlyPoint,
  frameDeltaSeconds: number
): FurnitureFlyPoint {
  const input = combineWalkInput(keys, null);
  const distance = FURNITURE_MOVE_SPEED_METERS_PER_SECOND
    * Math.min(Math.max(frameDeltaSeconds, 0), FURNITURE_MAX_FRAME_DELTA_SECONDS);
  const forwardLength = Math.hypot(forward.x, forward.y, forward.z);
  const direction = forwardLength > Number.EPSILON
    ? { x: forward.x / forwardLength, y: forward.y / forwardLength, z: forward.z / forwardLength }
    : { x: 0, y: 0, z: -1 };
  const horizontalLength = Math.hypot(forward.x, forward.z);
  const horizontal = horizontalLength > Number.EPSILON
    ? { x: forward.x / horizontalLength, z: forward.z / horizontalLength }
    : { x: 0, z: -1 };
  const right = { x: -horizontal.z, z: horizontal.x };
  let x = direction.x * input.forward + right.x * input.strafe;
  let y = direction.y * input.forward;
  let z = direction.z * input.forward + right.z * input.strafe;
  const inputLength = Math.hypot(x, y, z);

  if (inputLength > 1) {
    x /= inputLength;
    y /= inputLength;
    z /= inputLength;
  }

  return { x: x * distance, y: y * distance, z: z * distance };
}
