"use client";

// room-model이 계산한 3D 벽/가구 데이터를 React Three Fiber로 렌더링하고,
// 클릭 등 인터랙션 이벤트를 props 콜백으로 컨테이너에 돌려준다.

import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { FURNITURE_CATALOG, getFurnitureDimensions } from "../room-model/furniture-model";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";

function RoomFloor({
  onFloorPointerDown,
  wallsData
}: {
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  wallsData: WheretoputWall3D[];
}) {
  const bounds = useMemo(() => {
    if (wallsData.length === 0) {
      return { centerX: 0, centerZ: 0, height: 8, width: 8 };
    }

    const points = wallsData.flatMap((wall) => {
      const half = wall.dimensions.width / 2;
      const angle = wall.rotation[1];
      return [
        {
          x: wall.position[0] - Math.cos(angle) * half,
          z: wall.position[2] - Math.sin(angle) * half
        },
        {
          x: wall.position[0] + Math.cos(angle) * half,
          z: wall.position[2] + Math.sin(angle) * half
        }
      ];
    });
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minZ = Math.min(...points.map((point) => point.z));
    const maxZ = Math.max(...points.map((point) => point.z));

    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      height: Math.max(0.5, maxZ - minZ - 0.1),
      width: Math.max(0.5, maxX - minX - 0.1)
    };
  }, [wallsData]);

  return (
    <mesh onPointerDown={onFloorPointerDown} position={[bounds.centerX, 0, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[bounds.width, bounds.height]} />
      <meshBasicMaterial color="#f3d9a0" />
    </mesh>
  );
}

function FurnitureBoxMesh({
  furniture,
  isPending = false,
  isSelected,
  onPointerDown
}: {
  furniture: PlacedFurniture;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  const dimensions = getFurnitureDimensions(furniture);

  return (
    <mesh
      onPointerDown={(event) => onPointerDown(furniture, event)}
      position={furniture.position}
      rotation={furniture.rotation}
      receiveShadow
      castShadow
    >
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshBasicMaterial
        color={isSelected ? "#2f55ff" : furniture.color}
        opacity={isPending ? 0.42 : isSelected ? 0.96 : 0.86}
        transparent
      />
    </mesh>
  );
}

function FurnitureGlbMesh({
  furniture,
  isPending = false,
  isSelected,
  onPointerDown
}: {
  furniture: PlacedFurniture;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  const gltf = useGLTF(furniture.modelUrl ?? FURNITURE_CATALOG[0].modelUrl ?? "");
  const dimensions = getFurnitureDimensions(furniture);
  const { modelOffsetY, scene, scale } = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.castShadow = true;
      child.receiveShadow = true;

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        material.transparent = isPending;
        material.opacity = isPending ? 0.48 : 1;
        material.needsUpdate = true;
      });
    });

    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());
    const actualWidth = Math.max(size.x, 0.001);
    const actualHeight = Math.max(size.y, 0.001);
    const actualDepth = Math.max(size.z, 0.001);
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
      modelOffsetY: -box.min.y * modelScale[1],
      scale: modelScale,
      scene: clonedScene
    };
  }, [dimensions.depth, dimensions.height, dimensions.width, furniture.modelUrl, gltf.scene, isPending]);

  return (
    <group
      onPointerDown={(event) => onPointerDown(furniture, event)}
      position={[furniture.position[0], 0, furniture.position[2]]}
      rotation={furniture.rotation}
    >
      <primitive object={scene} position={[0, modelOffsetY, 0]} scale={scale} />
      {isSelected ? (
        <mesh position={[0, dimensions.height / 2, 0]}>
          <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
          <meshBasicMaterial color="#2f55ff" opacity={0.4} transparent wireframe />
        </mesh>
      ) : null}
    </group>
  );
}

function FurnitureMesh(props: {
  furniture: PlacedFurniture;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  if (!props.furniture.modelUrl) {
    return <FurnitureBoxMesh {...props} />;
  }

  return (
    <Suspense fallback={<FurnitureBoxMesh {...props} />}>
      <FurnitureGlbMesh {...props} />
    </Suspense>
  );
}

function WallMesh({
  isSelected,
  onPointerDown,
  wall
}: {
  isSelected: boolean;
  onPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  wall: WheretoputWall3D;
}) {
  return (
    <mesh
      onPointerDown={(event) => onPointerDown(wall, event)}
      position={wall.position}
      rotation={wall.rotation}
      receiveShadow
      castShadow
    >
      <boxGeometry args={[wall.dimensions.width, wall.dimensions.height, wall.dimensions.depth]} />
      <meshBasicMaterial color={isSelected ? "#2f55ff" : "#eeeeec"} opacity={isSelected ? 0.92 : 0.78} transparent />
    </mesh>
  );
}

export function RoomlogThreeFloorPlanView({
  furnitureData,
  onFloorPointerDown,
  onFurniturePointerDown,
  onWallPointerDown,
  pendingFurniture,
  selectedFurnitureId,
  selectedWallId,
  wallsData
}: {
  furnitureData: PlacedFurniture[];
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onFurniturePointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  pendingFurniture: PlacedFurniture | null;
  selectedFurnitureId: string | null;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  return (
    <div className="floor-plan-3d-preview" data-renderer="wheretoput 3D room renderer">
      <Canvas camera={{ fov: 50, position: [14, 12, 18] }} shadows>
        <color attach="background" args={["#626260"]} />
        <ambientLight intensity={0.72} />
        <directionalLight castShadow intensity={1.4} position={[6, 12, 8]} />
        <RoomFloor onFloorPointerDown={onFloorPointerDown} wallsData={wallsData} />
        {wallsData.map((wall) => (
          <WallMesh
            isSelected={String(selectedWallId ?? "") === String(wall.wall_id)}
            key={wall.id}
            onPointerDown={onWallPointerDown}
            wall={wall}
          />
        ))}
        {furnitureData.map((furniture) => (
          <FurnitureMesh
            furniture={furniture}
            isSelected={selectedFurnitureId === furniture.id}
            key={furniture.id}
            onPointerDown={onFurniturePointerDown}
          />
        ))}
        {pendingFurniture ? (
          <FurnitureMesh furniture={pendingFurniture} isPending isSelected={false} onPointerDown={onFurniturePointerDown} />
        ) : null}
        <OrbitControls
          enableDamping
          makeDefault
          maxDistance={42}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={5}
          minPolarAngle={0.2}
          target={[0, 0, 0]}
        />
      </Canvas>
      <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>
    </div>
  );
}
