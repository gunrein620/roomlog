"use client";

// room-model이 계산한 3D 벽/가구 데이터를 React Three Fiber로 렌더링하고,
// 클릭 등 인터랙션 이벤트를 props 콜백으로 컨테이너에 돌려준다.

import { ContactShadows, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Check, Move, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { type ComponentRef, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { FURNITURE_CATALOG, getFurnitureDimensions } from "../furniture-placement";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import type { FurniturePlacementHit, FurniturePlacementResult } from "../furniture-placement";
import { createMitunetSceneLayout, type MitunetSceneLayout, type MitunetScenePolygon } from "./mitunet-geometry";
import {
  calculateMitunetGroundBounds,
  calculateMitunetTexturePlane,
  MITUNET_RENDER_STYLE
} from "./mitunet-surfaces";
import { MitunetGtaoEffects } from "./mitunet-postprocessing";
import { createConcreteTexture, createFloorTexture, createSourcePlanTexture } from "./mitunet-textures";
import { FloorPlanWalkControls, type FloorPlanWalkStatus } from "./FloorPlanWalkControls";
import {
  FurnitureFirstPersonControls,
  type FurnitureFirstPersonStatus
} from "./FurnitureFirstPersonControls";
import type { FurnitureInteractionMode } from "./furniture-first-person-input";
import {
  isOrbitKeyboardInteractiveTarget,
  orbitKeyboardMovementDelta
} from "./orbit-keyboard-movement";
import { resolveWalkInputCode, type WalkAction } from "../walk/walk-input";

export type RoomControlMode = "orbit" | "walk";

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
      userData={{ roomlogPlacementSurface: "floor" }}
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
    <mesh
      castShadow
      geometry={geometry}
      position={[0, y, 0]}
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ roomlogPlacementSurface: "wall", roomlogWallId: "mitunet-wall" }}
    >
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

/** RoomPlan 캡처 경로 전용 바닥(layout.floor). mitunet 경로는 원본 도면 이미지 기반의
 * 자체 바닥(MitunetDecorativeFloor)이 있어 이 컴포넌트를 쓰지 않는다 — 호출측(아래
 * RoomlogThreeFloorPlanView)이 mitunetPlan 부재를 조건으로 걸어 이중 렌더를 막는다. */
