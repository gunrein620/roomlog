"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei/core/CameraControls.js";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import { findWalkSpawn, resolveWalkMovement } from "../walk/walk-collision";
import { cameraRelativeWalkDelta, combineWalkInput, resolveWalkInputCode, type WalkAction, type WalkInput } from "../walk/walk-input";
import { createFloorPlanWalkWorld } from "../walk/walk-scene";

const WALK_EYE_HEIGHT_METERS = 1.45;
const WALK_SPEED_METERS_PER_SECOND = 1.5;
const LOOK_SENSITIVITY = 0.002;

export type FloorPlanWalkStatus = "ready" | "locked" | "fallback" | "unavailable";

export type FloorPlanWalkControlsProps = {
  enabled: boolean;
  furnitureData: readonly PlacedFurniture[];
  horizontalScale: number;
  moveInputRef?: { current: WalkInput } | null;
  onStatusChange?: (status: FloorPlanWalkStatus) => void;
  preferredSpawn: { x: number; z: number };
  wallsData: readonly WheretoputWall3D[];
};

type WalkCameraControls = NonNullable<ComponentRef<typeof CameraControls>>;

export function FloorPlanWalkControls({
  enabled,
  furnitureData,
  horizontalScale,
  moveInputRef = null,
  onStatusChange,
  preferredSpawn,
  wallsData
}: FloorPlanWalkControlsProps) {
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const keysRef = useRef(new Set<WalkAction>());
  const positionRef = useRef(new Vector3());
  const targetRef = useRef(new Vector3());
  const walkPositionRef = useRef<{ x: number; z: number } | null>(null);
  const world = useMemo(
    () => createFloorPlanWalkWorld(wallsData, furnitureData, horizontalScale),
    [furnitureData, horizontalScale, wallsData]
  );

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    configureWalkControls(controls);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const spawn = findWalkSpawn(preferredSpawn, world);
    if (!spawn) {
      walkPositionRef.current = null;
      controls.enabled = false;
      onStatusChange?.("unavailable");
      return;
    }

    controls.enabled = true;
    walkPositionRef.current = spawn;
    void controls.setLookAt(
      spawn.x,
      WALK_EYE_HEIGHT_METERS,
      spawn.z,
      spawn.x,
      WALK_EYE_HEIGHT_METERS,
      spawn.z - 1,
      false
    );
    controls.update(0);
    invalidate();
    onStatusChange?.("ready");
  }, [enabled, invalidate, onStatusChange, preferredSpawn, world]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;

    function handleCanvasClick(event: MouseEvent) {
      if (event.button !== 0 || document.pointerLockElement === canvas) return;
      if (!("requestPointerLock" in canvas)) {
        onStatusChange?.("fallback");
        return;
      }
      void gl.domElement.requestPointerLock();
    }

    function handlePointerLockChange() {
      onStatusChange?.(document.pointerLockElement === canvas ? "locked" : "ready");
    }

    function handlePointerLockError() {
      onStatusChange?.("fallback");
    }

    function handleMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== canvas) return;
      const controls = controlsRef.current;
      if (!controls) return;
      void controls.rotate(-event.movementX * LOOK_SENSITIVITY, -event.movementY * LOOK_SENSITIVITY, false);
      controls.update(0);
      invalidate();
    }

    gl.domElement.addEventListener("click", handleCanvasClick);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("pointerlockerror", handlePointerLockError);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      gl.domElement.removeEventListener("click", handleCanvasClick);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("pointerlockerror", handlePointerLockError);
      document.removeEventListener("mousemove", handleMouseMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [enabled, gl, invalidate, onStatusChange]);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreKeyboardEvent(event)) return;
      const action = resolveWalkInputCode(event.code);
      if (!action) return;
      event.preventDefault();
      keysRef.current.add(action);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const action = resolveWalkInputCode(event.code);
      if (!action) return;
      if (!shouldIgnoreKeyboardEvent(event)) event.preventDefault();
      keysRef.current.delete(action);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      keysRef.current.clear();
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled || !walkPositionRef.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const input = combineWalkInput(keysRef.current, moveInputRef?.current ?? null);
    if (input.forward === 0 && input.strafe === 0) return;

    const position = controls.getPosition(positionRef.current, false);
    const target = controls.getTarget(targetRef.current, false);
    const forward = { x: target.x - position.x, z: target.z - position.z };
    const travelDistance = WALK_SPEED_METERS_PER_SECOND * Math.min(delta, 0.1);
    const movement = cameraRelativeWalkDelta(input, forward, travelDistance);
    const next = resolveWalkMovement(walkPositionRef.current, movement, world);
    const targetOffset = target.clone().sub(position);

    walkPositionRef.current = next;
    void controls.setLookAt(
      next.x,
      WALK_EYE_HEIGHT_METERS,
      next.z,
      next.x + targetOffset.x,
      WALK_EYE_HEIGHT_METERS + targetOffset.y,
      next.z + targetOffset.z,
      false
    );
    controls.update(0);
    invalidate();
  });

  return <CameraControls makeDefault ref={controlsRef} />;
}

function configureWalkControls(controls: WalkCameraControls) {
  const { ACTION } = CameraControlsImpl;
  controls.dollySpeed = 0;
  controls.truckSpeed = 0;
  controls.infinityDolly = false;
  controls.dollyToCursor = false;
  controls.dragToOffset = false;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI - 0.2;
  controls.mouseButtons.left = ACTION.ROTATE;
  controls.mouseButtons.middle = ACTION.NONE;
  controls.mouseButtons.right = ACTION.NONE;
  controls.mouseButtons.wheel = ACTION.NONE;
  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.NONE;
  controls.touches.three = ACTION.NONE;
}

function shouldIgnoreKeyboardEvent(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}
