"use client";

// TODO(agent-B): CameraControls 기반 애니메이션+궤도제한으로 교체.
// 지금은 OrbitControls로 activeId 변경 시 카메라를 애니메이션 없이 즉시 세팅한다.

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { ComponentRef } from "react";
import type { TourPreset } from "./tour-types";

export function TourCamera({
  presets,
  activeId,
  onArrive
}: {
  presets: TourPreset[];
  activeId: string;
  onArrive?: (id: string) => void;
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const preset = presets.find((item) => item.id === activeId);
    if (!preset) return;

    camera.position.set(...preset.camera.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...preset.camera.target);
      controls.update();
    } else {
      camera.lookAt(...preset.camera.target);
    }

    onArrive?.(activeId);
  }, [activeId, camera, presets, onArrive]);

  return <OrbitControls enableDamping makeDefault ref={controlsRef} />;
}
