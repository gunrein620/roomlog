"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { SparkRenderer as SparkRendererObject, SplatMesh as SplatMeshObject } from "@sparkjsdev/spark";
import { Quaternion, Vector3 } from "three";
import {
  DEFAULT_SPLAT_CLIP_MARGIN_METERS,
  SPLAT_CLIP_ROOM,
  createRoomClipBox,
  isInsideClipBox
} from "./splat-clip";
import { estimateSplatFloorY } from "./splat-floor";
import { isNearAnyPlanWall, wallsToPlanBounds } from "./splat-plan-shape";
import { defaultRotationXDegreesForSrc } from "./splat-orientation";
import { isWallShellPoint, readWallReplaceParam } from "./splat-walls";
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import type { SplatTransform } from "./tour-types";

// 약 3m(가로) × 4m(세로), 층고 2.4m 원룸. 바닥 중앙이 원점.
const ROOM = { ...SPLAT_CLIP_ROOM, thickness: 0.06 };
const SPLAT_TARGET_MAX_DIMENSION_METERS = 2.7;
const SPLAT_MIN_VISIBLE_SIZE_METERS = 1.5;
const SPLAT_MIN_AUTO_SCALE = SPLAT_MIN_VISIBLE_SIZE_METERS / SPLAT_TARGET_MAX_DIMENSION_METERS;
const SPLAT_MAX_AUTO_SCALE = 1.6;
const SPLAT_FLOATER_GUARD_SCALE = 0.6;
const DEFAULT_SPLAT_SCALE_MULTIPLIER = 1;
const DEFAULT_SPLAT_CENTER = { x: 0, y: ROOM.height / 2, z: -0.5 };
const SPLAT_ROTATION_X_AXIS = new Vector3(1, 0, 0);
const SPLAT_ROTATION_Y_AXIS = new Vector3(0, 1, 0);

export type SplatFitMode = "auto" | "native";
type SplatTuningSource = "default" | "profile" | "url";

interface SplatTuning {
  scaleMultiplier: number;
  rotationXDegrees: number;
  rotationYDegrees: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  fitMode: SplatFitMode;
  clip: boolean;
  clipMargin: number;
  floorSnap: boolean;
  wallReplace: boolean;
  sources: {
    scaleMultiplier: SplatTuningSource;
    rotationXDegrees: SplatTuningSource;
    rotationYDegrees: SplatTuningSource;
    offsetX: SplatTuningSource;
    offsetY: SplatTuningSource;
    offsetZ: SplatTuningSource;
    fitMode: SplatTuningSource;
    clip: SplatTuningSource;
    clipMargin: SplatTuningSource;
    floorSnap: SplatTuningSource;
    wallReplace: SplatTuningSource;
  };
  overrides: {
    scaleMultiplier: boolean;
    rotationXDegrees: boolean;
    rotationYDegrees: boolean;
    offsetX: boolean;
    offsetY: boolean;
    offsetZ: boolean;
    fitMode: boolean;
    clip: boolean;
    clipMargin: boolean;
    floorSnap: boolean;
    wallReplace: boolean;
  };
}

export interface SplatTuningProfile {
  scaleMultiplier?: number;
  rotationXDegrees?: number;
  rotationYDegrees?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  fitMode?: SplatFitMode;
  clip?: boolean;
  clipMargin?: number;
  floorSnap?: boolean;
  wallReplace?: boolean;
}

interface SplatFitInfo {
  scale: number;
  scaleReason: "bbox" | "min-guard" | "max-guard" | "fallback" | "native";
  rawScale: number | null;
  maxDimension: number | null;
  size: [number, number, number] | null;
  center: [number, number, number] | null;
}

interface SplatFloorSnapInfo {
  enabled: boolean;
  applied: boolean;
  method: "y-histogram" | "disabled" | "not-native" | "packed-splats-unavailable" | "insufficient-samples";
  floorY: number | null;
  correctionY: number;
  samples: number;
}

interface SplatWallClipInfo {
  enabled: boolean;
  applied: boolean;
  mode: "plan-walls" | "placeholder-box";
  totalSplats: number | null;
  removedSplats: number;
}

interface SplatClipInfo {
  enabled: boolean;
  margin: number;
  method: "disabled" | "packed-opacity-mask" | "packed-splats-unavailable";
  totalSplats: number | null;
  removedSplats: number;
  remainingSplats: number | null;
  box: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
}

