"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei/core/CameraControls.js";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { ComponentRef } from "react";
import { Vector3 } from "three";
import { createRoomClipBox } from "./splat-clip";
import { calculateTourCameraRigLimits, clampTourCameraPositionToClipBox } from "./tour-camera-math";
import type { TourCameraRigLimits, TourCameraVector3 } from "./tour-camera-math";
import type { TourPreset } from "./tour-types";

const TRANSITION_SMOOTH_TIME_SECONDS = 0.45;
const DRAGGING_SMOOTH_TIME_SECONDS = 0.08;
const REST_THRESHOLD = 0.002;
const DEFAULT_DOLLY_SPEED = 1;
const WALK_EYE_HEIGHT_METERS = 1.45;
const WALK_SPEED_METERS_PER_SECOND = 1.5;
const VECTOR_EPSILON = 1e-6;

type TourCameraControls = NonNullable<ComponentRef<typeof CameraControls>>;
type WalkLookAt = { position: [number, number, number]; target: [number, number, number] };

export function TourCamera({
  presets,
  activeId,
  onArrive,
  walkMode = false
}: {
  presets: TourPreset[];
  activeId: string;
  onArrive?: (id: string) => void;
  walkMode?: boolean;
}) {
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const transitionTokenRef = useRef(0);
  const walkModeRef = useRef(walkMode);
  const walkKeysRef = useRef(new Set<string>());
  const walkAnchorRef = useRef<[number, number, number] | null>(null);
  const isScriptedTransitionRef = useRef(false);
  const framePositionRef = useRef(new Vector3());
  const frameTargetRef = useRef(new Vector3());
  const frameLookOffsetRef = useRef(new Vector3());
  const frameForwardRef = useRef(new Vector3());
  const frameRightRef = useRef(new Vector3());
  const frameMoveRef = useRef(new Vector3());
  const walkClipBox = useMemo(() => createRoomClipBox(), []);

  useEffect(() => {
    walkModeRef.current = walkMode;

    if (!walkMode) {
      walkKeysRef.current.clear();
    }
  }, [walkMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!walkModeRef.current || shouldIgnoreKeyboardEvent(event)) return;

      const inputCode = resolveWalkInputCode(event.code);
      if (!inputCode) return;

      event.preventDefault();
      walkKeysRef.current.add(inputCode);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const inputCode = resolveWalkInputCode(event.code);
      if (!inputCode) return;

      if (walkModeRef.current && !shouldIgnoreKeyboardEvent(event)) {
        event.preventDefault();
      }

      walkKeysRef.current.delete(inputCode);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      walkKeysRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || isScriptedTransitionRef.current) return;

    if (walkMode) {
      const lookAt = createWalkLookAt(
        vectorToTuple(controls.getPosition(framePositionRef.current, false)),
        vectorToTuple(controls.getTarget(frameTargetRef.current, false)),
        walkClipBox
      );
      const limits = calculateTourCameraRigLimits(lookAt.position, lookAt.target);

      walkAnchorRef.current = lookAt.position;
      configureControls(controls, limits, true);
      controls.enabled = true;
      void applyLookAt(controls, lookAt, false);
      controls.update(0);
      return;
    }

    walkAnchorRef.current = null;
    const position = vectorToTuple(controls.getPosition(framePositionRef.current, false));
    const target = vectorToTuple(controls.getTarget(frameTargetRef.current, false));
    configureControls(controls, calculateTourCameraRigLimits(position, target), false);
    controls.enabled = true;
  }, [walkClipBox, walkMode]);

  useEffect(() => {
    const preset = presets.find((item) => item.id === activeId);
    const controls = controlsRef.current;
    if (!preset || !controls) return;

    const lookAt = walkModeRef.current
      ? createWalkLookAt(preset.camera.position, preset.camera.target, walkClipBox)
      : preset.camera;
    const limits = calculateTourCameraRigLimits(lookAt.position, lookAt.target);
    const transitionToken = transitionTokenRef.current + 1;
    transitionTokenRef.current = transitionToken;
    isScriptedTransitionRef.current = true;

    configureControls(controls, limits, walkModeRef.current);

    // During scripted preset moves, user input is ignored. A newer activeId cancels the arrival callback
    // for this move, then starts its own transition from the camera's current interpolated position.
    controls.enabled = false;
    controls.cancel();
    void controls.setFocalOffset(0, 0, 0, false);

    controls
      .setLookAt(
        lookAt.position[0],
        lookAt.position[1],
        lookAt.position[2],
        lookAt.target[0],
        lookAt.target[1],
        lookAt.target[2],
        true
      )
      .then(() => {
        if (transitionTokenRef.current !== transitionToken) return;

        configureControls(controls, limits, walkModeRef.current);
        if (walkModeRef.current) {
          walkAnchorRef.current = lookAt.position;
        }
        isScriptedTransitionRef.current = false;
        controls.enabled = true;
        onArrive?.(preset.id);
      })
      .catch(() => {
        if (transitionTokenRef.current === transitionToken) {
          isScriptedTransitionRef.current = false;
          controls.enabled = true;
        }
      });

    return () => {
      transitionTokenRef.current += 1;
    };
  }, [activeId, onArrive, presets, walkClipBox]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !walkModeRef.current || isScriptedTransitionRef.current) return;

    const currentPosition = controls.getPosition(framePositionRef.current, false);
    const currentTarget = controls.getTarget(frameTargetRef.current, false);
    const lookOffset = frameLookOffsetRef.current.subVectors(currentTarget, currentPosition);
    if (lookOffset.lengthSq() <= VECTOR_EPSILON) {
      lookOffset.set(0, 0, -1);
    }

    const currentAnchor =
      walkAnchorRef.current ??
      clampTourCameraPositionToClipBox([currentPosition.x, WALK_EYE_HEIGHT_METERS, currentPosition.z], walkClipBox);
    const walkDirection = readWalkDirection(walkKeysRef.current);
    const hasWalkInput = walkDirection.forward !== 0 || walkDirection.strafe !== 0;
    const hasPositionDrift =
      Math.abs(currentPosition.x - currentAnchor[0]) > VECTOR_EPSILON ||
      Math.abs(currentPosition.y - currentAnchor[1]) > VECTOR_EPSILON ||
      Math.abs(currentPosition.z - currentAnchor[2]) > VECTOR_EPSILON;

    if (!hasWalkInput && !hasPositionDrift) return;

    const forward = frameForwardRef.current.set(lookOffset.x, 0, lookOffset.z);
    if (forward.lengthSq() <= VECTOR_EPSILON) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    const right = frameRightRef.current.set(-forward.z, 0, forward.x);
    const movement = frameMoveRef.current
      .set(0, 0, 0)
      .addScaledVector(forward, walkDirection.forward)
      .addScaledVector(right, walkDirection.strafe);

    if (movement.lengthSq() > 1) {
      movement.normalize();
    }

    const travelDistance = WALK_SPEED_METERS_PER_SECOND * delta;
    const nextAnchor = clampTourCameraPositionToClipBox(
      [
        currentAnchor[0] + movement.x * travelDistance,
        WALK_EYE_HEIGHT_METERS,
        currentAnchor[2] + movement.z * travelDistance
      ],
      walkClipBox
    );
    const nextLookAt = {
      position: nextAnchor,
      target: [nextAnchor[0] + lookOffset.x, nextAnchor[1] + lookOffset.y, nextAnchor[2] + lookOffset.z]
    } satisfies WalkLookAt;

    walkAnchorRef.current = nextAnchor;
    void applyLookAt(controls, nextLookAt, false);
    controls.update(0);
  });

  return <CameraControls makeDefault ref={controlsRef} />;
}

