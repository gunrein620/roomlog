"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei/core/CameraControls.js";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { ComponentRef } from "react";
import { Vector3 } from "three";
import { createRoomClipBox, type SplatClipBox } from "./splat-clip";
import { calculateTourCameraRigLimits, clampTourCameraPositionToClipBox } from "./tour-camera-math";
import type { TourCameraRigLimits, TourCameraVector3 } from "./tour-camera-math";
import type { PlanBounds } from "./splat-plan-shape";
import type { TourPreset } from "./tour-types";

const TRANSITION_SMOOTH_TIME_SECONDS = 0.45;
const DRAGGING_SMOOTH_TIME_SECONDS = 0.08;
const REST_THRESHOLD = 0.002;
const WALK_EYE_HEIGHT_METERS = 1.45;
const WALK_SPEED_METERS_PER_SECOND = 1.5;
const VECTOR_EPSILON = 1e-6;
// 실도면 걷기 경계: 벽 안쪽으로 살짝 들여서(벽에 얼굴 박기 방지) 방 밖 이탈을 막는다.
const WALK_BOUNDS_INSET_METERS = 0.25;
// 실도면 경계가 없을 때의 폴백 걷기 반경(원점 기준 ±, m)과 천장 높이(m). 예전엔 3×4m 플레이스홀더
// 방(createRoomClipBox)에 가뒀지만, 가짜 방에 갇히는 대신 넉넉히 열어 자유롭게 걷되 검은 void로의
// 이탈만 막는다. 스플랫은 원점 근처에 fit되므로 ±4m면 실내를 넉넉히 덮는다.
const WALK_FALLBACK_HALF_EXTENT_METERS = 4;
const WALK_FALLBACK_CEILING_METERS = 3;

type TourCameraControls = NonNullable<ComponentRef<typeof CameraControls>>;
type WalkLookAt = { position: [number, number, number]; target: [number, number, number] };

// 아날로그 이동 입력(모바일 조이스틱). WASD(디지털 −1/0/1)와 같은 이동 경로로 합산된다.
// forward/strafe는 −1..1 연속값 → 스틱을 반만 밀면 절반 속도.
export interface TourMoveInput {
  forward: number;
  strafe: number;
}