export function SplatScene({
  src,
  transform,
  defaultFitMode,
  planWalls = null,
  ceilingClipHeightMeters = null,
  onLoaded
}: {
  src: string;
  // 영속화된 정합 결과. 있으면 URL/프로파일 튜닝 대신 이 절대 배치를 씬에 주입한다.
  transform?: SplatTransform | null;
  // transform이 없는 자유 배치 경로에서 URL/프로파일이 fit을 지정하지 않았을 때만 쓰는 기본값.
  defaultFitMode?: SplatFitMode;
  // 실 FloorPlan.walls(월드=도면 프레임). 있으면 wallClip이 플레이스홀더 박스 대신 이걸로 판정한다.
  planWalls?: WheretoputWall3D[] | null;
  // 픽 뷰 전용 천장 클립: 바닥(≈y0) 기준 이 높이(m) 위 가우시안을 숨겨 밀폐 스캔 내부를 드러낸다.
  // null/미지정이면 아무 것도 하지 않는다(투어 뷰어는 미지정 → 무영향·비용 0). 스플랫 리로드 없이 되돌림 가능.
  ceilingClipHeightMeters?: number | null;
  onLoaded?: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const onLoadedRef = useRef(onLoaded);
  // 천장 클립 되돌림용 — 이 메시의 원본 opacity 스냅샷(최초 사용 시 1회 캡처).
  const ceilingSnapshotRef = useRef<{ mesh: SplatMeshObject; opacities: Float32Array } | null>(null);
  // 객체 참조 불안정으로 인한 리로드를 막기 위해 값 기반 키로 effect 의존성을 건다.
  const transformKey = transform ? JSON.stringify(transform) : null;
  const planWallsKey = planWalls && planWalls.length > 0 ? JSON.stringify(planWalls) : null;
  const [sparkRenderer, setSparkRenderer] = useState<SparkRendererObject | null>(null);
  const [splatMesh, setSplatMesh] = useState<SplatMeshObject | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    let isDisposed = false;
    let nextSparkRenderer: SparkRendererObject | null = null;
    let nextSplatMesh: SplatMeshObject | null = null;

    setHasFailed(false);
    setSparkRenderer(null);
    setSplatMesh(null);

    async function loadSplat() {
      try {
        const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");

        if (isDisposed) return;

        nextSparkRenderer = new SparkRenderer({ renderer: gl, onDirty: invalidate });
        nextSplatMesh = new SplatMesh({ url: src });

        await nextSplatMesh.initialized;

        if (isDisposed) return;

        const profile = await loadSplatTuningProfile(src);

        if (isDisposed) return;

        const tuning = transform
          ? tuningFromTransform(transform, profile, src)
          : readSplatTuningFromLocation(profile, src);
        if (!transform && defaultFitMode && tuning.sources.fitMode === "default") {
          tuning.fitMode = defaultFitMode;
        }
        const fitInfo = fitSplatToDemoRoom(nextSplatMesh, tuning);
        const floorSnapInfo = snapSplatFloor(nextSplatMesh, tuning);
        const wallClipInfo = applyWallClip(nextSplatMesh, tuning, planWalls);
        const clipInfo = applySplatClip(nextSplatMesh, tuning);
        console.info(
          "[splat-tour] applied splat transform " +
            JSON.stringify({
              src,
              fitMode: tuning.fitMode,
              floorSnap: floorSnapInfo,
              wallClip: wallClipInfo,
              clip: clipInfo,
              rotationXDegrees: tuning.rotationXDegrees,
              rotationYDegrees: tuning.rotationYDegrees,
              scaleMultiplier: tuning.scaleMultiplier,
              centerY:
                tuning.fitMode === "auto" ? DEFAULT_SPLAT_CENTER.y + tuning.offsetY : tuning.offsetY,
              positionOffset: [tuning.offsetX, tuning.offsetY, tuning.offsetZ],
              scale: fitInfo.scale,
              scaleReason: fitInfo.scaleReason,
              rawScale: fitInfo.rawScale,
              maxDimension: fitInfo.maxDimension,
              size: fitInfo.size,
              center: fitInfo.center,
              sources: {
                fit: tuning.sources.fitMode,
                rotX: tuning.sources.rotationXDegrees,
                rotY: tuning.sources.rotationYDegrees,
                scale: tuning.sources.scaleMultiplier,
                x: tuning.sources.offsetX,
                y: tuning.sources.offsetY,
                z: tuning.sources.offsetZ,
                clip: tuning.sources.clip,
                clipMargin: tuning.sources.clipMargin
              },
              overrides: tuning.overrides
            })
        );
        setSparkRenderer(nextSparkRenderer);
        setSplatMesh(nextSplatMesh);
        invalidate();
        onLoadedRef.current?.();
      } catch (error) {
        if (isDisposed) return;

        console.error("Failed to load Spark splat scene", error);
        nextSplatMesh?.dispose();
        nextSparkRenderer?.dispose();
        nextSplatMesh = null;
        nextSparkRenderer = null;
        setHasFailed(true);
        onLoadedRef.current?.();
      }
    }

    void loadSplat();

    return () => {
      isDisposed = true;
      nextSplatMesh?.dispose();
      nextSparkRenderer?.dispose();
    };
  }, [gl, invalidate, src, transformKey, defaultFitMode, planWallsKey]);

  // 천장 클립(픽 뷰 전용) — 로드된 splatMesh에 직접 opacity 마스크. 높이 변경/토글은 스플랫 리로드 없이
  // 이 effect만 재실행한다. 원본 opacity 스냅샷으로 되돌리므로 슬라이더/토글이 부드럽다.
  useEffect(() => {
    if (!splatMesh) {
      ceilingSnapshotRef.current = null;
      return;
    }

    const threshold =
      typeof ceilingClipHeightMeters === "number" && Number.isFinite(ceilingClipHeightMeters) && ceilingClipHeightMeters > 0
        ? ceilingClipHeightMeters
        : null;
    const snapshotValid = ceilingSnapshotRef.current?.mesh === splatMesh;
    // 이 메시에 천장 클립을 쓴 적 없고 지금도 끔 → 아무 것도 안 함(투어 뷰어 등 비사용 경로 비용 0).
    if (threshold === null && !snapshotValid) return;

    const packed = splatMesh.packedSplats;
    if (!packed) return;

    // 최초 사용 시 원본 opacity 1회 스냅샷(이후 되돌림 기준). numSplats 미확정이면 클립 불가.
    if (!snapshotValid) {
      const count = getSplatCount(splatMesh);
      if (count === null) return;
      const opacities = new Float32Array(count);
      packed.forEachSplat((index, _center, _scales, _quaternion, opacity) => {
        if (index < count) opacities[index] = opacity;
      });
      ceilingSnapshotRef.current = { mesh: splatMesh, opacities };
    }

    const snapshot = ceilingSnapshotRef.current;
    if (!snapshot) return;

    splatMesh.updateMatrixWorld(true);
    const worldCenter = new Vector3();
    let hidden = 0;
    let changed = false;

    packed.forEachSplat((index, center, scales, quaternion, opacity, color) => {
      const original = index < snapshot.opacities.length ? snapshot.opacities[index] : opacity;
      let target = original;
      if (threshold !== null) {
        worldCenter.copy(center).applyMatrix4(splatMesh.matrixWorld);
        if (worldCenter.y > threshold) target = 0;
      }
      if (target === 0 && original !== 0) hidden += 1;
      if (target !== opacity) {
        packed.setSplat(index, center, scales, quaternion, target, color);
        changed = true;
      }
    });

    if (changed) {
      packed.needsUpdate = true;
      splatMesh.needsUpdate = true;
      invalidate();
    }
    console.info("[splat-tour] ceiling clip " + JSON.stringify({ thresholdY: threshold, hidden }));
  }, [splatMesh, ceilingClipHeightMeters, invalidate]);

  if (hasFailed) {
    return <FallbackRoom />;
  }

  if (!sparkRenderer || !splatMesh) {
    return null;
  }

  return (
    <group>
      <primitive object={sparkRenderer} />
      <primitive object={splatMesh} />
    </group>
  );
}

