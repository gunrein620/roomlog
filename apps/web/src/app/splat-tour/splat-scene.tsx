"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { SparkRenderer as SparkRendererObject, SplatMesh as SplatMeshObject } from "@sparkjsdev/spark";
import { Vector3 } from "three";

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

interface SplatTuning {
  scaleMultiplier: number;
  rotationXDegrees: number;
  centerY: number;
  overrides: {
    scaleMultiplier: boolean;
    rotationXDegrees: boolean;
    centerY: boolean;
  };
}

interface SplatFitInfo {
  scale: number;
  scaleReason: "bbox" | "min-guard" | "max-guard" | "fallback";
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

        const tuning = readSplatTuningFromLocation();
        const fitInfo = fitSplatToDemoRoom(nextSplatMesh, tuning);
        console.info("[splat-tour] applied splat transform", {
          src,
          rotationXDegrees: tuning.rotationXDegrees,
          scaleMultiplier: tuning.scaleMultiplier,
          centerY: tuning.centerY,
          scale: fitInfo.scale,
          scaleReason: fitInfo.scaleReason,
          rawScale: fitInfo.rawScale,
          maxDimension: fitInfo.maxDimension,
          size: fitInfo.size,
          center: fitInfo.center,
          overrides: tuning.overrides
        });
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
  applySplatRotationX(splatMesh, tuning.rotationXDegrees);
  splatMesh.updateMatrixWorld(true);

  const box = splatMesh.getBoundingBox(true).clone().applyMatrix4(splatMesh.matrixWorld);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const targetCenter = { ...DEFAULT_SPLAT_CENTER, y: tuning.centerY };

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

function applySplatRotationX(splatMesh: SplatMeshObject, degrees: number) {
  if (degrees === SPZ_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES) {
    splatMesh.quaternion.set(1, 0, 0, 0);
    return;
  }

  const radians = (degrees * Math.PI) / 180;
  splatMesh.quaternion.set(Math.sin(radians / 2), 0, 0, Math.cos(radians / 2));
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

function readSplatTuningFromLocation(): SplatTuning {
  const defaultTuning: SplatTuning = {
    scaleMultiplier: DEFAULT_SPLAT_SCALE_MULTIPLIER,
    rotationXDegrees: SPZ_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES,
    centerY: DEFAULT_SPLAT_CENTER.y,
    overrides: {
      scaleMultiplier: false,
      rotationXDegrees: false,
      centerY: false
    }
  };

  if (typeof window === "undefined") {
    return defaultTuning;
  }

  const params = new URLSearchParams(window.location.search);
  const scaleMultiplier = readNumberParam(params, "splatScale", { minExclusive: 0 });
  const rotationXDegrees = readNumberParam(params, "splatRotX");
  const centerY = readNumberParam(params, "splatY");

  return {
    scaleMultiplier: scaleMultiplier ?? defaultTuning.scaleMultiplier,
    rotationXDegrees: rotationXDegrees ?? defaultTuning.rotationXDegrees,
    centerY: centerY ?? defaultTuning.centerY,
    overrides: {
      scaleMultiplier: scaleMultiplier !== undefined,
      rotationXDegrees: rotationXDegrees !== undefined,
      centerY: centerY !== undefined
    }
  };
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
