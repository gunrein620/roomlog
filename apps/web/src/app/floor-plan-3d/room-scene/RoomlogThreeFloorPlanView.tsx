"use client";

// room-model이 계산한 3D 벽/가구 데이터를 React Three Fiber로 렌더링하고,
// 클릭 등 인터랙션 이벤트를 props 콜백으로 컨테이너에 돌려준다.

import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { FURNITURE_CATALOG, getFurnitureDimensions } from "../furniture-placement";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";

Array.from(new Set(FURNITURE_CATALOG.map((item) => item.modelUrl).filter((modelUrl): modelUrl is string => Boolean(modelUrl)))).forEach(
  (modelUrl) => useGLTF.preload(modelUrl)
);

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
    <mesh onPointerDown={onFloorPointerDown} position={[bounds.centerX, 0, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[bounds.width, bounds.height]} />
      <meshLambertMaterial color="#f3d9a0" />
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
    <mesh onPointerDown={(event) => onPointerDown(furniture, event)} position={furniture.position} rotation={furniture.rotation}>
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshLambertMaterial
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
  const modelUrl = furniture.modelUrl ?? FURNITURE_CATALOG[0].modelUrl ?? "";
  const gltf = useGLTF(modelUrl);
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
  }, [gltf.scene, modelUrl]);

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
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        material.transparent = isPending;
        material.opacity = isPending ? 0.48 : 1;
        material.needsUpdate = true;
      });
    });
    invalidate();
  }, [invalidate, isPending, scene]);

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
          <meshLambertMaterial color="#2f55ff" opacity={0.4} transparent wireframe />
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
    <mesh onPointerDown={(event) => onPointerDown(wall, event)} position={wall.position} rotation={wall.rotation}>
      <boxGeometry args={[wall.dimensions.width, wall.dimensions.height, wall.dimensions.depth]} />
      <meshLambertMaterial color={isSelected ? "#2f55ff" : "#eeeeec"} />
    </mesh>
  );
}

function RoomOrbitControls({ maxDistance = 42, minDistance = 5 }: { maxDistance?: number; minDistance?: number }) {
  const invalidate = useThree((state) => state.invalidate);

  return (
    <OrbitControls
      enableDamping
      makeDefault
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={minDistance}
      minPolarAngle={0.2}
      onChange={() => invalidate()}
      target={[0, 0, 0]}
    />
  );
}

export function RoomlogThreeFloorPlanView({
  cameraPosition = [14, 12, 18],
  frameloop = "demand",
  furnitureData,
  hideHint = false,
  horizontalScale = 1,
  orbitMaxDistance = 42,
  orbitMinDistance = 5,
  onFloorPointerDown,
  onFurniturePointerDown,
  onWallPointerDown,
  pendingFurniture,
  selectedFurnitureId,
  selectedWallId,
  wallsData
}: {
  cameraPosition?: [number, number, number];
  // 편집기는 "demand"(입력 시에만 렌더)로 효율적이지만, 읽기 전용 뷰어는
  // 드래그 전에도 방이 보여야 하므로 "always"를 넘겨 즉시·리사이즈 시 계속 렌더한다.
  frameloop?: "demand" | "always";
  furnitureData: PlacedFurniture[];
  hideHint?: boolean;
  horizontalScale?: number;
  orbitMaxDistance?: number;
  orbitMinDistance?: number;
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onFurniturePointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  pendingFurniture: PlacedFurniture | null;
  selectedFurnitureId: string | null;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  const sceneHorizontalScale = Math.max(0.1, horizontalScale);

  return (
    <div className="floor-plan-3d-preview" data-renderer="wheretoput 3D room renderer">
      <Canvas camera={{ fov: 50, position: cameraPosition }} dpr={[1, 2]} frameloop={frameloop}>
        <color attach="background" args={["#626260"]} />
        <ambientLight intensity={0.72} />
        <directionalLight intensity={1.4} position={[6, 12, 8]} />
        <group scale={[sceneHorizontalScale, 1, sceneHorizontalScale]}>
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
        </group>
        <ContactShadows blur={2.4} far={6} opacity={0.28} position={[0, 0.015, 0]} resolution={512} scale={18 * sceneHorizontalScale} />
        <RoomOrbitControls maxDistance={orbitMaxDistance} minDistance={orbitMinDistance} />
      </Canvas>
      {hideHint ? null : <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>}
    </div>
  );
}