function fitSplatToDemoRoom(splatMesh: SplatMeshObject, tuning: SplatTuning): SplatFitInfo {
  splatMesh.position.set(0, 0, 0);
  splatMesh.scale.setScalar(1);
  applySplatRotation(splatMesh, tuning.rotationXDegrees, tuning.rotationYDegrees);
  splatMesh.updateMatrixWorld(true);

  // native: 캡처 앱(ARKit/ARCore IMU)이 넣어준 미터 스케일·원점(촬영 시작 지점)을 신뢰하고
  // bbox 기반 fit을 건너뛴다. floater가 bbox를 부풀리는 스캔에서 auto fit은 방을 오배치한다.
  if (tuning.fitMode === "native") {
    const nativeScale = tuning.scaleMultiplier;
    splatMesh.scale.setScalar(nativeScale);
    splatMesh.position.set(tuning.offsetX, tuning.offsetY, tuning.offsetZ);
    splatMesh.updateMatrixWorld(true);

    return {
      scale: nativeScale,
      scaleReason: "native",
      rawScale: null,
      maxDimension: null,
      size: null,
      center: null
    };
  }

  const box = splatMesh.getBoundingBox(true).clone().applyMatrix4(splatMesh.matrixWorld);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const targetCenter = {
    x: DEFAULT_SPLAT_CENTER.x + tuning.offsetX,
    y: DEFAULT_SPLAT_CENTER.y + tuning.offsetY,
    z: DEFAULT_SPLAT_CENTER.z + tuning.offsetZ
  };

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    const fallbackScale = SPLAT_FLOATER_GUARD_SCALE * tuning.scaleMultiplier;
    splatMesh.scale.setScalar(fallbackScale);
    splatMesh.position.set(targetCenter.x, targetCenter.y, targetCenter.z);
    splatMesh.updateMatrixWorld(true);

    return {
      scale: fallbackScale,
      scaleReason: "fallback",
      rawScale: null,
      maxDimension: null,
      size: null,
      center: null
    };
  }

  const scaleFit = resolveSplatScale(maxDimension);
  const scale = scaleFit.scale * tuning.scaleMultiplier;

  splatMesh.scale.setScalar(scale);
  splatMesh.position.set(
    targetCenter.x - center.x * scale,
    targetCenter.y - center.y * scale,
    targetCenter.z - center.z * scale
  );
  splatMesh.updateMatrixWorld(true);

  return {
    scale,
    scaleReason: scaleFit.reason,
    rawScale: scaleFit.rawScale,
    maxDimension,
    size: vectorToTuple(size),
    center: vectorToTuple(center)
  };
}

