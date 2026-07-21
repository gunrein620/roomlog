"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei/core/CameraControls.js";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef, type MutableRefObject } from "react";
import { Box3, Object3D, Raycaster, Vector2, Vector3 } from "three";
import type { FurniturePlacementHit } from "../furniture-placement";
import { resolveWalkInputCode, type WalkAction } from "../walk/walk-input";
import {
  furnitureFirstPersonMovementDelta,
  resolveFurnitureShortcut,
  type FurnitureInteractionMode
} from "./furniture-first-person-input";

const FURNITURE_EYE_HEIGHT_METERS = 1.45;
const FURNITURE_INITIAL_LOOK_DROP_METERS = 0.28;
const LOOK_SENSITIVITY = 0.002;
const CENTER_SCREEN = new Vector2(0, 0);

export type FurnitureFirstPersonStatus = "ready" | "locked" | "fallback";

export type FurnitureFirstPersonControlsProps = {
  aimedFurnitureId: string | null;
  enabled: boolean;
  interactionMode: FurnitureInteractionMode;
  onAimedFurnitureChange: (id: string | null) => void;
  onCancel: () => void;
  onCloseSelect: () => void;
  onConfirm: () => void;
  onLatestPlacementHit?: (hit: FurniturePlacementHit) => void;
  onLatestPlacementPoint: (point: { x: number; z: number }) => void;
  onOpenSelect: () => void;
  onPickupAimed: (id: string) => void;
  onPlacementHit?: (hit: FurniturePlacementHit) => void;
  onPlacementPoint: (point: { x: number; z: number }) => void;
  onRemove?: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onStatusChange: (status: FurnitureFirstPersonStatus) => void;
  pointerLockRequestRef: MutableRefObject<(() => void) | null>;
  preferredSpawn: { x: number; z: number };
};

type FurnitureCameraControls = NonNullable<ComponentRef<typeof CameraControls>>;

type SceneHitMetadata =
  | { kind: "furniture"; furnitureId: string }
  | { kind: "surface"; surface: "floor" | "wall"; wallId?: string };

