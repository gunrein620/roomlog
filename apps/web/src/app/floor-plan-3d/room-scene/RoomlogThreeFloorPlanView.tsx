"use client";

// room-model이 계산한 3D 벽/가구 데이터를 React Three Fiber로 렌더링하고,
// 클릭 등 인터랙션 이벤트를 props 콜백으로 컨테이너에 돌려준다.

import { ContactShadows, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Check, Move, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { FURNITURE_CATALOG, getFurnitureDimensions } from "../furniture-placement";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import { createMitunetSceneLayout, type MitunetSceneLayout, type MitunetScenePolygon } from "./mitunet-geometry";
import {
  calculateMitunetGroundBounds,
  calculateMitunetTexturePlane,
  MITUNET_RENDER_STYLE
} from "./mitunet-surfaces";
import { MitunetGtaoEffects } from "./mitunet-postprocessing";
import { createConcreteTexture, createFloorTexture } from "./mitunet-textures";

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
  boundsOverride,
  interactionOnly = false,
  onFloorPointerDown,
  onFloorPointerMove,
  wallsData
}: {
  boundsOverride?: ReturnType<typeof computeWallBoundsXZ>;
  interactionOnly?: boolean;
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onFloorPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  wallsData: WheretoputWall3D[];
}) {
  const computedBounds = useMemo(() => computeWallBoundsXZ(wallsData), [wallsData]);
  const bounds = boundsOverride ?? computedBounds;

  return (
    <mesh
      onPointerDown={onFloorPointerDown}
      onPointerMove={onFloorPointerMove}
      position={[bounds.centerX, 0, bounds.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[bounds.width, bounds.height]} />
      <meshLambertMaterial
        color="#f3d9a0"
        depthWrite={!interactionOnly}
        opacity={interactionOnly ? 0 : 1}
        transparent={interactionOnly}
      />
    </mesh>
  );
}

function mitunetShape(polygon: MitunetScenePolygon) {
  const shape = new THREE.Shape();
  polygon.outer.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  polygon.holes.forEach((ring) => {
    const hole = new THREE.Path();
    ring.forEach(([x, z], index) => {
      if (index === 0) hole.moveTo(x, -z);
      else hole.lineTo(x, -z);
    });
    hole.closePath();
    shape.holes.push(hole);
  });
  return shape;
}

function MitunetExtrudedLayer({
  height,
  polygons,
  surface,
  y = 0
}: {
  height: number;
  polygons: MitunetScenePolygon[];
  surface: "wall" | "glass";
  y?: number;
}) {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(polygons.map(mitunetShape), { bevelEnabled: false, depth: height, steps: 1 }),
    [height, polygons]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (polygons.length === 0) return null;

  return (
    <mesh castShadow geometry={geometry} position={[0, y, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      {surface === "wall" ? (
        <>
          <meshStandardMaterial
            attach="material-0"
            color={MITUNET_RENDER_STYLE.wallCap}
            metalness={0}
            roughness={0.88}
          />
          <meshStandardMaterial
            attach="material-1"
            color={MITUNET_RENDER_STYLE.wallSide}
            metalness={0}
            roughness={0.82}
          />
        </>
      ) : (
        <meshPhysicalMaterial
          color={MITUNET_RENDER_STYLE.glass}
          ior={1.45}
          metalness={0}
          opacity={0.72}
          roughness={0.08}
          transmission={0.12}
          transparent
        />
      )}
    </mesh>
  );
}

// Heights mirror the MitUNet viewer (viewer/index.html): an uncalibrated plan has
// no real-world scale, so it renders as a low scaled-down model rather than
// full-height walls. Keep both renderers in step.
const WALL_HEIGHT = 0.55;
const WINDOW_SILL = 0.16;
const WINDOW_TOP = 0.45;
const PHYSICAL_WALL_HEIGHT = 2.7;
const PHYSICAL_WINDOW_SILL = 0.9;
const PHYSICAL_WINDOW_TOP = 2.1;

function MitunetFloorPlanMeshes({ layout }: { layout: MitunetSceneLayout }) {
  const { hasPhysicalScale } = layout;
  const wallHeight = hasPhysicalScale ? PHYSICAL_WALL_HEIGHT : WALL_HEIGHT;
  const windowSill = hasPhysicalScale ? PHYSICAL_WINDOW_SILL : WINDOW_SILL;
  const windowTop = hasPhysicalScale ? PHYSICAL_WINDOW_TOP : WINDOW_TOP;

  return (
    <>
      <MitunetExtrudedLayer height={wallHeight} polygons={layout.wall} surface="wall" />
      {/* Doors stay fully open — no header wall above the opening. */}
      {/* Windows: the cut runs full height, so restore wall below the sill and above
          the lintel, leaving glass only in between. */}
      <MitunetExtrudedLayer height={windowSill} polygons={layout.window} surface="wall" />
      <MitunetExtrudedLayer
        height={windowTop - windowSill}
        polygons={layout.window}
        surface="glass"
        y={windowSill}
      />
      <MitunetExtrudedLayer
        height={wallHeight - windowTop}
        polygons={layout.window}
        surface="wall"
        y={windowTop}
      />
    </>
  );
}

function MitunetSceneLook({ active }: { active: boolean }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (!active) return;

    const previousEnvironment = scene.environment;
    const previousFog = scene.fog;
    const previousOutputColorSpace = gl.outputColorSpace;
    const previousShadowEnabled = gl.shadowMap.enabled;
    const previousShadowType = gl.shadowMap.type;
    const previousToneMapping = gl.toneMapping;
    const previousToneMappingExposure = gl.toneMappingExposure;
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);

    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    scene.environment = environmentTarget.texture;
    scene.fog = new THREE.Fog(MITUNET_RENDER_STYLE.background, 34, 90);
    invalidate();

    return () => {
      scene.environment = previousEnvironment;
      scene.fog = previousFog;
      gl.outputColorSpace = previousOutputColorSpace;
      gl.shadowMap.enabled = previousShadowEnabled;
      gl.shadowMap.type = previousShadowType;
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousToneMappingExposure;
      environmentTarget.dispose();
      pmremGenerator.dispose();
      invalidate();
    };
  }, [active, gl, invalidate, scene]);

  if (!active) {
    return (
      <>
        <ambientLight intensity={0.72} />
        <directionalLight intensity={1.4} position={[6, 12, 8]} />
      </>
    );
  }

  return (
    <>
      <hemisphereLight color={0xffffff} groundColor={0xece8e1} intensity={0.35} />
      <directionalLight
        castShadow
        intensity={1.6}
        position={[6, 12, 5]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-bottom={-8}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-near={0.5}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <ambientLight intensity={0.08} />
      <directionalLight intensity={0.7} position={[0, -6, 0]} />
    </>
  );
}

function MitunetDecorativeFloor({
  layout,
  plan
}: {
  layout: MitunetSceneLayout;
  plan: MitunetFloorPlan;
}) {
  const ground = useMemo(() => calculateMitunetGroundBounds(layout.bounds), [layout]);
  const texturePlane = useMemo(() => calculateMitunetTexturePlane(plan, layout), [layout, plan]);
  const concreteTexture = useMemo(
    () => createConcreteTexture(ground.width, ground.depth),
    [ground.depth, ground.width]
  );
  const woodTexture = useMemo(() => {
    try {
      return createFloorTexture(plan);
    } catch {
      return null;
    }
  }, [plan]);

  useEffect(() => () => concreteTexture?.dispose(), [concreteTexture]);
  useEffect(() => () => woodTexture?.dispose(), [woodTexture]);

  return (
    <>
      <mesh
        position={[ground.centerX, -0.01, ground.centerZ]}
        raycast={() => null}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[ground.width, ground.depth]} />
        <meshStandardMaterial
          color={0xffffff}
          map={concreteTexture ?? undefined}
          metalness={0}
          roughness={0.96}
        />
      </mesh>
      {woodTexture ? (
        <mesh
          position={[texturePlane.centerX, 0.004, texturePlane.centerZ]}
          raycast={() => null}
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[texturePlane.width, texturePlane.depth]} />
          <meshStandardMaterial
            alphaTest={0.01}
            depthWrite={false}
            map={woodTexture}
            metalness={0}
            roughness={0.82}
            transparent
          />
        </mesh>
      ) : null}
    </>
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
      // y = 저장된 장착/적층 높이(씬 단위). 바닥 가구는 ≈0이고, 벽걸이·탁자 위 소품은
      // 뷰어에서 계산한 높이가 그대로 들어와 매물 3D에서도 같은 위치에 뜬다.
      position={[furniture.position[0], furniture.position[1], furniture.position[2]]}
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
  target
}: {
  enabled?: boolean;
  maxDistance?: number;
  minDistance?: number;
  target: [number, number, number];
}) {
  const invalidate = useThree((state) => state.invalidate);

  return (
    <OrbitControls
      enableDamping
      enabled={enabled}
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
function RoomCameraAutoFit({ bounds }: { bounds: ReturnType<typeof computeWallBoundsXZ> }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  // 벽을 조금 옮길 때마다 카메라가 튀지 않게, 0.5m 단위로 반올림한 크기가 바뀔 때만 재배치한다.
  const boundsKey = `${Math.round(bounds.centerX * 2)}:${Math.round(bounds.centerZ * 2)}:${Math.round(Math.max(bounds.width, bounds.height) * 2)}`;

  useEffect(() => {
    const longSide = Math.max(bounds.width, bounds.height);
    const distance = Math.min(40, Math.max(6, longSide * 1.5));
    camera.position.set(bounds.centerX + distance * 0.55, distance * 0.7, bounds.centerZ + distance * 0.85);
    camera.lookAt(bounds.centerX, 0, bounds.centerZ);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, camera, invalidate]);

  return null;
}

export function RoomlogThreeFloorPlanView({
  cameraPosition = [14, 12, 18],
  controlsEnabled = true,
  frameloop = "demand",
  furnitureData,
  furnitureVerticalScale = 1,
  hideHint = false,
  horizontalScale = 1,
  mitunetPlan,
  orbitMaxDistance = 42,
  orbitMinDistance = 5,
  onFloorPointerDown,
  onFloorPointerMove,
  onFurniturePointerDown,
  onPendingCancel,
  onPendingConfirm,
  onSelectedDelete,
  onSelectedMove,
  onSelectedRotateLeft,
  onSelectedRotateRight,
  onWallPointerDown,
  pendingFurniture,
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
  furnitureData: PlacedFurniture[];
  furnitureVerticalScale?: number;
  hideHint?: boolean;
  horizontalScale?: number;
  mitunetPlan?: MitunetFloorPlan;
  orbitMaxDistance?: number;
  orbitMinDistance?: number;
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  // 가구 드래그 이동용 — 바닥 위 커서 이동을 컨테이너에 전달한다.
  onFloorPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onFurniturePointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
  // 배치 중에는 취소/완료, 선택 중에는 이동/양방향 회전/삭제 버튼을 표시한다.
  onPendingCancel?: () => void;
  onPendingConfirm?: () => void;
  // 읽기 전용 투어의 기존 호출부 호환용이며 편집 도구에는 표시하지 않는다.
  onPendingDelete?: () => void;
  onPendingRotate?: () => void;
  onSelectedDelete?: () => void;
  onSelectedMove?: () => void;
  onSelectedRotateLeft?: () => void;
  onSelectedRotateRight?: () => void;
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  pendingFurniture: PlacedFurniture | null;
  selectedFurnitureId: string | null;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  const sceneHorizontalScale = Math.max(0.1, horizontalScale);
  const mitunetLayout = useMemo(() => mitunetPlan ? createMitunetSceneLayout(mitunetPlan) : null, [mitunetPlan]);
  const wallBounds = mitunetLayout
    ? {
        centerX: mitunetLayout.bounds.centerX,
        centerZ: mitunetLayout.bounds.centerZ,
        width: mitunetLayout.bounds.width,
        height: mitunetLayout.bounds.depth
      }
    : computeWallBoundsXZ(wallsData);
  const hasMitunetStyle = Boolean(mitunetLayout && mitunetPlan);
  const selectedFurniture = furnitureData.find((furniture) => furniture.id === selectedFurnitureId) ?? null;

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
    <div
      className="floor-plan-3d-preview"
      data-renderer="wheretoput 3D room renderer"
      // MitUNet 룩의 하늘 그라데이션은 CSS로 깐다 — scene.background에 텍스처를 넣으면
      // GTAOPass의 depth/normal 패스를 오염시켜 검은 사각형 아티팩트가 생긴다(뷰어와 동일 처리).
      style={hasMitunetStyle ? { background: "linear-gradient(#a8cbe8, #cfe2f1 60%, #eef2f0)" } : undefined}
    >
      <Canvas camera={{ fov: 50, position: cameraPosition }} dpr={[1, 2]} frameloop={frameloop} shadows>
        <RoomCameraAutoFit bounds={wallBounds} />
        {/* mitunet 룩은 캔버스를 투명하게 두고 위의 CSS 그라데이션이 하늘 역할을 한다. */}
        {hasMitunetStyle ? null : <color attach="background" args={["#626260"]} />}
        <MitunetSceneLook active={hasMitunetStyle} />
        <MitunetGtaoEffects active={hasMitunetStyle} />
        <group scale={[sceneHorizontalScale, 1, sceneHorizontalScale]}>
          {mitunetLayout && mitunetPlan ? (
            <MitunetDecorativeFloor layout={mitunetLayout} plan={mitunetPlan} />
          ) : null}
          <RoomFloor
            boundsOverride={mitunetLayout ? wallBounds : undefined}
            interactionOnly={hasMitunetStyle}
            onFloorPointerDown={onFloorPointerDown}
            onFloorPointerMove={onFloorPointerMove}
            wallsData={wallsData}
          />
          {mitunetLayout ? <MitunetFloorPlanMeshes layout={mitunetLayout} /> : null}
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
          {selectedFurniture && !pendingFurniture && onSelectedMove && onSelectedRotateLeft && onSelectedRotateRight && onSelectedDelete ? (
            <Html
              center
              position={[
                selectedFurniture.position[0],
                selectedFurniture.position[1] + getFurnitureDimensions(selectedFurniture).height * furnitureVerticalScale + 0.5,
                selectedFurniture.position[2]
              ]}
              zIndexRange={[30, 0]}
            >
              <div className="floor-plan-pending-actions" onPointerDown={(event) => event.stopPropagation()}>
                <button aria-label="가구 이동" onClick={onSelectedMove} title="가구 이동" type="button">
                  <Move aria-hidden="true" />
                </button>
                <button aria-label="왼쪽으로 90도 회전" onClick={onSelectedRotateLeft} title="왼쪽으로 90도 회전" type="button">
                  <RotateCcw aria-hidden="true" />
                </button>
                <button aria-label="오른쪽으로 90도 회전" onClick={onSelectedRotateRight} title="오른쪽으로 90도 회전" type="button">
                  <RotateCw aria-hidden="true" />
                </button>
                <button aria-label="가구 삭제" className="is-delete" onClick={onSelectedDelete} title="가구 삭제" type="button">
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </Html>
          ) : null}
          {pendingFurniture && onPendingConfirm && onPendingCancel ? (
            <Html
              center
              position={[
                pendingFurniture.position[0],
                pendingFurniture.position[1] + getFurnitureDimensions(pendingFurniture).height * furnitureVerticalScale + 0.5,
                pendingFurniture.position[2]
              ]}
              zIndexRange={[30, 0]}
            >
              <div className="floor-plan-pending-actions" onPointerDown={(event) => event.stopPropagation()}>
                <button aria-label="배치 취소" className="is-cancel" onClick={onPendingCancel} title="취소 (재편집이면 원위치)" type="button">
                  <X aria-hidden="true" />
                </button>
                <button aria-label="배치완료" className="is-confirm" onClick={onPendingConfirm} title="배치완료" type="button">
                  <Check aria-hidden="true" />
                </button>
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
        />
      </Canvas>
      {hideHint ? null : <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>}
    </div>
  );
}
