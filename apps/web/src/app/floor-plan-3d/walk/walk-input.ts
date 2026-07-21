import type { WalkPoint } from "./walk-collision";

export type WalkAction = "forward" | "backward" | "left" | "right";
export type WalkInput = { forward: number; strafe: number };

export function resolveWalkInputCode(code: string): WalkAction | null {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      return "forward";
    case "KeyS":
    case "ArrowDown":
      return "backward";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

export function combineWalkInput(keys: ReadonlySet<WalkAction>, analogue: WalkInput | null): WalkInput {
  return {
    forward: (keys.has("forward") ? 1 : 0) - (keys.has("backward") ? 1 : 0) + (analogue?.forward ?? 0),
    strafe: (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0) + (analogue?.strafe ?? 0)
  };
}

export function cameraRelativeWalkDelta(input: WalkInput, forward: WalkPoint, distance: number): WalkPoint {
  const forwardLength = Math.hypot(forward.x, forward.z);
  const normalizedForward = forwardLength > Number.EPSILON
    ? { x: forward.x / forwardLength, z: forward.z / forwardLength }
    : { x: 0, z: -1 };
  const right = { x: -normalizedForward.z, z: normalizedForward.x };
  let x = normalizedForward.x * input.forward + right.x * input.strafe;
  let z = normalizedForward.z * input.forward + right.z * input.strafe;
  const inputLength = Math.hypot(x, z);

  if (inputLength > 1) {
    x /= inputLength;
    z /= inputLength;
  }

  return { x: x * distance, z: z * distance };
}
