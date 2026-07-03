"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { SparkRenderer as SparkRendererObject, SplatMesh as SplatMeshObject } from "@sparkjsdev/spark";

// 약 3m(가로) × 4m(세로), 층고 2.4m 원룸. 바닥 중앙이 원점.
const ROOM = { width: 3, depth: 4, height: 2.4, thickness: 0.06 };

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

        fitSplatToDemoRoom(nextSplatMesh);
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

function fitSplatToDemoRoom(splatMesh: SplatMeshObject) {
  const box = splatMesh.getBoundingBox(true);
  const size = box.getSize(splatMesh.position.clone());
  const center = box.getCenter(splatMesh.position.clone());
  const maxDimension = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    splatMesh.position.set(0, ROOM.height / 2, -0.5);
    return;
  }

  const scale = 2.7 / maxDimension;
  const targetCenter = { x: 0, y: ROOM.height / 2, z: -0.5 };

  splatMesh.scale.setScalar(scale);
  splatMesh.position.set(
    targetCenter.x - center.x * scale,
    targetCenter.y - center.y * scale,
    targetCenter.z - center.z * scale
  );
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