function configureControls(controls: TourCameraControls, limits: TourCameraRigLimits, walkMode: boolean) {
  const { ACTION } = CameraControlsImpl;

  controls.smoothTime = TRANSITION_SMOOTH_TIME_SECONDS;
  controls.draggingSmoothTime = DRAGGING_SMOOTH_TIME_SECONDS;
  controls.restThreshold = REST_THRESHOLD;
  controls.infinityDolly = false;
  controls.dollyToCursor = false;
  controls.dragToOffset = false;
  controls.dollySpeed = walkMode ? 0 : DEFAULT_DOLLY_SPEED;
  controls.truckSpeed = 0;

  controls.minDistance = limits.minDistance;
  controls.maxDistance = limits.maxDistance;
  controls.minPolarAngle = limits.minPolarAngle;
  controls.maxPolarAngle = limits.maxPolarAngle;

  controls.mouseButtons.left = ACTION.ROTATE;
  controls.mouseButtons.middle = walkMode ? ACTION.NONE : ACTION.DOLLY;
  controls.mouseButtons.right = ACTION.NONE;
  controls.mouseButtons.wheel = walkMode ? ACTION.NONE : ACTION.DOLLY;

  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = walkMode ? ACTION.NONE : ACTION.TOUCH_DOLLY_ROTATE;
  controls.touches.three = ACTION.NONE;
}

function createWalkLookAt(
  position: TourCameraVector3,
  target: TourCameraVector3,
  clipBox: ReturnType<typeof createRoomClipBox>
): WalkLookAt {
  const clampedPosition = clampTourCameraPositionToClipBox(
    [position[0], WALK_EYE_HEIGHT_METERS, position[2]],
    clipBox
  );
  const delta: [number, number, number] = [
    clampedPosition[0] - position[0],
    clampedPosition[1] - position[1],
    clampedPosition[2] - position[2]
  ];

  return {
    position: clampedPosition,
    target: [target[0] + delta[0], target[1] + delta[1], target[2] + delta[2]]
  };
}

function applyLookAt(controls: TourCameraControls, lookAt: WalkLookAt, enableTransition: boolean) {
  return controls.setLookAt(
    lookAt.position[0],
    lookAt.position[1],
    lookAt.position[2],
    lookAt.target[0],
    lookAt.target[1],
    lookAt.target[2],
    enableTransition
  );
}

function vectorToTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function readWalkDirection(keys: ReadonlySet<string>): { forward: number; strafe: number } {
  return {
    forward: (keys.has("forward") ? 1 : 0) - (keys.has("backward") ? 1 : 0),
    strafe: (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0)
  };
}

function resolveWalkInputCode(code: string): "forward" | "backward" | "left" | "right" | null {
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

function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}