// 바닥 스냅: native 배치 후 방 XZ 안 splat들의 바닥 슬래브 높이를 추정해 월드 y=0에 맞춘다.
// 수동 y 오프셋 오차(정합 스케일로 증폭)로 가구(도면 좌표, 밑면 y=0)가 파묻히는 문제의 보정.
// auto fit은 스케일 자체가 bbox 추정이라 스냅해도 의미가 없어 건너뛴다.
function snapSplatFloor(splatMesh: SplatMeshObject, tuning: SplatTuning): SplatFloorSnapInfo {
  const skipped: Omit<SplatFloorSnapInfo, "method"> = {
    enabled: tuning.floorSnap,
    applied: false,
    floorY: null,
    correctionY: 0,
    samples: 0
  };

  if (!tuning.floorSnap) return { ...skipped, method: "disabled" };
  if (tuning.fitMode !== "native") return { ...skipped, method: "not-native" };

  const packedSplats = splatMesh.packedSplats;
  if (!packedSplats) return { ...skipped, method: "packed-splats-unavailable" };

  splatMesh.updateMatrixWorld(true);
  const clipBox = createRoomClipBox(tuning.clipMargin);
  const worldCenter = new Vector3();
  const sampleYs: number[] = [];

  packedSplats.forEachSplat((_index, center) => {
    worldCenter.copy(center).applyMatrix4(splatMesh.matrixWorld);
    if (worldCenter.x < clipBox.min.x || worldCenter.x > clipBox.max.x) return;
    if (worldCenter.z < clipBox.min.z || worldCenter.z > clipBox.max.z) return;
    sampleYs.push(worldCenter.y);
  });

  const estimate = estimateSplatFloorY(sampleYs);
  if (!estimate) {
    return { ...skipped, method: "insufficient-samples", samples: sampleYs.length };
  }

  const correctionY = -estimate.floorY;
  if (Math.abs(correctionY) > 0.005) {
    splatMesh.position.y += correctionY;
    splatMesh.updateMatrixWorld(true);
  }

  return {
    enabled: true,
    applied: true,
    method: "y-histogram",
    floorY: estimate.floorY,
    correctionY,
    samples: estimate.samples
  };
}