function CaptureFloorMesh({ polygons }: { polygons: MitunetScenePolygon[] }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(polygons.map(mitunetShape)), [polygons]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (polygons.length === 0) return null;

  return (
    <mesh
      geometry={geometry}
      // y: 기존 MitunetDecorativeFloor의 텍스처 바닥(0.004)과 같은 높이 — 배치 상호작용용
      // RoomFloor(y=0, 캡처 경로에선 투명)보다 살짝 위로 띄워 z-fighting을 피한다.
      position={[0, 0.004, 0]}
      // 가구 배치 픽킹은 RoomFloor의 투명 평면이 담당 — 이 메시는 순수 장식이라 레이캐스트를 끈다.
      raycast={() => null}
      receiveShadow
      // mitunetShape와 동일한 좌표 변환 + 동일 rotation을 그대로 재사용하므로(아래 참고) 벽
      // 폴리곤과 동일한 (x, z) → 월드 매핑이 보장된다 — 별도로 부호를 다시 유도하지 않음.
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {/* 캡처 루프의 감김 방향(시계/반시계)은 보장되지 않는다 — Shape 삼각분할 결과에 따라
          앞면 법선이 위/아래 어느 쪽으로 나올지 모르므로, FrontSide 컬링으로 바닥이 안 보이는
          사고를 막기 위해 양면 렌더한다. */}
      <meshStandardMaterial color="#c9a06a" metalness={0} roughness={0.86} side={THREE.DoubleSide} />
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
  plan,
  showGround = true
}: {
  layout: MitunetSceneLayout;
  plan: MitunetFloorPlan;
  /** 등록 미리보기에서는 건물 바깥의 콘크리트 판을 숨긴다. */
  showGround?: boolean;
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
  const [sourceTexture, setSourceTexture] = useState<THREE.Texture | null>(null);
  const sourceTextureKey = plan.sourceImageB64 ?? "";
  const [loadedSourceTextureKey, setLoadedSourceTextureKey] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    if (plan.surfaceMode !== "source") {
      setSourceTexture(null);
      setLoadedSourceTextureKey(null);
      return () => { disposed = true; };
    }
    setSourceTexture(null);
    void createSourcePlanTexture(plan)
      .then((texture) => {
        if (disposed) texture?.dispose();
        else {
          setSourceTexture(texture);
          setLoadedSourceTextureKey(sourceTextureKey);
        }
      })
      .catch(() => {
        if (!disposed) {
          setSourceTexture(null);
          setLoadedSourceTextureKey(sourceTextureKey);
        }
      });
    return () => { disposed = true; };
  }, [plan, sourceTextureKey]);

  useEffect(() => () => concreteTexture?.dispose(), [concreteTexture]);
  useEffect(() => () => woodTexture?.dispose(), [woodTexture]);
  useEffect(() => () => sourceTexture?.dispose(), [sourceTexture]);
  const sourceTexturePending = plan.surfaceMode === "source" && loadedSourceTextureKey !== sourceTextureKey;
  const activeFloorTexture = plan.surfaceMode === "source"
    ? sourceTexturePending ? null : sourceTexture ?? woodTexture
    : woodTexture;

  return (
    <>
      {showGround ? (
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
      ) : null}
      {activeFloorTexture ? (
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
            map={activeFloorTexture}
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
  const position: [number, number, number] = furniture.modelUrl
    ? [furniture.position[0], furniture.position[1] + dimensions.height / 2, furniture.position[2]]
    : furniture.position;

  return (
    <mesh
      onPointerDown={(event) => onPointerDown(furniture, event)}
      position={position}
      // 배치 대기(드래그 추적 중) 가구는 커서 아래 바닥의 pointer 이벤트를 가리지 않게 레이캐스트를 끈다.
      raycast={isPending ? () => null : undefined}
      rotation={furniture.rotation}
      userData={{ roomlogFurnitureId: furniture.id }}
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
  const wallMounted = furniture.placement?.mode === "wall";
  const wallQuarterTurns = Math.abs(Math.round(furniture.rotation[2] / (Math.PI / 2))) % 2;
  const renderedHeight = wallMounted && wallQuarterTurns === 1 ? dimensions.width : dimensions.height;
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
      position={[
        furniture.position[0],
        wallMounted ? furniture.position[1] + renderedHeight / 2 : furniture.position[1],
        furniture.position[2]
      ]}
      rotation={furniture.rotation}
      userData={{ roomlogFurnitureId: furniture.id }}
    >
      <primitive object={scene} position={[0, wallMounted ? modelOffsetY - dimensions.height / 2 : modelOffsetY, 0]} scale={scale} />
      {isSelected ? (
        <mesh position={wallMounted ? [0, 0, 0] : [0, dimensions.height / 2, 0]}>
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
    <mesh
      onPointerDown={(event) => onPointerDown(wall, event)}
      position={wall.position}
      rotation={wall.rotation}
      userData={{ roomlogPlacementSurface: "wall", roomlogWallId: String(wall.wall_id) }}
    >
      <boxGeometry args={[wall.dimensions.width, wall.dimensions.height, wall.dimensions.depth]} />
      <meshLambertMaterial color={isSelected ? "#2f55ff" : "#eeeeec"} />
    </mesh>
  );
}

function RoomOrbitControls({
  enabled = true,
  keyboardMoveEnabled = false,
  maxDistance = 42,
  minDistance = 5,
  target,
  zoomEnabled = true
}: {
  enabled?: boolean;
  keyboardMoveEnabled?: boolean;
  maxDistance?: number;
  minDistance?: number;
  target: [number, number, number];
  /** false면 휠 줌 비활성 — 페이지 스크롤 흐름 속 뷰(상세 히어로)에서 휠을 뺏지 않게. */
  zoomEnabled?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const pressedKeysRef = useRef<Set<WalkAction>>(new Set());
  const forwardVector = useMemo(() => new THREE.Vector3(), []);
  const movementEnabled = enabled && keyboardMoveEnabled;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
    invalidate();
  }, [invalidate, target[0], target[1], target[2]]);

  useEffect(() => {
    pressedKeysRef.current.clear();
    if (!movementEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveWalkInputCode(event.code);
      if (!action || isOrbitKeyboardInteractiveTarget(event.target)) return;
      event.preventDefault();
      pressedKeysRef.current.add(action);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const action = resolveWalkInputCode(event.code);
      if (!action) return;
      pressedKeysRef.current.delete(action);
      if (!isOrbitKeyboardInteractiveTarget(event.target)) event.preventDefault();
    };
    const clearPressedKeys = () => pressedKeysRef.current.clear();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearPressedKeys);
    return () => {
      pressedKeysRef.current.clear();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearPressedKeys);
    };
  }, [movementEnabled]);

  useFrame((_, frameDeltaSeconds) => {
    const controls = controlsRef.current;
    if (!movementEnabled || !controls || pressedKeysRef.current.size === 0) return;

    camera.getWorldDirection(forwardVector);
    const delta = orbitKeyboardMovementDelta(
      pressedKeysRef.current,
      { x: forwardVector.x, z: forwardVector.z },
      frameDeltaSeconds
    );
    if (delta.x === 0 && delta.z === 0) return;

    camera.position.x += delta.x;
    camera.position.z += delta.z;
    controls.target.x += delta.x;
    controls.target.z += delta.z;
    controls.update();
    invalidate();
  });

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
      ref={controlsRef}
    />
  );
}

