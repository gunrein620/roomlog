"use client";

// 월드=도면 프레임(미터)이므로 가구는 무변환 배치.
// splat 쪽이 정합 변환을 받는다(splat-scene.tsx tuningFromTransform).

import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { getFurnitureDimensions } from "../floor-plan-3d/furniture-placement";
import type { PlacedFurniture } from "../floor-plan-3d/room-model/types";

function SplatFurnitureBoxMesh({ furniture }: { furniture: PlacedFurniture }) {
  const dimensions = getFurnitureDimensions(furniture);

  return (
    <group position={[furniture.position[0], 0, furniture.position[2]]} rotation={furniture.rotation}>
      <mesh position={[0, dimensions.height / 2, 0]}>
        <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
        <meshLambertMaterial color={furniture.color} opacity={0.48} transparent />
      </mesh>
    </group>
  );
}

function SplatFurnitureGlbMesh({ furniture }: { furniture: PlacedFurniture }) {
  const gltf = useGLTF(furniture.modelUrl ?? "");
  const invalidate = useThree((state) => state.invalidate);
  const dimensions = getFurnitureDimensions(furniture);
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

    return {
      modelMinY: box.min.y,
      modelSize: size,
      scene: clonedScene
    };
  }, [gltf.scene]);

  const { modelOffsetY, scale } = useMemo(() => {
    const actualWidth = Math.max(modelSize.x, 0.001);
    const actualHeight = Math.max(modelSize.y, 0.001);
    const actualDepth = Math.max(modelSize.z, 0.001);
    const targetLongSide = Math.max(dimensions.width, dimensions.depth);
    const targetShortSide = Math.min(dimensions.width, dimensions.depth);
    const [targetWidth, targetDepth] =
      actualWidth >= actualDepth ? [targetLongSide, targetShortSide] : [targetShortSide, targetLongSide];
    const modelScale: [number, number, number] = [
      targetWidth / actualWidth,
      dimensions.height / actualHeight,
      targetDepth / actualDepth
    ];

    return {
      modelOffsetY: -modelMinY * modelScale[1],
      scale: modelScale
    };
  }, [dimensions.depth, dimensions.height, dimensions.width, modelMinY, modelSize.x, modelSize.y, modelSize.z]);

  useEffect(() => {
    invalidate();
  }, [invalidate, scene]);

  return (
    <group position={[furniture.position[0], 0, furniture.position[2]]} rotation={furniture.rotation}>
      <primitive object={scene} position={[0, modelOffsetY, 0]} scale={scale} />
    </group>
  );
}

function SplatFurnitureMesh({ furniture }: { furniture: PlacedFurniture }) {
  if (!furniture.modelUrl) {
    return <SplatFurnitureBoxMesh furniture={furniture} />;
  }

  return (
    <Suspense fallback={<SplatFurnitureBoxMesh furniture={furniture} />}>
      <SplatFurnitureGlbMesh furniture={furniture} />
    </Suspense>
  );
}

/** Canvas 안에서 도면 좌표 그대로 가구를 렌더하는 표시 전용 레이어. 인터랙션 없음. */
export function SplatFurnitureLayer({ furnitures }: { furnitures: readonly PlacedFurniture[] }) {
  return (
    <group>
      {furnitures.map((furniture) => (
        <SplatFurnitureMesh key={furniture.id} furniture={furniture} />
      ))}
    </group>
  );
}