export function FurnitureFirstPersonControls(props: FurnitureFirstPersonControlsProps) {
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const callbacksRef = useRef(props);
  const modeRef = useRef(props.interactionMode);
  const aimedFurnitureIdRef = useRef(props.aimedFurnitureId);
  const keysRef = useRef(new Set<WalkAction>());
  const positionRef = useRef(new Vector3());
  const targetRef = useRef(new Vector3());
  const forwardRef = useRef(new Vector3());
  const raycasterRef = useRef(new Raycaster());
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);

  callbacksRef.current = props;
  modeRef.current = props.interactionMode;
  aimedFurnitureIdRef.current = props.aimedFurnitureId;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    configureFurnitureControls(controls);
  }, []);

  useEffect(() => {
    if (!props.enabled) return;
    const controls = controlsRef.current;
    if (!controls) return;

    void controls.setLookAt(
      props.preferredSpawn.x,
      FURNITURE_EYE_HEIGHT_METERS,
      props.preferredSpawn.z,
      props.preferredSpawn.x,
      FURNITURE_EYE_HEIGHT_METERS - FURNITURE_INITIAL_LOOK_DROP_METERS,
      props.preferredSpawn.z - 1,
      false
    );
    controls.update(0);
    invalidate();
    props.onStatusChange("ready");
  }, [invalidate, props.enabled, props.preferredSpawn.x, props.preferredSpawn.z]);

  useEffect(() => {
    if (!props.enabled) return;
    const canvas = gl.domElement;

    function requestPointerLock() {
      if (!("requestPointerLock" in canvas)) {
        callbacksRef.current.onStatusChange("fallback");
        return;
      }
      void canvas.requestPointerLock();
    }

    function handleCanvasClick(event: MouseEvent) {
      if (event.button !== 0 || document.pointerLockElement === canvas) return;
      if (modeRef.current === "select") callbacksRef.current.onCloseSelect();
      requestPointerLock();
    }

    function handlePointerLockChange() {
      const locked = document.pointerLockElement === canvas;
      if (!locked) keysRef.current.clear();
      callbacksRef.current.onStatusChange(locked ? "locked" : "ready");
    }

    function handlePointerLockError() {
      callbacksRef.current.onStatusChange("fallback");
    }

    function handleMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== canvas || modeRef.current === "select") return;
      const controls = controlsRef.current;
      if (!controls) return;
      void controls.rotate(-event.movementX * LOOK_SENSITIVITY, -event.movementY * LOOK_SENSITIVITY, false);
      controls.update(0);
      invalidate();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = resolveFurnitureShortcut({
        aimedFurnitureId: aimedFurnitureIdRef.current,
        code: event.code,
        mode: modeRef.current,
        repeat: event.repeat,
        target: event.target
      });

      if (shortcut) {
        event.preventDefault();
        if (shortcut === "pickup-aimed" && aimedFurnitureIdRef.current) {
          callbacksRef.current.onPickupAimed(aimedFurnitureIdRef.current);
        } else if (shortcut === "open-select") {
          if (modeRef.current === "carry") callbacksRef.current.onCancel();
          keysRef.current.clear();
          if (document.pointerLockElement === canvas) document.exitPointerLock();
          callbacksRef.current.onOpenSelect();
        } else if (shortcut === "close-select") {
          callbacksRef.current.onCloseSelect();
          requestPointerLock();
        } else if (shortcut === "confirm") {
          callbacksRef.current.onConfirm();
        } else if (shortcut === "cancel") {
          callbacksRef.current.onCancel();
        } else if (shortcut === "remove") {
          callbacksRef.current.onRemove?.();
        } else if (shortcut === "rotate-left") {
          callbacksRef.current.onRotateLeft();
        } else if (shortcut === "rotate-right") {
          callbacksRef.current.onRotateRight();
        }
        return;
      }

      if (modeRef.current === "select") return;
      const action = resolveWalkInputCode(event.code);
      if (!action) return;
      event.preventDefault();
      keysRef.current.add(action);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const action = resolveWalkInputCode(event.code);
      if (!action) return;
      keysRef.current.delete(action);
    }

    function clearPressedKeys() {
      keysRef.current.clear();
    }

    props.pointerLockRequestRef.current = requestPointerLock;
    canvas.addEventListener("click", handleCanvasClick);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("pointerlockerror", handlePointerLockError);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearPressedKeys);

    return () => {
      keysRef.current.clear();
      props.pointerLockRequestRef.current = null;
      canvas.removeEventListener("click", handleCanvasClick);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("pointerlockerror", handlePointerLockError);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearPressedKeys);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [gl, invalidate, props.enabled, props.pointerLockRequestRef]);

  useFrame((_, delta) => {
    if (!props.enabled) return;
    const controls = controlsRef.current;
    if (!controls) return;

    if (modeRef.current !== "select" && keysRef.current.size > 0) {
      const position = controls.getPosition(positionRef.current, false);
      const target = controls.getTarget(targetRef.current, false);
      forwardRef.current.copy(target).sub(position);
      const movement = furnitureFirstPersonMovementDelta(
        keysRef.current,
        { x: forwardRef.current.x, z: forwardRef.current.z },
        delta
      );

      if (movement.x !== 0 || movement.z !== 0) {
        const targetOffset = target.clone().sub(position);
        void controls.setLookAt(
          position.x + movement.x,
          FURNITURE_EYE_HEIGHT_METERS,
          position.z + movement.z,
          position.x + movement.x + targetOffset.x,
          FURNITURE_EYE_HEIGHT_METERS + targetOffset.y,
          position.z + movement.z + targetOffset.z,
          false
        );
        controls.update(0);
        invalidate();
      }
    }

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(CENTER_SCREEN, camera);
    const intersections = raycaster.intersectObjects(scene.children, true);

    if (modeRef.current === "explore") {
      let nextAimedFurnitureId: string | null = null;
      for (const intersection of intersections) {
        const sceneHit = findSceneHitMetadata(intersection.object);
        if (!sceneHit) continue;
        if (sceneHit.metadata.kind === "furniture") nextAimedFurnitureId = sceneHit.metadata.furnitureId;
        break;
      }
      if (nextAimedFurnitureId !== aimedFurnitureIdRef.current) {
        aimedFurnitureIdRef.current = nextAimedFurnitureId;
        callbacksRef.current.onAimedFurnitureChange(nextAimedFurnitureId);
      }
    } else if (aimedFurnitureIdRef.current !== null) {
      aimedFurnitureIdRef.current = null;
      callbacksRef.current.onAimedFurnitureChange(null);
    }

    for (const intersection of intersections) {
      const sceneHit = findSceneHitMetadata(intersection.object);
      if (!sceneHit) continue;
      const hit = createFurniturePlacementHit(sceneHit, intersection);
      if (callbacksRef.current.onLatestPlacementHit) callbacksRef.current.onLatestPlacementHit(hit);
      else if (hit.kind === "floor") callbacksRef.current.onLatestPlacementPoint(hit.point);
      if (modeRef.current === "carry") {
        if (callbacksRef.current.onPlacementHit) callbacksRef.current.onPlacementHit(hit);
        else if (hit.kind === "floor") callbacksRef.current.onPlacementPoint(hit.point);
      }
      return;
    }
  });

  return <CameraControls makeDefault ref={controlsRef} />;
}

