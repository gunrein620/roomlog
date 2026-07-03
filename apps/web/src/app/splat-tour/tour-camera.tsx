"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei/core/CameraControls.js";
import { useEffect, useRef } from "react";
import type { ComponentRef } from "react";
import { calculateTourCameraRigLimits } from "./tour-camera-math";
import type { TourCameraRigLimits } from "./tour-camera-math";
import type { TourPreset } from "./tour-types";

const TRANSITION_SMOOTH_TIME_SECONDS = 0.45;
const DRAGGING_SMOOTH_TIME_SECONDS = 0.08;
const REST_THRESHOLD = 0.002;

type TourCameraControls = NonNullable<ComponentRef<typeof CameraControls>>;

export function TourCamera({
  presets,
  activeId,
  onArrive
}: {
  presets: TourPreset[];
  activeId: string;
  onArrive?: (id: string) => void;
}) {
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const transitionTokenRef = useRef(0);

  useEffect(() => {
    const preset = presets.find((item) => item.id === activeId);
    const controls = controlsRef.current;
    if (!preset || !controls) return;

    const limits = calculateTourCameraRigLimits(preset.camera.position, preset.camera.target);
    const transitionToken = transitionTokenRef.current + 1;
    transitionTokenRef.current = transitionToken;

    configureControls(controls, limits);

    // During scripted preset moves, user input is ignored. A newer activeId cancels the arrival callback
    // for this move, then starts its own transition from the camera's current interpolated position.
    controls.enabled = false;
    controls.cancel();
    void controls.setFocalOffset(0, 0, 0, false);

    controls
      .setLookAt(
        preset.camera.position[0],
        preset.camera.position[1],
        preset.camera.position[2],
        preset.camera.target[0],
        preset.camera.target[1],
        preset.camera.target[2],
        true
      )
      .then(() => {
        if (transitionTokenRef.current !== transitionToken) return;

        configureControls(controls, limits);
        controls.enabled = true;
        onArrive?.(preset.id);
      })
      .catch(() => {
        if (transitionTokenRef.current === transitionToken) {
          controls.enabled = true;
        }
      });

    return () => {
      transitionTokenRef.current += 1;
    };
  }, [activeId, onArrive, presets]);

  return <CameraControls makeDefault ref={controlsRef} />;
}

function configureControls(controls: TourCameraControls, limits: TourCameraRigLimits) {
  const { ACTION } = CameraControlsImpl;

  controls.smoothTime = TRANSITION_SMOOTH_TIME_SECONDS;
  controls.draggingSmoothTime = DRAGGING_SMOOTH_TIME_SECONDS;
  controls.restThreshold = REST_THRESHOLD;
  controls.infinityDolly = false;
  controls.dollyToCursor = false;
  controls.dragToOffset = false;
  controls.truckSpeed = 0;

  controls.minDistance = limits.minDistance;
  controls.maxDistance = limits.maxDistance;
  controls.minPolarAngle = limits.minPolarAngle;
  controls.maxPolarAngle = limits.maxPolarAngle;

  controls.mouseButtons.left = ACTION.ROTATE;
  controls.mouseButtons.middle = ACTION.DOLLY;
  controls.mouseButtons.right = ACTION.NONE;
  controls.mouseButtons.wheel = ACTION.DOLLY;

  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.TOUCH_DOLLY_ROTATE;
  controls.touches.three = ACTION.NONE;
}
