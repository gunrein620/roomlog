"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { SparkRenderer as SparkRendererObject, SplatMesh as SplatMeshObject } from "@sparkjsdev/spark";
import { Quaternion, Vector3 } from "three";

// 약 3m(가로) × 4m(세로), 층고 2.4m 원룸. 바닥 중앙이 원점.
const ROOM = { width: 3, depth: 4, height: 2.4, thickness: 0.06 };
const SPLAT_TARGET_MAX_DIMENSION_METERS = 2.7;
const SPLAT_MIN_VISIBLE_SIZE_METERS = 1.5;
const SPLAT_MIN_AUTO_SCALE = SPLAT_MIN_VISIBLE_SIZE_METERS / SPLAT_TARGET_MAX_DIMENSION_METERS;
const SPLAT_MAX_AUTO_SCALE = 1.6;
const SPLAT_FLOATER_GUARD_SCALE = 0.6;
const SPZ_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES = 180;
const DEFAULT_SPLAT_SCALE_MULTIPLIER = 1;
const DEFAULT_SPLAT_CENTER = { x: 0, y: ROOM.height / 2, z: -0.5 };
const SPLAT_ROTATION_X_AXIS = new Vector3(1, 0, 0);
const SPLAT_ROTATION_Y_AXIS = new Vector3(0, 1, 0);

type SplatFitMode = "auto" | "native";
type SplatTuningSource = "default" | "profile" | "url";

interface SplatTuning {
  scaleMultiplier: number;
  rotationXDegrees: number;
  rotationYDegrees: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  fitMode: SplatFitMode;
  sources: {
    scaleMultiplier: SplatTuningSource;
    rotationXDegrees: SplatTuningSource;
    rotationYDegrees: SplatTuningSource;
    offsetX: SplatTuningSource;
    offsetY: SplatTuningSource;
    offsetZ: SplatTuningSource;
    fitMode: SplatTuningSource;
  };
  overrides: {
    scaleMultiplier: boolean;
    rotationXDegrees: boolean;
    rotationYDegrees: boolean;
    offsetX: boolean;
    offsetY: boolean;
    offsetZ: boolean;
    fitMode: boolean;
  };
}

interface SplatTuningProfile {
  scaleMultiplier?: number;
  rotationXDegrees?: number;
  rotationYDegrees?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  fitMode?: SplatFitMode;
}

interface SplatFitInfo {
  scale: number;
  scaleReason: "bbox" | "min-guard" | "max-guard" | "fallback" | "native";
  rawScale: number | null;
  maxDimension: number | null;
  size: [number, number, number] | null;
  center: [number, number, number] | null;
}

export function SplatScene({ src, onLoaded }: { src: string; onLoaded?: () => void }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const onLoadedRef = useRef(onLoaded);
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

        const tuning = readSplatTuningFromLocation(profile);
        const fitInfo = fitSplatToDemoRoom(nextSplatMesh, tuning);
        console.info(
          "[splat-tour] applied splat transform " +
            JSON.stringify({
              src,
              fitMode: tuning.fitMode,
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
                z: tuning.sources.offsetZ
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
  }, [gl, invalidate, src]);

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

async function loadSplatTuningProfile(src: string): Promise<SplatTuningProfile | null> {
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

  if (scaleMultiplier !== undefined) profile.scaleMultiplier = scaleMultiplier;
  if (rotationXDegrees !== undefined) profile.rotationXDegrees = rotationXDegrees;
  if (rotationYDegrees !== undefined) profile.rotationYDegrees = rotationYDegrees;
  if (offsetX !== undefined) profile.offsetX = offsetX;
  if (offsetY !== undefined) profile.offsetY = offsetY;
  if (offsetZ !== undefined) profile.offsetZ = offsetZ;
  if (fitMode !== undefined) profile.fitMode = fitMode;

  return profile;
}

function readSplatTuningFromLocation(profile: SplatTuningProfile | null): SplatTuning {
  const defaultTuning: SplatTuning = {
    scaleMultiplier: DEFAULT_SPLAT_SCALE_MULTIPLIER,
    rotationXDegrees: SPZ_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES,
    rotationYDegrees: 0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    fitMode: "auto",
    sources: {
      scaleMultiplier: "default",
      rotationXDegrees: "default",
      rotationYDegrees: "default",
      offsetX: "default",
      offsetY: "default",
      offsetZ: "default",
      fitMode: "default"
    },
    overrides: {
      scaleMultiplier: false,
      rotationXDegrees: false,
      rotationYDegrees: false,
      offsetX: false,
      offsetY: false,
      offsetZ: false,
      fitMode: false
    }
  };
  const tuning = applyProfileTuning(defaultTuning, profile);

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

  return tuning;
}

function readNumberParam(
  params: URLSearchParams,
  key: string,
  options: { minExclusive?: number } = {}
): number | undefined {
  const rawValue = params.get(key);
  if (rawValue === null) return undefined;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return undefined;
  if (options.minExclusive !== undefined && value <= options.minExclusive) return undefined;

  return value;
}

function readNumberValue(
  rawValue: unknown,
  options: { minExclusive?: number } = {}
): number | undefined {
  if (typeof rawValue !== "number") return undefined;
  if (!Number.isFinite(rawValue)) return undefined;
  if (options.minExclusive !== undefined && rawValue <= options.minExclusive) return undefined;

  return rawValue;
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