function findSceneHitMetadata(object: Object3D): { metadata: SceneHitMetadata; root: Object3D } | null {
  let current: Object3D | null = object;
  while (current) {
    const furnitureId = current.userData.roomlogFurnitureId;
    if (typeof furnitureId === "string") return { metadata: { kind: "furniture", furnitureId }, root: current };
    const surface = current.userData.roomlogPlacementSurface;
    if (surface === "floor" || surface === "wall") {
      const wallId = typeof current.userData.roomlogWallId === "string" ? current.userData.roomlogWallId : undefined;
      return { metadata: { kind: "surface", surface, wallId }, root: current };
    }
    current = current.parent;
  }
  return null;
}

function createFurniturePlacementHit(
  sceneHit: { metadata: SceneHitMetadata; root: Object3D },
  intersection: ReturnType<Raycaster["intersectObjects"]>[number]
): FurniturePlacementHit {
  const point = { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z };
  if (sceneHit.metadata.kind === "furniture") {
    const bounds = new Box3().setFromObject(sceneHit.root);
    return {
      kind: "furniture",
      furnitureId: sceneHit.metadata.furnitureId,
      point,
      supportTopY: bounds.max.y
    };
  }
  if (sceneHit.metadata.surface === "floor") return { kind: "floor", point };

  const bounds = new Box3().setFromObject(sceneHit.root);
  const normal = intersection.face?.normal.clone() ?? raycasterFacingNormal(intersection.point, intersection.object);
  if (intersection.face) normal.transformDirection(intersection.object.matrixWorld);
  return {
    kind: "wall",
    normal: { x: normal.x, y: normal.y, z: normal.z },
    point,
    wallId: sceneHit.metadata.wallId ?? "mitunet-wall",
    wallMaxY: bounds.max.y,
    wallMinY: bounds.min.y
  };
}

function raycasterFacingNormal(point: Vector3, object: Object3D) {
  return point.clone().sub(object.getWorldPosition(new Vector3())).normalize();
}

function configureFurnitureControls(controls: FurnitureCameraControls) {
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
  controls.touches.one = ACTION.NONE;
  controls.touches.two = ACTION.NONE;
  controls.touches.three = ACTION.NONE;
}
