"use client";

// 가구 1점의 3D 미리보기 — meshUrl 있으면 GLB 로드, 없거나 로드 실패하면 sizeMm 기준 회색 박스.
// 로딩/에셋 패턴은 splat-tour/splat-furniture-layer.tsx · floor-plan-3d/room-scene의
// useGLTF + Suspense(fallback=박스) 관례를 그대로 따른다. 새 npm 의존성 없음.
// 박스는 표시 전용이며, 배치 충돌 판정의 권위(sizeMm)는 여전히 placement-model.ts/collision.ts가 갖는다.

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { TenantFurniture } from "@roomlog/types/tenant-furniture";
import { getFurnitureDimensions } from "@/app/floor-plan-3d/furniture-placement";
import styles from "./furniture.module.css";

function dimensionsMeters(furniture: TenantFurniture) {
  return getFurnitureDimensions({
    length: [furniture.sizeMm.width, furniture.sizeMm.height, furniture.sizeMm.depth],
    scale: 1
  });
}

function BoxMesh({ furniture }: { furniture: TenantFurniture }) {
  const { width, height, depth } = dimensionsMeters(furniture);

  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color="#9a95b0" roughness={0.85} />
    </mesh>
  );
}

function GlbMesh({ furniture }: { furniture: TenantFurniture }) {
  const gltf = useGLTF(furniture.meshUrl ?? "");
  const invalidate = useThree((state) => state.invalidate);
  const { width, height, depth } = dimensionsMeters(furniture);

  const { modelMinY, modelSize, scene } = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }
    });
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());

    return { modelMinY: box.min.y, modelSize: size, scene: clonedScene };
  }, [gltf.scene]);

  const { modelOffsetY, scale } = useMemo(() => {
    const actualWidth = Math.max(modelSize.x, 0.001);
    const actualHeight = Math.max(modelSize.y, 0.001);
    const actualDepth = Math.max(modelSize.z, 0.001);
    const modelScale: [number, number, number] = [width / actualWidth, height / actualHeight, depth / actualDepth];

    return { modelOffsetY: -modelMinY * modelScale[1], scale: modelScale };
  }, [depth, height, modelMinY, modelSize.x, modelSize.y, modelSize.z, width]);

  useEffect(() => {
    invalidate();
  }, [invalidate, scene]);

  return <primitive object={scene} position={[0, modelOffsetY, 0]} scale={scale} />;
}

type BoundaryProps = { children: ReactNode; fallback: ReactNode };
type BoundaryState = { failed: boolean };

/** useGLTF 로드가 실패(네트워크/파싱 오류)하면 Suspense가 아니라 여기서 잡아 박스로 대체한다. */
class MeshLoadBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[tenant-furniture] GLB 로드 실패, 박스로 대체합니다.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FurnitureMesh({ furniture }: { furniture: TenantFurniture }) {
  if (!furniture.meshUrl) {
    return <BoxMesh furniture={furniture} />;
  }

  return (
    <MeshLoadBoundary fallback={<BoxMesh furniture={furniture} />}>
      <Suspense fallback={<BoxMesh furniture={furniture} />}>
        <GlbMesh furniture={furniture} />
      </Suspense>
    </MeshLoadBoundary>
  );
}

export function FurniturePreview3D({ furniture }: { furniture: TenantFurniture }) {
  const { width, height, depth } = dimensionsMeters(furniture);
  const radius = Math.max(width, height, depth, 0.2);
  const cameraDistance = radius * 2.6;

  return (
    <div className={styles.preview3d} aria-hidden="true">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [cameraDistance * 0.85, cameraDistance * 0.75, cameraDistance], fov: 30 }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[radius * 2, radius * 3, radius * 2]} intensity={1.1} />
        <group position={[0, -height / 2, 0]}>
          <FurnitureMesh furniture={furniture} />
        </group>
      </Canvas>
    </div>
  );
}
