import * as THREE from "three";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { buildRoomlogInteriorMask, buildWoodRgba, MITUNET_RENDER_STYLE } from "./mitunet-surfaces";

export function createConcreteTexture(worldWidth: number, worldDepth: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = `#${MITUNET_RENDER_STYLE.concrete.toString(16).padStart(6, "0")}`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 1400; index += 1) {
    const shade = 120 + Math.floor(Math.random() * 40);
    context.fillStyle = `rgba(${shade},${shade - 1},${shade - 4},0.30)`;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1,
      1
    );
  }
  context.fillStyle = "rgba(0, 0, 0, 0.10)";
  context.fillRect(0, 0, canvas.width, 2);
  context.fillRect(0, 0, 2, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    Math.max(1, worldWidth / MITUNET_RENDER_STYLE.concreteTileWorldSize),
    Math.max(1, worldDepth / MITUNET_RENDER_STYLE.concreteTileWorldSize)
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWoodTexture(plan: MitunetFloorPlan) {
  const [width, height] = plan.canvasSize;
  const mask = buildRoomlogInteriorMask(plan.polygons, width, height);
  const pixels = buildWoodRgba(mask, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(width, height);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
