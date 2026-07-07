import type { SplatClipBox } from "./splat-clip";

export type TourCameraVector3 = readonly [number, number, number];

export interface TourCameraRigLimits {
  distance: number;
  minDistance: number;
  maxDistance: number;
  polarAngle: number;
  minPolarAngle: number;
  maxPolarAngle: number;
}

export interface TourCameraRigOptions {
  dollyRangeMeters?: number;
  minCameraDistance?: number;
  polarRangeRadians?: number;
  horizonEpsilonRadians?: number;
}

export const TOUR_CAMERA_DOLLY_RANGE_METERS = 0.5;
export const TOUR_CAMERA_MIN_DISTANCE_METERS = 0.1;
export const TOUR_CAMERA_POLAR_RANGE_RADIANS = (25 * Math.PI) / 180;
export const TOUR_CAMERA_HORIZON_EPSILON_RADIANS = 0.02;

const MIN_POLAR_ANGLE_RADIANS = 0.02;
const MIN_POLAR_WINDOW_RADIANS = 0.01;
const MIN_DISTANCE_WINDOW_METERS = 0.01;

export function calculateTourCameraDistance(position: TourCameraVector3, target: TourCameraVector3): number {
  return Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
}

export function calculateTourCameraPolarAngle(position: TourCameraVector3, target: TourCameraVector3): number {
  const distance = calculateTourCameraDistance(position, target);
  if (distance <= Number.EPSILON) return Math.PI / 2;

  const normalizedY = clamp((position[1] - target[1]) / distance, -1, 1);
  return Math.acos(normalizedY);
}

export function calculateTourCameraRigLimits(
  position: TourCameraVector3,
  target: TourCameraVector3,
  options: TourCameraRigOptions = {}
): TourCameraRigLimits {
  const dollyRangeMeters = options.dollyRangeMeters ?? TOUR_CAMERA_DOLLY_RANGE_METERS;
  const minCameraDistance = options.minCameraDistance ?? TOUR_CAMERA_MIN_DISTANCE_METERS;
  const polarRangeRadians = options.polarRangeRadians ?? TOUR_CAMERA_POLAR_RANGE_RADIANS;
  const horizonMaxPolarAngle = Math.PI / 2 - (options.horizonEpsilonRadians ?? TOUR_CAMERA_HORIZON_EPSILON_RADIANS);

  const distance = calculateTourCameraDistance(position, target);
  const polarAngle = calculateTourCameraPolarAngle(position, target);
  const maxPolarAngle = clamp(
    polarAngle + polarRangeRadians,
    MIN_POLAR_ANGLE_RADIANS + MIN_POLAR_WINDOW_RADIANS,
    horizonMaxPolarAngle
  );
  const minPolarAngle = clamp(
    polarAngle - polarRangeRadians,
    MIN_POLAR_ANGLE_RADIANS,
    maxPolarAngle - MIN_POLAR_WINDOW_RADIANS
  );

  return {
    distance,
    minDistance: Math.max(minCameraDistance, distance - dollyRangeMeters),
    maxDistance: Math.max(minCameraDistance + MIN_DISTANCE_WINDOW_METERS, distance + dollyRangeMeters),
    polarAngle,
    minPolarAngle,
    maxPolarAngle
  };
}

export function clampTourCameraPositionToClipBox(
  position: TourCameraVector3,
  box: SplatClipBox
): [number, number, number] {
  return [
    clamp(position[0], box.min.x, box.max.x),
    clamp(position[1], box.min.y, box.max.y),
    clamp(position[2], box.min.z, box.max.z)
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