export function TourCamera({
  presets,
  activeId,
  onArrive,
  onCameraMove,
  walkBounds = null,
  spawnView = null,
  moveInputRef = null
}: {
  presets: TourPreset[];
  activeId: string;
  onArrive?: (id: string) => void;
  // 미니맵 위치점용 — 카메라가 바닥평면에서 움직일 때(임계 초과) 월드 좌표를 보고한다.
  onCameraMove?: (position: [number, number, number]) => void;
  // 실도면 경계(있으면) — 걷기 이동을 이 안으로 클램프. 없으면 넉넉한 폴백 박스(createWalkClipBox).
  walkBounds?: PlanBounds | null;
  // 투어가 열릴 때 스냅할 초기 시점. 프리셋(현관/방중앙/창가)과 별개 — activeId가 어떤
  // 프리셋과도 안 맞을 때(스폰 상태)만 마운트 1회 적용한다. null이면 기존 프리셋 스폰 유지.
  spawnView?: { position: [number, number, number]; target: [number, number, number] } | null;
  // 모바일 조이스틱의 아날로그 이동 입력(부모가 ref.current를 갱신). RAF 루프가 매 프레임 읽어
  // WASD 방향에 더한다. 데스크탑은 WASD, 모바일은 조이스틱 — 서로 다른 채널이라 충돌 없이 합산.
  moveInputRef?: { current: TourMoveInput } | null;
}) {
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const spawnAppliedRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const walkKeysRef = useRef(new Set<string>());
  const walkAnchorRef = useRef<[number, number, number] | null>(null);
  const isScriptedTransitionRef = useRef(false);
  const framePositionRef = useRef(new Vector3());
  const frameTargetRef = useRef(new Vector3());
  const frameLookOffsetRef = useRef(new Vector3());
  const frameForwardRef = useRef(new Vector3());
  const frameRightRef = useRef(new Vector3());
  const frameMoveRef = useRef(new Vector3());
  const walkClipBox = useMemo(() => createWalkClipBox(walkBounds), [walkBounds]);
  const reportPositionRef = useRef(new Vector3());
  const lastReportedRef = useRef<[number, number, number] | null>(null);

  useEffect(() => {
    // 걷기는 이제 항상 켜진 유일한 이동 패러다임 — 토글 없이 WASD를 상시 수신한다.
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreKeyboardEvent(event)) return;

      const inputCode = resolveWalkInputCode(event.code);
      if (!inputCode) return;

      event.preventDefault();
      walkKeysRef.current.add(inputCode);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const inputCode = resolveWalkInputCode(event.code);
      if (!inputCode) return;

      if (!shouldIgnoreKeyboardEvent(event)) {
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

  // 걷기 설정: 마운트 시 + 걷기 경계(walkClipBox)가 바뀔 때, 현재 시점을 눈높이로 클램프해
  // 앵커를 잡고 first-person 컨트롤(룩-드래그 회전, 돌리·트럭 OFF)을 건다.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || isScriptedTransitionRef.current) return;

    const lookAt = createWalkLookAt(
      vectorToTuple(controls.getPosition(framePositionRef.current, false)),
      vectorToTuple(controls.getTarget(frameTargetRef.current, false)),
      walkClipBox
    );
    const limits = calculateTourCameraRigLimits(lookAt.position, lookAt.target);

    walkAnchorRef.current = lookAt.position;
    configureControls(controls, limits);
    controls.enabled = true;
    void applyLookAt(controls, lookAt, false);
    controls.update(0);
  }, [walkClipBox]);

  useEffect(() => {
    const preset = presets.find((item) => item.id === activeId);
    const controls = controlsRef.current;
    if (!preset || !controls) return;

    const lookAt = createWalkLookAt(preset.camera.position, preset.camera.target, walkClipBox);
    const limits = calculateTourCameraRigLimits(lookAt.position, lookAt.target);
    const transitionToken = transitionTokenRef.current + 1;
    transitionTokenRef.current = transitionToken;
    isScriptedTransitionRef.current = true;

    configureControls(controls, limits);

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

        configureControls(controls, limits);
        walkAnchorRef.current = lookAt.position;
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
    if (!controls || isScriptedTransitionRef.current) return;

    const currentPosition = controls.getPosition(framePositionRef.current, false);
    const currentTarget = controls.getTarget(frameTargetRef.current, false);
    const lookOffset = frameLookOffsetRef.current.subVectors(currentTarget, currentPosition);
    if (lookOffset.lengthSq() <= VECTOR_EPSILON) {
      lookOffset.set(0, 0, -1);
    }

    const currentAnchor =
      walkAnchorRef.current ??
      clampTourCameraPositionToClipBox([currentPosition.x, WALK_EYE_HEIGHT_METERS, currentPosition.z], walkClipBox);
    // WASD(디지털) + 조이스틱(아날로그)을 같은 채널로 합산한다. 데스크탑은 WASD만, 모바일은
    // 조이스틱만 값을 넣으므로 실사용에서 충돌은 없고, 둘 다 들어와도 아래 movement 정규화가 클램프한다.
    const walkDirection = combineWalkDirection(walkKeysRef.current, moveInputRef?.current ?? null);
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

  // 바닥평면 이동을 임계(2cm) 초과 시에만 보고 — 매 프레임 setState 리렌더 방지.
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !onCameraMove) return;

    const position = controls.getPosition(reportPositionRef.current, false);
    const last = lastReportedRef.current;
    if (last && Math.abs(last[0] - position.x) < 0.02 && Math.abs(last[2] - position.z) < 0.02) {
      return;
    }

    const next: [number, number, number] = [position.x, position.y, position.z];
    lastReportedRef.current = next;
    onCameraMove(next);
  });

  // 스폰 스냅: 프리셋 전환과 별개로, 투어가 열릴 때 지정 시점으로 한 번 순간이동한다.
  // activeId가 프리셋에 매칭되면(사용자가 버튼을 눌렀거나 프리셋 스폰이면) 그 전환이 담당하므로 건너뛴다.
  useEffect(() => {
    if (spawnAppliedRef.current || !spawnView) return;
    const controls = controlsRef.current;
    if (!controls) return;
    if (presets.some((preset) => preset.id === activeId)) return;

    spawnAppliedRef.current = true;
    const limits = calculateTourCameraRigLimits(spawnView.position, spawnView.target);
    configureControls(controls, limits);
    void applyLookAt(controls, spawnView, false);
    controls.update(0);
  }, [spawnView, presets, activeId]);

  return <CameraControls makeDefault ref={controlsRef} />;
}