// 도면 벽 대체: 뭉개진 벽 splat을 opacity-mask로 숨겨 SplatPlanWalls의 깨끗한 형상이 대신 보이게 한다.
// native 정합 배치에서만 유효(auto fit의 bbox 배치는 도면 좌표와 무관). planWalls(실 FloorPlan.walls)가
// 있으면 그 실제 벽 형상으로 판정하고, 없으면 기존 3×4m 플레이스홀더 박스 판정으로 폴백한다.
function applyWallClip(
  splatMesh: SplatMeshObject,
  tuning: SplatTuning,
  planWalls: WheretoputWall3D[] | null
): SplatWallClipInfo {
  const totalSplats = getSplatCount(splatMesh);
  const hasPlanWalls = Boolean(planWalls && planWalls.length > 0);
  const mode: SplatWallClipInfo["mode"] = hasPlanWalls ? "plan-walls" : "placeholder-box";

  if (!tuning.wallReplace || tuning.fitMode !== "native") {
    return {
      enabled: false,
      applied: false,
      mode,
      totalSplats,
      removedSplats: 0
    };
  }

  const packedSplats = splatMesh.packedSplats;
  if (!packedSplats) {
    return {
      enabled: true,
      applied: false,
      mode,
      totalSplats,
      removedSplats: 0
    };
  }

  splatMesh.updateMatrixWorld(true);
  const worldCenter = new Vector3();
  let removed = 0;
  const planRoomHeight = hasPlanWalls ? wallsToPlanBounds(planWalls as WheretoputWall3D[]).height : 0;

  packedSplats.forEachSplat((index, center, scales, quaternion, opacity, color) => {
    worldCenter.copy(center).applyMatrix4(splatMesh.matrixWorld);

    const isWall = hasPlanWalls
      ? isNearAnyPlanWall(worldCenter, planWalls as WheretoputWall3D[], planRoomHeight)
      : isWallShellPoint(worldCenter);

    if (!isWall) {
      return;
    }

    removed += 1;
    if (opacity !== 0) {
      packedSplats.setSplat(index, center, scales, quaternion, 0, color);
    }
  });

  if (removed > 0) {
    packedSplats.needsUpdate = true;
    splatMesh.needsUpdate = true;
  }

  return {
    enabled: true,
    applied: true,
    mode,
    totalSplats,
    removedSplats: removed
  };
}

function applySplatClip(splatMesh: SplatMeshObject, tuning: SplatTuning): SplatClipInfo {
  const box = createRoomClipBox(tuning.clipMargin);
  const totalSplats = getSplatCount(splatMesh);

  if (!tuning.clip) {
    return {
      enabled: false,
      margin: box.margin,
      method: "disabled",
      totalSplats,
      removedSplats: 0,
      remainingSplats: totalSplats,
      box: null
    };
  }

  const packedSplats = splatMesh.packedSplats;
  if (!packedSplats) {
    return {
      enabled: true,
      margin: box.margin,
      method: "packed-splats-unavailable",
      totalSplats,
      removedSplats: 0,
      remainingSplats: totalSplats,
      box: serializeClipBox(box)
    };
  }

  let total = 0;
  let removed = 0;
  const worldCenter = new Vector3();

  packedSplats.forEachSplat((index, center, scales, quaternion, opacity, color) => {
    total += 1;
    worldCenter.copy(center).applyMatrix4(splatMesh.matrixWorld);

    if (isInsideClipBox(worldCenter, box)) {
      return;
    }

    removed += 1;
    if (opacity !== 0) {
      packedSplats.setSplat(index, center, scales, quaternion, 0, color);
    }
  });

  if (removed > 0) {
    packedSplats.needsUpdate = true;
    splatMesh.needsUpdate = true;
  }

  return {
    enabled: true,
    margin: box.margin,
    method: "packed-opacity-mask",
    totalSplats: total,
    removedSplats: removed,
    remainingSplats: total - removed,
    box: serializeClipBox(box)
  };
}

function getSplatCount(splatMesh: SplatMeshObject): number | null {
  if (Number.isFinite(splatMesh.numSplats)) {
    return splatMesh.numSplats;
  }

  return null;
}

function applySplatRotation(splatMesh: SplatMeshObject, rotationXDegrees: number, rotationYDegrees: number) {
  const rotationX = new Quaternion().setFromAxisAngle(
    SPLAT_ROTATION_X_AXIS,
    degreesToRadians(rotationXDegrees)
  );
  const rotationY = new Quaternion().setFromAxisAngle(
    SPLAT_ROTATION_Y_AXIS,
    degreesToRadians(rotationYDegrees)
  );

  // Compose as qY * qX so the mesh is transformed by rotX first, then rotY.
  splatMesh.quaternion.copy(rotationX).premultiply(rotationY);
}

function resolveSplatScale(maxDimension: number): {
  scale: number;
  reason: SplatFitInfo["scaleReason"];
  rawScale: number;
} {
  const rawScale = SPLAT_TARGET_MAX_DIMENSION_METERS / maxDimension;

  if (rawScale < SPLAT_MIN_AUTO_SCALE) {
    return { scale: SPLAT_FLOATER_GUARD_SCALE, reason: "min-guard", rawScale };
  }

  if (rawScale > SPLAT_MAX_AUTO_SCALE) {
    return { scale: SPLAT_MAX_AUTO_SCALE, reason: "max-guard", rawScale };
  }

  return { scale: rawScale, reason: "bbox", rawScale };
}