// 방 크기에 맞춰 카메라 거리를 자동 계산 — 고정 카메라로는 작은 방이 점처럼,
// 큰 방이 화면 밖으로 나가므로, 진입/방 크기 변경 시 전체가 보이는 거리로 재배치한다.
function RoomCameraAutoFit({
  bounds,
  distanceScale = 1,
  previewFit = false
}: {
  bounds: ReturnType<typeof computeWallBoundsXZ>;
  /** 씬 그룹 스케일·여백 보정 배율 — 오토핏은 무스케일 벽 좌표로 계산하므로,
   *  horizontalScale로 방을 키운 뷰(상세 3D)는 그만큼 곱해 줘야 방이 화면에 작게 뜬다. */
  distanceScale?: number;
  /** 카드 비율을 반영해 건물 전체가 보이도록 여유 거리를 더한다. */
  previewFit?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  // 벽을 조금 옮길 때마다 카메라가 튀지 않게, 0.5m 단위로 반올림한 크기가 바뀔 때만 재배치한다.
  const viewportAspect = size.width / Math.max(size.height, 1);
  const boundsKey = `${Math.round(bounds.centerX * 2)}:${Math.round(bounds.centerZ * 2)}:${Math.round(Math.max(bounds.width, bounds.height) * 2)}:${Math.round(viewportAspect * 100)}`;

  useEffect(() => {
    const longSide = Math.max(bounds.width, bounds.height);
    const defaultDistance = Math.min(40, Math.max(6, longSide * 1.5));
    const verticalFov = THREE.MathUtils.degToRad(50);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * viewportAspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const buildingDiagonal = Math.hypot(bounds.width, bounds.height);
    const previewDistance = buildingDiagonal / (2 * Math.tan(limitingFov / 2)) * 1.18;
    const distance = (previewFit ? Math.max(defaultDistance, previewDistance) : defaultDistance) * distanceScale;
    camera.position.set(bounds.centerX + distance * 0.55, distance * 0.7, bounds.centerZ + distance * 0.85);
    camera.lookAt(bounds.centerX, 0, bounds.centerZ);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, camera, distanceScale, invalidate, previewFit, viewportAspect]);

  return null;
}

export function RoomlogThreeFloorPlanView({
  cameraPosition = [14, 12, 18],
  controlMode = "orbit",
  controlsEnabled = true,
  fitDistanceScale = 1,
  frameloop = "demand",
  furnitureData,
  furnitureFirstPersonEnabled = false,
  furnitureInteractionMode = "explore",
  furniturePlacementFeedback = null,
  furnitureVerticalScale = 1,
  hideHint = false,
  horizontalScale = 1,
  listingPreview = false,
  mitunetLayout: mitunetLayoutProp,
  mitunetPlan,
  moveInputRef = null,
  onWalkStatusChange,
  orbitKeyboardMoveEnabled = false,
  orbitMaxDistance = 42,
  orbitMinDistance = 5,
  orbitZoomEnabled = true,
  onFloorPointerDown,
  onFloorPointerMove,
  onFurnitureCancel,
  onFurnitureCloseSelect,
  onFurnitureConfirm,
  onFurnitureLatestPlacementHit,
  onFurnitureLatestPlacementPoint,
  onFurnitureOpenSelect,
  onFurniturePickupAimed,
  onFurniturePlacementHit,
  onFurniturePlacementPoint,
  onFurnitureRemove,
  onFurnitureRotateBy,
  onFurnitureRotateLeft,
  onFurnitureRotateRight,
  onFurniturePointerDown,
  onScenePointerMissed,
  onPendingCancel,
  onPendingConfirm,
  onPendingDelete,
  onPendingRotate,
  onSelectedDelete,
  onSelectedMove,
  onSelectedRotateLeft,
  onSelectedRotateRight,
  onWallPointerDown,
  pendingFurniture,
  pendingFurnitureCanBeDeleted,
  previewFit = false,
  sceneBackground = "#626260",
  selectedFurnitureId,
  selectedWallId,
  wallsData
}: {
  cameraPosition?: [number, number, number];
  controlMode?: RoomControlMode;
  // 가구 드래그 중 카메라 회전이 같이 돌지 않게 끄는 용도.
  controlsEnabled?: boolean;
  // 편집기는 "demand"(입력 시에만 렌더)로 효율적이지만, 읽기 전용 뷰어는
  // 드래그 전에도 방이 보여야 하므로 "always"를 넘겨 즉시·리사이즈 시 계속 렌더한다.
  frameloop?: "demand" | "always";
  /** 카메라 오토핏 거리 배율 — 1보다 크면 방이 화면 중앙에 더 작게 뜬다(상세 3D 히어로). */
  fitDistanceScale?: number;
  furnitureData: PlacedFurniture[];
  furnitureFirstPersonEnabled?: boolean;
  furnitureInteractionMode?: FurnitureInteractionMode;
  furniturePlacementFeedback?: (Pick<FurniturePlacementResult, "reason" | "valid"> & { mode: "floor" | "surface" | "wall" }) | null;
  furnitureVerticalScale?: number;
  hideHint?: boolean;
  horizontalScale?: number;
  /** 등록 카드 전용: 건물 바깥 장식과 카메라 조작을 숨긴다. */
  listingPreview?: boolean;
  /** 미터 레이아웃을 이미 갖고 있을 때(예: 캡처 도면 변환 결과) 직접 넘긴다 — 주어지면
   * mitunetPlan에서 파생하지 않고 이걸 그대로 쓴다. 원본 이미지가 없으므로 장식 바닥은
   * 생략된다(아래 hasMitunetStyle/MitunetDecorativeFloor 분기 참조). */
  mitunetLayout?: MitunetSceneLayout;
  mitunetPlan?: MitunetFloorPlan;
  moveInputRef?: { current: { forward: number; strafe: number } } | null;
  onWalkStatusChange?: (status: FloorPlanWalkStatus) => void;
  orbitKeyboardMoveEnabled?: boolean;
  orbitMaxDistance?: number;
  orbitMinDistance?: number;
  /** 휠 줌 허용 여부 — 상세 히어로는 false(페이지 스크롤 우선). */
  orbitZoomEnabled?: boolean;
  onFloorPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  // 가구 드래그 이동용 — 바닥 위 커서 이동을 컨테이너에 전달한다.
  onFloorPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onFurnitureCancel?: () => void;
  onFurnitureCloseSelect?: () => void;
  onFurnitureConfirm?: () => void;
  onFurnitureLatestPlacementHit?: (hit: FurniturePlacementHit) => void;
  onFurnitureLatestPlacementPoint?: (point: { x: number; z: number }) => void;
  onFurnitureOpenSelect?: () => void;
  onFurniturePickupAimed?: (id: string) => void;
  onFurniturePlacementHit?: (hit: FurniturePlacementHit) => void;
  onFurniturePlacementPoint?: (point: { x: number; z: number }) => void;
  onFurnitureRemove?: () => void;
  onFurnitureRotateBy?: (angleDelta: number) => void;
  onFurnitureRotateLeft?: () => void;
  onFurnitureRotateRight?: () => void;
  onFurniturePointerDown: (furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) => void;
  onScenePointerMissed?: () => void;
  // 배치 중에는 취소/완료, 선택 중에는 이동/양방향 회전/삭제 버튼을 표시한다.
  onPendingCancel?: () => void;
  onPendingConfirm?: () => void;
  /** 기존 가구를 재편집 중일 때만 배치 중 삭제 버튼을 노출한다. */
  pendingFurnitureCanBeDeleted?: boolean;
  onPendingDelete?: () => void;
  onPendingRotate?: (direction: -1 | 1) => void;
  onSelectedDelete?: () => void;
  onSelectedMove?: () => void;
  onSelectedRotateLeft?: () => void;
  onSelectedRotateRight?: () => void;
  onWallPointerDown: (wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) => void;
  pendingFurniture: PlacedFurniture | null;
  /** 등록 카드 비율에 맞춰 건물 전체가 보이도록 카메라 거리를 계산한다. */
  previewFit?: boolean;
  /** 캔버스 배경색 — null이면 투명(뒤 CSS 배경이 비친다, 상세 3D 히어로의 밤하늘용). */
  sceneBackground?: string | null;
  selectedFurnitureId: string | null;
  selectedWallId: string | number | null;
  wallsData: WheretoputWall3D[];
}) {
  const sceneHorizontalScale = Math.max(0.1, horizontalScale);
  const mitunetLayout = useMemo(
    () => mitunetLayoutProp ?? (mitunetPlan ? createMitunetSceneLayout(mitunetPlan) : null),
    [mitunetLayoutProp, mitunetPlan]
  );
  const wallBounds = mitunetLayout
    ? {
        centerX: mitunetLayout.bounds.centerX,
        centerZ: mitunetLayout.bounds.centerZ,
        width: mitunetLayout.bounds.width,
        height: mitunetLayout.bounds.depth
      }
    : computeWallBoundsXZ(wallsData);
  // layout만 있고 plan(원본 이미지)이 없는 경우(캡처 도면)도 mitunet 룩(밤하늘·조명)은 그대로
  // 적용한다 — 장식 바닥만 아래에서 별도로 건너뛴다.
  const hasMitunetStyle = Boolean(mitunetLayout);
  const selectedFurniture = furnitureData.find((furniture) => furniture.id === selectedFurnitureId) ?? null;
  const sceneInteractive = controlMode === "orbit";
  const pointerSceneInteractive = sceneInteractive && (!furnitureFirstPersonEnabled || furnitureInteractionMode === "select");
  const walkPreferredSpawn = useMemo(
    () => ({
      x: wallBounds.centerX * sceneHorizontalScale,
      z: wallBounds.centerZ * sceneHorizontalScale
    }),
    [sceneHorizontalScale, wallBounds.centerX, wallBounds.centerZ]
  );
  const [walkStatus, setWalkStatus] = useState<FloorPlanWalkStatus>("ready");
  const [furnitureFirstPersonStatus, setFurnitureFirstPersonStatus] = useState<FurnitureFirstPersonStatus>("ready");
  const [aimedFurnitureId, setAimedFurnitureId] = useState<string | null>(null);

  useEffect(() => {
    if (!furnitureFirstPersonEnabled) setAimedFurnitureId(null);
  }, [furnitureFirstPersonEnabled]);

  useEffect(() => {
    onWalkStatusChange?.(walkStatus);
  }, [onWalkStatusChange, walkStatus]);

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

  const furniturePlacementState = furnitureInteractionMode === "carry" && furniturePlacementFeedback?.valid !== true
    ? "invalid"
    : "valid";
  const furniturePlacementLabel = furnitureInteractionMode !== "carry"
    ? null
    : furniturePlacementFeedback?.valid
      ? furniturePlacementFeedback.mode === "wall"
        ? "벽걸이 배치"
        : furniturePlacementFeedback.mode === "surface"
          ? "가구 위 배치"
          : "바닥 배치"
      : "배치 불가";

  return (
    <div
      className={`floor-plan-3d-preview${listingPreview ? " is-listing-preview" : ""}`}
      data-renderer="wheretoput 3D room renderer"
      // MitUNet 룩의 하늘은 CSS로 깐다 — scene.background에 텍스처를 넣으면
      // GTAOPass의 depth/normal 패스를 오염시켜 검은 사각형 아티팩트가 생긴다(뷰어와 동일 처리).
      // 별 가득한 밤하늘: 타일링된 radial-gradient 별 레이어(타일 크기를 달리해 유사 난수 산포)
      // + 딥네이비 그라데이션. 뷰어 canvas#scene CSS와 동일 값 유지(룩 패리티).
      style={hasMitunetStyle ? {
        background:
          "radial-gradient(1.5px 1.5px at 18px 32px, rgba(255,255,255,0.98), transparent 70%), " +
          "radial-gradient(1.1px 1.1px at 121px 74px, rgba(255,255,255,0.8), transparent 70%), " +
          "radial-gradient(1.3px 1.3px at 67px 141px, rgba(214,226,255,0.92), transparent 70%), " +
          "radial-gradient(1.1px 1.1px at 203px 109px, rgba(255,255,255,0.66), transparent 70%), " +
          "radial-gradient(1.4px 1.4px at 90px 200px, rgba(255,246,232,0.85), transparent 70%), " +
          "radial-gradient(0.9px 0.9px at 250px 40px, rgba(255,255,255,0.7), transparent 70%), " +
          "radial-gradient(1.1px 1.1px at 40px 260px, rgba(210,224,255,0.74), transparent 70%), " +
          "radial-gradient(1px 1px at 300px 180px, rgba(255,255,255,0.74), transparent 70%), " +
          "radial-gradient(1.2px 1.2px at 160px 300px, rgba(255,255,255,0.82), transparent 70%), " +
          "radial-gradient(0.8px 0.8px at 210px 230px, rgba(255,255,255,0.6), transparent 70%), " +
          "radial-gradient(2.5px 2.5px at 331px 87px, rgba(255,255,255,1), rgba(255,255,255,0.3) 45%, transparent 72%), " +
          "radial-gradient(2.1px 2.1px at 120px 360px, rgba(224,236,255,1), rgba(224,236,255,0.28) 45%, transparent 72%), " +
          "linear-gradient(#04060f, #101a38 55%, #26355e)",
        backgroundSize: "160px 160px, 200px 200px, 240px 240px, 280px 280px, 300px 300px, 170px 170px, 220px 220px, 190px 190px, 260px 260px, 150px 150px, 520px 520px, 560px 560px, 100% 100%",
        backgroundRepeat: "repeat, repeat, repeat, repeat, repeat, repeat, repeat, repeat, repeat, repeat, repeat, repeat, no-repeat",
      } : undefined}
    >
      <Canvas camera={{ fov: 50, position: cameraPosition }} dpr={[1, 2]} frameloop={frameloop} gl={{ alpha: listingPreview }} onPointerMissed={onScenePointerMissed} shadows>
        {/* 상세 3D 히어로는 fitDistanceScale로 방을 화면에 더 작게 배치한다(bounds 오토핏 위에 접붙임). */}
        {controlMode === "orbit" && !furnitureFirstPersonEnabled ? (
          <RoomCameraAutoFit bounds={wallBounds} distanceScale={fitDistanceScale} previewFit={previewFit} />
        ) : null}
        {/* 배경: mitunet 룩은 위 CSS 그라데이션이 하늘이라 색을 안 깐다. 비-mitunet은 sceneBackground를 쓰되
            null(상세 3D 히어로)이면 투명하게 둬 히어로와 자연스럽게 겹치게 한다(기본 #626260 = 편집기 회색).
            비-mitunet 조명(ambient 0.72 / directional 1.4)은 MitunetSceneLook의 inactive 분기가 제공한다. */}
        {hasMitunetStyle ? null : sceneBackground ? <color attach="background" args={[sceneBackground]} /> : null}
        <MitunetSceneLook active={hasMitunetStyle} />
        <MitunetGtaoEffects active={hasMitunetStyle} />
        <group scale={[sceneHorizontalScale, 1, sceneHorizontalScale]}>
          {mitunetLayout && mitunetPlan ? (
            <MitunetDecorativeFloor layout={mitunetLayout} plan={mitunetPlan} showGround={!listingPreview} />
          ) : null}
          {/* 캡처 경로(mitunetPlan 없이 layout만 옴)에서만 그린다 — mitunet 경로는 위
              MitunetDecorativeFloor가 이미 바닥을 담당하므로 이중 렌더를 피한다. */}
          {mitunetLayout?.floor && mitunetLayout.floor.length > 0 && !mitunetPlan ? (
            <CaptureFloorMesh polygons={mitunetLayout.floor} />
          ) : null}
          <RoomFloor
            boundsOverride={mitunetLayout ? wallBounds : undefined}
            interactionOnly={hasMitunetStyle}
            onFloorPointerDown={pointerSceneInteractive ? onFloorPointerDown : ignoreFloorPointer}
            onFloorPointerMove={pointerSceneInteractive ? onFloorPointerMove : undefined}
            wallsData={wallsData}
          />
          {mitunetLayout ? <MitunetFloorPlanMeshes layout={mitunetLayout} /> : null}
          {wallsData.map((wall) => (
            <WallMesh
              isSelected={pointerSceneInteractive && String(selectedWallId ?? "") === String(wall.wall_id)}
              key={wall.id}
              onPointerDown={pointerSceneInteractive ? onWallPointerDown : ignoreWallPointer}
              wall={wall}
            />
          ))}
          {furnitureData.map((furniture) => (
            <FurnitureMesh
              furniture={furniture}
              verticalScale={furnitureVerticalScale}
              isSelected={sceneInteractive && (selectedFurnitureId === furniture.id || aimedFurnitureId === furniture.id)}
              key={furniture.id}
              onPointerDown={pointerSceneInteractive ? onFurniturePointerDown : ignoreFurniturePointer}
            />
          ))}
          {sceneInteractive && pendingFurniture ? (
            <FurnitureMesh
              furniture={pendingFurniture}
              verticalScale={furnitureVerticalScale}
              isPending
              isSelected={false}
              onPointerDown={onFurniturePointerDown}
            />
          ) : null}
          {sceneInteractive && selectedFurniture && !pendingFurniture && onSelectedMove && onSelectedRotateLeft && onSelectedRotateRight && onSelectedDelete ? (
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
          {sceneInteractive && pendingFurniture && onPendingConfirm && onPendingCancel ? (
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
                {onPendingRotate ? (
                  <>
                    <button aria-label="왼쪽으로 90도 회전" onClick={() => onPendingRotate(-1)} title="왼쪽으로 90도 회전" type="button">
                      <RotateCcw aria-hidden="true" />
                    </button>
                    <button aria-label="오른쪽으로 90도 회전" onClick={() => onPendingRotate(1)} title="오른쪽으로 90도 회전" type="button">
                      <RotateCw aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {pendingFurnitureCanBeDeleted && onPendingDelete ? (
                  <button aria-label="가구 삭제" className="is-delete" onClick={onPendingDelete} title="가구 삭제" type="button">
                    <Trash2 aria-hidden="true" />
                  </button>
                ) : null}
                <button aria-label="배치완료" className="is-confirm" onClick={onPendingConfirm} title="배치완료" type="button">
                  <Check aria-hidden="true" />
                </button>
              </div>
            </Html>
          ) : null}
        </group>
        {listingPreview ? null : <ContactShadows blur={2.4} far={6} opacity={0.28} position={[0, 0.015, 0]} resolution={512} scale={18 * sceneHorizontalScale} />}
        {controlMode === "walk" ? (
          <FloorPlanWalkControls
            enabled={controlsEnabled}
            furnitureData={furnitureData}
            horizontalScale={sceneHorizontalScale}
            mitunetLayout={mitunetLayout}
            moveInputRef={moveInputRef}
            onStatusChange={setWalkStatus}
            preferredSpawn={walkPreferredSpawn}
            wallsData={wallsData}
          />
        ) : furnitureFirstPersonEnabled ? (
          <FurnitureFirstPersonControls
            aimedFurnitureId={aimedFurnitureId}
            enabled={controlsEnabled}
            interactionMode={furnitureInteractionMode}
            onAimedFurnitureChange={setAimedFurnitureId}
            onCancel={() => onFurnitureCancel?.()}
            onCloseSelect={() => onFurnitureCloseSelect?.()}
            onConfirm={() => onFurnitureConfirm?.()}
            onLatestPlacementHit={onFurnitureLatestPlacementHit}
            onLatestPlacementPoint={(point) => onFurnitureLatestPlacementPoint?.(point)}
            onOpenSelect={() => onFurnitureOpenSelect?.()}
            onPickupAimed={(id) => onFurniturePickupAimed?.(id)}
            onPlacementHit={onFurniturePlacementHit}
            onPlacementPoint={(point) => onFurniturePlacementPoint?.(point)}
            onRemove={onFurnitureRemove}
            onRotateBy={onFurnitureRotateBy}
            onRotateLeft={() => onFurnitureRotateLeft?.()}
            onRotateRight={() => onFurnitureRotateRight?.()}
            onStatusChange={setFurnitureFirstPersonStatus}
            preferredSpawn={walkPreferredSpawn}
          />
        ) : (
          <RoomOrbitControls
            enabled={controlsEnabled}
            keyboardMoveEnabled={orbitKeyboardMoveEnabled}
            maxDistance={orbitMaxDistance}
            minDistance={orbitMinDistance}
            target={[wallBounds.centerX * sceneHorizontalScale, 0, wallBounds.centerZ * sceneHorizontalScale]}
            zoomEnabled={orbitZoomEnabled}
          />
        )}
      </Canvas>
      {controlMode === "walk" && walkStatus === "locked" ? null : controlMode === "walk" ? (
        <div className={`floor-plan-walk-instruction is-${walkStatus}`} role="status">
          <strong>{walkStatus === "unavailable" ? "워킹뷰를 시작할 수 없습니다" : "클릭하여 둘러보기"}</strong>
          <span>
            {walkStatus === "fallback"
              ? "마우스를 끌어 시선을 돌리고 WASD로 이동하세요."
              : "WASD · 방향키 이동 · Esc 마우스 해제"}
          </span>
        </div>
      ) : null}
      {furnitureFirstPersonEnabled ? (
        <>
          {furnitureInteractionMode !== "select" ? (
            <span className={`floor-plan-furniture-reticle is-${furniturePlacementState}`}>
              {furniturePlacementLabel ? (
                <span aria-live="polite" className="floor-plan-furniture-reticle-label" role="status">
                  {furniturePlacementLabel}
                </span>
              ) : null}
            </span>
          ) : null}
          {furnitureFirstPersonStatus === "locked" || furnitureInteractionMode === "select" ? null : (
            <div className={`floor-plan-walk-instruction is-${furnitureFirstPersonStatus}`} role="status">
              <strong>클릭하여 가구 배치 시작</strong>
              <span>마우스 시점 · WASD 이동</span>
            </div>
          )}
          <span className="floor-3d-hint">
            {furnitureInteractionMode === "carry"
              ? "1/3 90도 회전 · Q/E 섬세 회전 · 2 다시 선택 · 클릭 고정 · R 제거/취소"
              : furnitureInteractionMode === "select"
                ? "가구를 선택하세요 · 2 또는 Esc 닫기"
                : aimedFurnitureId
                  ? "클릭/E 가구 잡기 · 2 가구 선택"
                  : "2 가구 선택 · WASD 이동 · 마우스 시점"}
          </span>
        </>
      ) : orbitKeyboardMoveEnabled ? (
        <span className="floor-3d-hint">WASD 이동 · 드래그 회전</span>
      ) : hideHint ? null : (
        <span className="floor-3d-hint">벽 클릭 편집 / 화면 드래그 회전</span>
      )}
    </div>
  );
}

function ignoreFloorPointer(_event: ThreeEvent<PointerEvent>) {}
function ignoreWallPointer(_wall: WheretoputWall3D, _event: ThreeEvent<PointerEvent>) {}
function ignoreFurniturePointer(_furniture: PlacedFurniture, _event: ThreeEvent<PointerEvent>) {}
