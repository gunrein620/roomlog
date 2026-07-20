"use client";

// 월드=도면 프레임(미터)이므로 가구는 무변환 배치.
// splat 쪽이 정합 변환을 받는다(splat-scene.tsx tuningFromTransform).

import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { getFurnitureDimensions } from "../floor-plan-3d/furniture-placement";
import type { PlacedFurniture } from "../floor-plan-3d/room-model/types";
import { anchorMeshOffset, checkMeshScaleSanity } from "../tenant/furniture/mesh-anchor";

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
  const { modelBounds, modelMinY, modelSize, scene } = useMemo(() => {
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
    const bounds = { min: box.min.toArray(), max: box.max.toArray() } as {
      min: [number, number, number];
      max: [number, number, number];
    };

    return {
      modelBounds: bounds,
      modelMinY: box.min.y,
      modelSize: size,
      scene: clonedScene
    };
  }, [gltf.scene]);

  const { modelOffset, scale } = useMemo<{
    modelOffset: [number, number, number];
    scale: [number, number, number];
  }>(() => {
    if (furniture.source === "object-capture") {
      // Object Capture는 이미 실측 미터라 fit-to-box로 리스케일하면 축별 비균등 스케일로 형태가 찌그러진다.
      // 네이티브 스케일 1을 유지하고 런타임 bbox로 앵커(발자국 중심·바닥)만 재보정한다.
      // sanity check는 sizeMm(밀리미터)이 있을 때만 돌린다. length[]는 씬 단위(미터급)라 폴백으로
      // 넣으면 1000배 어긋나 헛경고만 쏟아진다 — 타입이 둘 다 number라 빌드·타입체크로 안 걸린다.
      // 치수 출처가 없으면 검사를 건너뛴다("없는 데이터로 가짜 검사"보다 검사 안 함이 정직하다).
      const expectedHeightMm = furniture.sizeMm?.height;
      if (expectedHeightMm !== undefined) {
        const warning = checkMeshScaleSanity(modelBounds, {
          width: furniture.sizeMm?.width ?? 0,
          height: expectedHeightMm,
          depth: furniture.sizeMm?.depth ?? 0
        });
        if (warning) {
          console.warn(`[tenant-furniture] ${warning} furnitureId=${furniture.id}`);
        }
      }

      return {
        modelOffset: anchorMeshOffset(modelBounds),
        scale: [1, 1, 1]
      };
    }

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
      modelOffset: [0, -modelMinY * modelScale[1], 0],
      scale: modelScale
    };
  }, [
    dimensions.depth,
    dimensions.height,
    dimensions.width,
    furniture.id,
    furniture.length,
    furniture.sizeMm,
    furniture.source,
    modelBounds,
    modelMinY,
    modelSize.x,
    modelSize.y,
    modelSize.z
  ]);

  useEffect(() => {
    invalidate();
  }, [invalidate, scene]);

  return (
    <group position={[furniture.position[0], 0, furniture.position[2]]} rotation={furniture.rotation}>
      <primitive object={scene} position={modelOffset} scale={scale} />
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
