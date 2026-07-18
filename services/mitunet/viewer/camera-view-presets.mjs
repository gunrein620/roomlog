export const FIXED_CAMERA_VIEWS = Object.freeze([
  "perspective",
  "top",
  "front",
  "left",
  "right",
]);

const DIRECTIONS = Object.freeze({
  perspective: [0.55, 0.62, 0.85],
  top: [0, 1, 0.001],
  front: [0, 0.42, 1],
  left: [-1, 0.42, 0],
  right: [1, 0.42, 0],
});

export function cameraPresetPosition(view, center, distance) {
  const direction = DIRECTIONS[view];
  if (!direction) throw new RangeError(`Unknown camera view: ${view}`);
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError("Camera distance must be positive");
  }
  const length = Math.hypot(...direction);
  return {
    x: center.x + direction[0] / length * distance,
    y: center.y + direction[1] / length * distance,
    z: center.z + direction[2] / length * distance,
  };
}
