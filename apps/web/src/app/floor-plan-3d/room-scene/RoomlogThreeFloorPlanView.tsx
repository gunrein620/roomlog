"use client";

// room-model이 계산한 3D 벽/가구 데이터를 React Three Fiber로 렌더링하고,
// 클릭 등 인터랙션 이벤트를 props 콜백으로 컨테이너에 돌려준다.

import { ContactShadows, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { FURNITURE_CATALOG, getFurnitureDimensions } from "../furniture-placement";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";

Array.from(new Set(FURNITURE_CATALOG.map((item) => item.modelUrl).filter((modelUrl): modelUrl is string => Boolean(modelUrl)))).forEach(
  (modelUrl) => useGLTF.preload(modelUrl)
);

function computeWallBoundsXZ(wallsData: WheretoputWall3D[]) {
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
}

function RoomFloor({
  onFloorPointerDown,
  onFloorPointerMove,
  wallsData
}: {
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onFloorPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  wallsData: WheretoputWall3D[];
}) {
  const bounds = useMemo(() => computeWallBoundsXZ(wallsData), [wallsData]);

  return (
    <mesh
      onPointerDown={onFloorPointerDown}
      onPointerMove={onFloorPointerMove}
      position={[bounds.centerX, 0, bounds.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
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
    <mesh
      onPointerDown={(event) => onPointerDown(furniture, event)}
      position={furniture.position}
      // 배치 대기(드래그 추적 중) 가구는 커서 아래 바닥의 pointer 이벤트를 가리지 않게 레이캐스트를 끈다.
      raycast={isPending ? () => null : undefined}
      rotation={furniture.rotation}
    >
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
      // 배치 대기 가구는 커서를 따라다니므로 바닥 pointer 이벤트를 가리지 않게 레이캐스트를 끈다.
      child.raycast = isPending ? () => undefined : THREE.Mesh.prototype.raycast;
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
  verticalScale?: number;
  isPending?: boolean;
  isSelected: boolean;
  onPointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
}) {
  const verticalScale = Math.max(0.1, props.verticalScale ?? 1);
  const mesh = !props.furniture.modelUrl ? (
    <FurnitureBoxMesh {...props} />
  ) : (
    <Suspense fallback={<FurnitureBoxMesh {...props} />}>
      <FurnitureGlbMesh {...props} />
    </Suspense>
  );

  if (verticalScale === 1) return mesh;

  return <group scale={[1, verticalScale, 1]}>{mesh}</group>;
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

function RoomOrbitControls({
  enabled = true,
  maxDistance = 42,
  minDistance = 5,
  target,
  zoomEnabled = true
}: {
  enabled?: boolean;
  maxDistance?: number;
  minDistance?: number;
  target: [number, number, number];
  /** false면 휠 줌 비활성 — 페이지 스크롤 흐름 속 뷰(상세 히어로)에서 휠을 뺏지 않게. */
  zoomEnabled?: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);

  return (
    <OrbitControls
      enableDamping
      enabled={enabled}
      enableZoom={zoomEnabled}
      makeDefault
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={minDistance}
      minPolarAngle={0.2}
      onChange={() => invalidate()}
      target={target}
    />
  );
}

// 방 크기에 맞춰 카메라 거리를 자동 계산 — 고정 카메라로는 작은 방이 점처럼,
// 큰 방이 화면 밖으로 나가므로, 진입/방 크기 변경 시 전체가 보이는 거리로 재배치한다.
function RoomCameraAutoFit({
  distanceScale = 1,
  wallsData
}: {
  /** 씬 그룹 스케일·여백 보정 배율 — 오토핏은 무스케일 벽 좌표로 계산하므로,
   *  horizontalScale로 방을 키운 뷰(상세 3D)는 그만큼 곱해 줘야 방이 화면에 작게 뜬다. */
  distanceScale?: number;
  wallsData: WheretoputWall3D[];
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const bounds = useMemo(() => computeWallBoundsXZ(wallsData), [wallsData]);
  // 벽을 조금 옮길 때마다 카메라가 튀지 않게, 0.5m 단위로 반올림한 크기가 바뀔 때만 재배치한다.
  const boundsKey = `${Math.round(bounds.centerX * 2)}:${Math.round(bounds.centerZ * 2)}:${Math.round(Math.max(bounds.width, bounds.height) * 2)}`;

  useEffect(() => {
    const longSide = Math.max(bounds.width, bounds.height);
    const distance = Math.min(40, Math.max(6, longSide * 1.5)) * distanceScale;
    camera.position.set(bounds.centerX + distance * 0.55, distance * 0.7, bounds.centerZ + distance * 0.85);
    camera.lookAt(bounds.centerX, 0, bounds.centerZ);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, camera, distanceScale, invalidate]);

  return null;
}

export function RoomlogThreeFloorPlanView({
  cameraPosition = [14, 12, 18],
  controlsEnabled = true,
  fitDistanceScale = 1,
  frameloop = "demand",
  furnitureData,
  furnitureVerticalScale = 1,
  hideHint = false,
  horizontalScale = 1,
  orbitMaxDistance = 42,
  orbitMinDistance = 5,
  orbitZoomEnabled = true,
  onFloorPointerDown,
  onFloorPointerMove,
  onFurniturePointerDown,
  onPendingCancel,
  onPendingConfirm,
  onPendingDelete,
  onPendingRotate,
  onWallPointerDown,
  pendingFurniture,
  sceneBackground = "#626260",
  selectedFurnitureId,
  selectedWallId,
  wallsData
}: {
  cameraPosition?: [number, number, number];
  // 가구 드래그 중 카메라 회전이 같이 돌지 않게 끄는 용도.
  controlsEnabled?: boolean;
  // 편집기는 "demand"(입력 시에만 렌더)로 효율적이지만, 읽기 전용 뷰어는
  // 드래그 전에도 방이 보여야 하므로 "always"를 넘겨 즉시·리사이즈 시 계속 렌더한다.
  frameloop?: "demand" | "always";
  /** 카메라 오토핏 거리 배율 — 1보다 크면 방이 화면 중앙에 더 작게 뜬다(상세 3D 히어로). */
  fitDistanceScale?: number;
  furnitureData: PlacedFurniture[];
  furnitureVerticalScale?: number;
  hideHint?: boolean;
  horizontalScale?: number;
  orbitMaxDistance?: number;
  orbitMinDistance?: number;
  /** 휠 줌 허용 여부 — 상세 히어로는 false(페이지 스크롤 우선). */
  orbitZoomEnabled?: boolean;
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  // 가구 드래그 이동용 — 바닥 위 커서 이동을 컨테이너에 전달한다.
  onFloorPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onFurniturePointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
  // 배치 대기 가구 머리 위 ✓/⟳/✕/삭제 버튼 — 필수 셋이 넘어올 때만 표시한다.
  onPendingCancel?: () => void;
  onPendingConfirm?: () => void;
  onPendingDelete?: () => void;
  onPendingRotate?: () => void;
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  pendingFurniture: PlacedFurniture | null;
  /** 캔버스 배경색 — null이면 투명(뒤 CSS 배경이 비친다, 상세 3D 히어로의 밤하늘용). */
  sceneBackground?: string | null;
  selectedFurnitureId: string | null;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  const sceneHorizontalScale = Math.max(0.1, horizontalScale);
  const wallBounds = computeWallBoundsXZ(wallsData);

  // dev(React StrictMode)에서 R3F의 초기 컨테이너 측정이 유실돼 캔버스가 300×150으로
  // 남고 씬이 그려지지 않는 경우가 있다. 마운트 직후 resize를 쏴서 재측정을 강제한다.
  useEffect(() => {
    const kick = () => window.dispatchEvent(new Event("resize"));
    const raf = window.requestAnimationFrame(kick);
    const timer = window.setTimeout(kick, 300);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="floor-plan-3d-preview" data-renderer="wheretoput 3D room renderer">
      <Canvas camera={{ fov: 50, position: cameraPosition }} dpr={[1, 2]} frameloop={frameloop}>
        <RoomCameraAutoFit distanceScale={fitDistanceScale} wallsData={wallsData} />
        {sceneBackground ? <color attach="background" args={[sceneBackground]} /> : null}
        <ambientLight intensity={0.72} />
        <directionalLight intensity={1.4} position={[6, 12, 8]} />
        <group scale={[sceneHorizontalScale, 1, sceneHorizontalScale]}>
          <RoomFloor onFloorPointerDown={onFloorPointerDown} onFloorPointerMove={onFloorPointerMove} wallsData={wallsData} />
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
              verticalScale={furnitureVerticalScale}
              isSelected={selectedFurnitureId === furniture.id}
              key={furniture.id}
              onPointerDown={onFurniturePointerDown}
            />
          ))}
          {pendingFurniture ? (
            <FurnitureMesh
              furniture={pendingFurniture}
              verticalScale={furnitureVerticalScale}
              isPending
              isSelected={false}
              onPointerDown={onFurniturePointerDown}
            />
          ) : null}
          {pendingFurniture && onPendingConfirm && onPendingRotate && onPendingCancel ? (
            <Html
              center
              position={[
                pendingFurniture.position[0],
                pendingFurniture.position[1] + getFurnitureDimensions(pendingFurniture).height * furnitureVerticalScale + 0.5,
                pendingFurniture.position[2]
              ]}
              zIndexRange={[30, 0]}
            >
              <div className="floor-plan-pending-actions">
                <button aria-label="배치완료" className="is-confirm" onClick={onPendingConfirm} title="배치완료" type="button">
                  ✓
                </button>
                <button aria-label="90도 회전" onClick={onPendingRotate} title="90도 회전" type="button">
                  ⟳
                </button>
                <button aria-label="배치 취소" className="is-cancel" onClick={onPendingCancel} title="취소 (재편집이면 원위치)" type="button">
                  ✕
                </button>
                {onPendingDelete ? (
                  <button aria-label="가구 삭제" className="is-delete" onClick={onPendingDelete} title="가구 삭제" type="button">
                    🗑
                  </button>
                ) : null}
              </div>
            </Html>
          ) : null}
        </group>
        <ContactShadows blur={2.4} far={6} opacity={0.28} position={[0, 0.015, 0]} resolution={512} scale={18 * sceneHorizontalScale} />
        <RoomOrbitControls
          enabled={controlsEnabled}
          maxDistance={orbitMaxDistance}
          minDistance={orbitMinDistance}
          target={[wallBounds.centerX * sceneHorizontalScale, 0, wallBounds.centerZ * sceneHorizontalScale]}
          zoomEnabled={orbitZoomEnabled}
        />
      </Canvas>
      {hideHint ? null : <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>}
    </div>
  );
}