export async function loadSplatTuningProfile(src: string): Promise<SplatTuningProfile | null> {
  const profileUrl = resolveSplatTuningProfileUrl(src);
  if (!profileUrl) return null;

  try {
    const response = await fetch(profileUrl);

    if (!response.ok) {
      console.warn(`[splat-tour] tuning profile ignored ${profileUrl}: ${response.status}`);
      return null;
    }

    const profile = parseSplatTuningProfile(await response.json());
    return profile;
  } catch {
    console.warn(`[splat-tour] tuning profile ignored ${profileUrl}: failed to load or parse`);
    return null;
  }
}

function resolveSplatTuningProfileUrl(src: string): string | null {
  try {
    const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.href;
    const url = new URL(src, baseUrl);
    if (!/\.[^/]+$/.test(url.pathname)) return null;

    url.pathname = url.pathname.replace(/\.[^/.]+$/, ".tuning.json");
    url.search = "";
    url.hash = "";

    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return url.pathname;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function parseSplatTuningProfile(rawValue: unknown): SplatTuningProfile | null {
  if (!isRecord(rawValue)) {
    throw new Error("Splat tuning profile must be a JSON object.");
  }

  const profile: SplatTuningProfile = {};
  const scaleMultiplier = readNumberValue(rawValue.scale, { minExclusive: 0 });
  const rotationXDegrees = readNumberValue(rawValue.rotX);
  const rotationYDegrees = readNumberValue(rawValue.rotY);
  const offsetX = readNumberValue(rawValue.x);
  const offsetY = readNumberValue(rawValue.y);
  const offsetZ = readNumberValue(rawValue.z);
  const fitMode = readFitModeValue(rawValue.fit);
  const clip = readBooleanValue(rawValue.clip);
  const clipMargin = readNumberValue(rawValue.clipMargin, { minInclusive: 0 });
  const floorSnap = readBooleanValue(rawValue.floorSnap);
  const wallReplace = readBooleanValue(rawValue.walls);

  if (scaleMultiplier !== undefined) profile.scaleMultiplier = scaleMultiplier;
  if (rotationXDegrees !== undefined) profile.rotationXDegrees = rotationXDegrees;
  if (rotationYDegrees !== undefined) profile.rotationYDegrees = rotationYDegrees;
  if (offsetX !== undefined) profile.offsetX = offsetX;
  if (offsetY !== undefined) profile.offsetY = offsetY;
  if (offsetZ !== undefined) profile.offsetZ = offsetZ;
  if (fitMode !== undefined) profile.fitMode = fitMode;
  if (clip !== undefined) profile.clip = clip;
  if (clipMargin !== undefined) profile.clipMargin = clipMargin;
  if (floorSnap !== undefined) profile.floorSnap = floorSnap;
  if (wallReplace !== undefined) profile.wallReplace = wallReplace;

  return profile;
}

// tuning 프로파일/URL이 없을 때 쓰는 기본값. rotX 기본은 포맷 규약(.ply=180·.spz 등=0)을 따른다.
function createDefaultSplatTuning(src: string): SplatTuning {
  return {
    scaleMultiplier: DEFAULT_SPLAT_SCALE_MULTIPLIER,
    rotationXDegrees: defaultRotationXDegreesForSrc(src),
    rotationYDegrees: 0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    fitMode: "auto",
    clip: false,
    clipMargin: DEFAULT_SPLAT_CLIP_MARGIN_METERS,
    floorSnap: true,
    wallReplace: false,
    sources: {
      scaleMultiplier: "default",
      rotationXDegrees: "default",
      rotationYDegrees: "default",
      offsetX: "default",
      offsetY: "default",
      offsetZ: "default",
      fitMode: "default",
      clip: "default",
      clipMargin: "default",
      floorSnap: "default",
      wallReplace: "default"
    },
    overrides: {
      scaleMultiplier: false,
      rotationXDegrees: false,
      rotationYDegrees: false,
      offsetX: false,
      offsetY: false,
      offsetZ: false,
      fitMode: false,
      clip: false,
      clipMargin: false,
      floorSnap: false,
      wallReplace: false
    }
  };
}

// 영속화된 정합 결과(SplatTransform)를 씬 튜닝으로 변환한다. 정합값은 도면 좌표계의
// 절대 배치이므로 fitMode를 "native"로 고정해 bbox auto-fit을 건너뛴다. 클립 설정은
// 프로파일/기본값을 유지 — 정합은 배치만 결정하고 클립(방 밖 floater 제거)은 별개 관심사.
function tuningFromTransform(transform: SplatTransform, profile: SplatTuningProfile | null, src: string): SplatTuning {
  const base = applyProfileTuning(createDefaultSplatTuning(src), profile);
  const injected: SplatTuningSource = "profile"; // 영속 정합값을 profile 소스로 표기
  // transform 주입 경로는 URL 튜닝을 안 읽으므로, 벽 대체만 예외적으로 URL > profile > 기본OFF 순서로 해석한다.
  // 기본 OFF(2026-07-07 결정): 도면 벽 패널이 splat을 가리는 게 실사용에서 더 거슬려서, 원하면 ?splatWalls=1로 켠다.
  const search = typeof window === "undefined" ? "" : window.location.search;
  const urlWallReplace = readWallReplaceParam(search);
  const wallReplace = urlWallReplace ?? profile?.wallReplace ?? false;
  const wallReplaceSource: SplatTuningSource =
    urlWallReplace !== undefined ? "url" : profile?.wallReplace !== undefined ? "profile" : "default";
  return {
    ...base,
    wallReplace,
    scaleMultiplier: transform.scaleMultiplier,
    rotationXDegrees: transform.rotationXDegrees,
    // SplatTransform.rotationYDegrees는 2D 계약(plan = s·R(θ)·splat + t, 표준 반시계)이고
    // three.js R_y(θ)는 XZ 평면에서 그 역방향이다(R_y(−θ) ≡ R_2D(θ)). 3D 진입 경계인
    // 여기서만 부호를 반전해 미니맵·프리셋 등 2D 소비자와 방향을 일치시킨다.
    rotationYDegrees: -transform.rotationYDegrees,
    offsetX: transform.offsetX,
    offsetY: transform.offsetY,
    offsetZ: transform.offsetZ,
    fitMode: "native",
    sources: {
      ...base.sources,
      scaleMultiplier: injected,
      rotationXDegrees: injected,
      rotationYDegrees: injected,
      offsetX: injected,
      offsetY: injected,
      offsetZ: injected,
      fitMode: injected,
      wallReplace: wallReplaceSource
    },
    overrides: {
      ...base.overrides,
      scaleMultiplier: true,
      rotationXDegrees: true,
      rotationYDegrees: true,
      offsetX: true,
      offsetY: true,
      offsetZ: true,
      fitMode: true,
      wallReplace: wallReplaceSource !== "default"
    }
  };
}

function readSplatTuningFromLocation(profile: SplatTuningProfile | null, src: string): SplatTuning {
  const tuning = applyProfileTuning(createDefaultSplatTuning(src), profile);

  if (typeof window === "undefined") {
    return tuning;
  }

  const params = new URLSearchParams(window.location.search);
  const scaleMultiplier = readNumberParam(params, "splatScale", { minExclusive: 0 });
  const rotationXDegrees = readNumberParam(params, "splatRotX");
  const rotationYDegrees = readNumberParam(params, "splatRotY");
  const offsetX = readNumberParam(params, "splatX");
  const offsetY = readNumberParam(params, "splatY");
  const offsetZ = readNumberParam(params, "splatZ");
  const fitMode = readFitModeValue(params.get("splatFit"));
  const clip = readBooleanParam(params, "splatClip");
  const clipMargin = readNumberParam(params, "splatClipMargin", { minInclusive: 0 });
  const floorSnap = readBooleanParam(params, "splatFloorSnap");
  const wallReplace = readBooleanParam(params, "splatWalls");

  if (scaleMultiplier !== undefined) {
    tuning.scaleMultiplier = scaleMultiplier;
    tuning.sources.scaleMultiplier = "url";
    tuning.overrides.scaleMultiplier = true;
  }
  if (rotationXDegrees !== undefined) {
    tuning.rotationXDegrees = rotationXDegrees;
    tuning.sources.rotationXDegrees = "url";
    tuning.overrides.rotationXDegrees = true;
  }
  if (rotationYDegrees !== undefined) {
    tuning.rotationYDegrees = rotationYDegrees;
    tuning.sources.rotationYDegrees = "url";
    tuning.overrides.rotationYDegrees = true;
  }
  if (offsetX !== undefined) {
    tuning.offsetX = offsetX;
    tuning.sources.offsetX = "url";
    tuning.overrides.offsetX = true;
  }
  if (offsetY !== undefined) {
    tuning.offsetY = offsetY;
    tuning.sources.offsetY = "url";
    tuning.overrides.offsetY = true;
  }
  if (offsetZ !== undefined) {
    tuning.offsetZ = offsetZ;
    tuning.sources.offsetZ = "url";
    tuning.overrides.offsetZ = true;
  }
  if (fitMode !== undefined) {
    tuning.fitMode = fitMode;
    tuning.sources.fitMode = "url";
    tuning.overrides.fitMode = true;
  }
  if (clip !== undefined) {
    tuning.clip = clip;
    tuning.sources.clip = "url";
    tuning.overrides.clip = true;
  }
  if (clipMargin !== undefined) {
    tuning.clipMargin = clipMargin;
    tuning.sources.clipMargin = "url";
    tuning.overrides.clipMargin = true;
  }
  if (floorSnap !== undefined) {
    tuning.floorSnap = floorSnap;
    tuning.sources.floorSnap = "url";
    tuning.overrides.floorSnap = true;
  }
  if (wallReplace !== undefined) {
    tuning.wallReplace = wallReplace;
    tuning.sources.wallReplace = "url";
    tuning.overrides.wallReplace = true;
  }

  return tuning;
}

function applyProfileTuning(tuning: SplatTuning, profile: SplatTuningProfile | null): SplatTuning {
  if (!profile) return tuning;

  if (profile.scaleMultiplier !== undefined) {
    tuning.scaleMultiplier = profile.scaleMultiplier;
    tuning.sources.scaleMultiplier = "profile";
  }
  if (profile.rotationXDegrees !== undefined) {
    tuning.rotationXDegrees = profile.rotationXDegrees;
    tuning.sources.rotationXDegrees = "profile";
  }
  if (profile.rotationYDegrees !== undefined) {
    tuning.rotationYDegrees = profile.rotationYDegrees;
    tuning.sources.rotationYDegrees = "profile";
  }
  if (profile.offsetX !== undefined) {
    tuning.offsetX = profile.offsetX;
    tuning.sources.offsetX = "profile";
  }
  if (profile.offsetY !== undefined) {
    tuning.offsetY = profile.offsetY;
    tuning.sources.offsetY = "profile";
  }
  if (profile.offsetZ !== undefined) {
    tuning.offsetZ = profile.offsetZ;
    tuning.sources.offsetZ = "profile";
  }
  if (profile.fitMode !== undefined) {
    tuning.fitMode = profile.fitMode;
    tuning.sources.fitMode = "profile";
  }
  if (profile.clip !== undefined) {
    tuning.clip = profile.clip;
    tuning.sources.clip = "profile";
  }
  if (profile.clipMargin !== undefined) {
    tuning.clipMargin = profile.clipMargin;
    tuning.sources.clipMargin = "profile";
  }
  if (profile.floorSnap !== undefined) {
    tuning.floorSnap = profile.floorSnap;
    tuning.sources.floorSnap = "profile";
  }
  if (profile.wallReplace !== undefined) {
    tuning.wallReplace = profile.wallReplace;
    tuning.sources.wallReplace = "profile";
  }

  return tuning;
}

function readNumberParam(
  params: URLSearchParams,
  key: string,
  options: { minExclusive?: number; minInclusive?: number } = {}
): number | undefined {
  const rawValue = params.get(key);
  if (rawValue === null) return undefined;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return undefined;
  if (options.minExclusive !== undefined && value <= options.minExclusive) return undefined;
  if (options.minInclusive !== undefined && value < options.minInclusive) return undefined;

  return value;
}

function readNumberValue(
  rawValue: unknown,
  options: { minExclusive?: number; minInclusive?: number } = {}
): number | undefined {
  if (typeof rawValue !== "number") return undefined;
  if (!Number.isFinite(rawValue)) return undefined;
  if (options.minExclusive !== undefined && rawValue <= options.minExclusive) return undefined;
  if (options.minInclusive !== undefined && rawValue < options.minInclusive) return undefined;

  return rawValue;
}

function readBooleanParam(params: URLSearchParams, key: string): boolean | undefined {
  const rawValue = params.get(key);
  if (rawValue === null) return undefined;

  const value = rawValue.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;

  return undefined;
}

function readBooleanValue(rawValue: unknown): boolean | undefined {
  if (typeof rawValue === "boolean") return rawValue;

  return undefined;
}

function readFitModeValue(rawValue: unknown): SplatFitMode | undefined {
  if (rawValue === "auto" || rawValue === "native") return rawValue;

  return undefined;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function vectorToTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function serializeClipBox(box: ReturnType<typeof createRoomClipBox>): SplatClipInfo["box"] {
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z]
  };
}

function FallbackRoom() {
  const { width, depth, height, thickness } = ROOM;

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#d8d2c4" />
      </mesh>
      <mesh position={[0, height / 2, -depth / 2]}>
        <boxGeometry args={[width, height, thickness]} />
        <meshStandardMaterial color="#eceae4" />
      </mesh>
      <mesh position={[0, height / 2, depth / 2]}>
        <boxGeometry args={[width, height, thickness]} />
        <meshStandardMaterial color="#eceae4" />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial color="#e4e1d8" />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial color="#e4e1d8" />
      </mesh>
    </group>
  );
}