// 실도면 경계가 있으면 벽 안쪽으로 인셋한 박스, 없으면 넉넉한 폴백 박스(플레이스홀더 방 아님).
// 인셋 후 공간이 소멸할 만큼 좁은 도면(폭·깊이 ≤ 2×인셋)도 폴백한다.
// TODO(walk-bbox): 폴백 대신 로드된 splat의 실제 월드 bbox로 걷기 경계를 잡는 게 이상적이다.
// 그러려면 SplatScene이 fit 후 bbox를 onBounds 콜백으로 부모에 올려주고, 부모가 그 값을 walkBounds
// 폴백으로 넘겨야 한다(현재 splat-scene.tsx는 병렬 작업 소유 파일이라 이 PR에서 미변경).
function createWalkClipBox(bounds: PlanBounds | null): SplatClipBox {
  if (
    !bounds ||
    bounds.width <= WALK_BOUNDS_INSET_METERS * 2 ||
    bounds.depth <= WALK_BOUNDS_INSET_METERS * 2
  ) {
    return {
      min: { x: -WALK_FALLBACK_HALF_EXTENT_METERS, y: 0.2, z: -WALK_FALLBACK_HALF_EXTENT_METERS },
      max: { x: WALK_FALLBACK_HALF_EXTENT_METERS, y: WALK_FALLBACK_CEILING_METERS, z: WALK_FALLBACK_HALF_EXTENT_METERS },
      margin: 0
    };
  }

  return {
    min: {
      x: bounds.minX + WALK_BOUNDS_INSET_METERS,
      y: 0.2,
      z: bounds.minZ + WALK_BOUNDS_INSET_METERS
    },
    max: {
      x: bounds.maxX - WALK_BOUNDS_INSET_METERS,
      y: Math.max(bounds.height, WALK_EYE_HEIGHT_METERS + 0.2),
      z: bounds.maxZ - WALK_BOUNDS_INSET_METERS
    },
    margin: 0
  };
}

// 걷기 전용 컨트롤 구성: 드래그는 제자리 회전(둘러보기)만, 돌리/트럭은 끈다. 이동은 RAF 루프가
// WASD/조이스틱으로 직접 앵커를 옮겨 처리하므로 카메라 컨트롤의 이동 액션은 전부 NONE이다.
function configureControls(controls: TourCameraControls, limits: TourCameraRigLimits) {
  const { ACTION } = CameraControlsImpl;

  controls.smoothTime = TRANSITION_SMOOTH_TIME_SECONDS;
  controls.draggingSmoothTime = DRAGGING_SMOOTH_TIME_SECONDS;
  controls.restThreshold = REST_THRESHOLD;
  controls.infinityDolly = false;
  controls.dollyToCursor = false;
  controls.dragToOffset = false;
  controls.dollySpeed = 0;
  controls.truckSpeed = 0;

  controls.minDistance = limits.minDistance;
  controls.maxDistance = limits.maxDistance;
  controls.minPolarAngle = limits.minPolarAngle;
  controls.maxPolarAngle = limits.maxPolarAngle;

  controls.mouseButtons.left = ACTION.ROTATE;
  controls.mouseButtons.middle = ACTION.NONE;
  controls.mouseButtons.right = ACTION.NONE;
  controls.mouseButtons.wheel = ACTION.NONE;

  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.NONE;
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

// WASD 디지털 방향 + 조이스틱 아날로그 입력을 합산. 분리된 채널이라 단순 덧셈이면 충분하고,
// 합이 커져도 호출부의 movement 정규화(길이 > 1이면 단위 벡터로)가 속도를 클램프한다.
function combineWalkDirection(
  keys: ReadonlySet<string>,
  analog: TourMoveInput | null
): { forward: number; strafe: number } {
  const digital = readWalkDirection(keys);
  return {
    forward: digital.forward + (analog?.forward ?? 0),
    strafe: digital.strafe + (analog?.strafe ?? 0)
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
