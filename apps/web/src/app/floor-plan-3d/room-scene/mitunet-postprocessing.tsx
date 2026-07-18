"use client";

// MitUNet 뷰어(services/mitunet/viewer/index.html)의 GTAO 포스트프로세싱과 동일한
// 설정을 R3F 씬에 적용한다. 벽-바닥 구석과 문/창 개구부 안쪽에 접촉 음영을 더해
// 구조물이 떠 보이지 않게 한다. 파라미터는 뷰어와 반드시 같은 값을 유지할 것(룩 패리티).
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";

export const MITUNET_GTAO_PARAMETERS = {
  radius: 0.28,
  distanceExponent: 1.0,
  thickness: 1.0,
  scale: 1.0,
  // AO is low-frequency (soft corner shading), so fewer samples + the half-res
  // AO buffers below cut the fill-rate cost sharply with no visible quality loss.
  // Keep this in sync with the viewer's gtaoAoParameters (services/mitunet/viewer).
  samples: 8,
  screenSpaceRadius: false
};

export function MitunetGtaoEffects({ active }: { active: boolean }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);

  const passes = useMemo(() => {
    if (!active) return null;
    const effectComposer = new EffectComposer(gl);
    effectComposer.addPass(new RenderPass(scene, camera));
    const gtaoPass = new GTAOPass(scene, camera);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.updateGtaoMaterial(MITUNET_GTAO_PARAMETERS);
    effectComposer.addPass(gtaoPass);
    // OutputPass가 렌더러의 톤매핑/sRGB 변환을 마지막에 수행하므로 직접 렌더와 룩이 같다.
    effectComposer.addPass(new OutputPass());
    return { composer: effectComposer, gtaoPass };
  }, [active, camera, gl, scene]);

  useEffect(() => {
    if (!passes) return;
    const pixelRatio = gl.getPixelRatio();
    passes.composer.setPixelRatio(pixelRatio);
    passes.composer.setSize(size.width, size.height);
    // AO runs at half resolution: GTAOPass.setSize only resizes its internal
    // depth/normal/AO/denoise targets — the composite still copies the full-res
    // beauty and blends the (bilinearly upsampled) half-res AO over it, so the
    // scene stays sharp and only the low-frequency AO is coarser. composer.setSize
    // above already sized this pass to the full device buffer; halve it here.
    passes.gtaoPass.setSize(
      Math.max(1, Math.round((size.width * pixelRatio) / 2)),
      Math.max(1, Math.round((size.height * pixelRatio) / 2))
    );
  }, [passes, gl, size.height, size.width]);

  useEffect(() => () => passes?.composer.dispose(), [passes]);

  // priority ≥ 1이면 R3F 기본 렌더가 꺼지고 이 훅이 렌더를 대신한다.
  // 비활성일 땐 priority 0(기본 렌더 유지) + no-op.
  useFrame(() => {
    passes?.composer.render();
  }, passes ? 1 : 0);

  return null;
}
