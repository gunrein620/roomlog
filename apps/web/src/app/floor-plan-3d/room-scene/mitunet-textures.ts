import * as THREE from "three";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import {
  buildFloorMaterialRgba,
  buildRoomlogInteriorMask,
  MITUNET_RENDER_STYLE
} from "./mitunet-surfaces";

export function createConcreteTexture(worldWidth: number, worldDepth: number) {
  // A calm night lawn: a dark green base with fine blade strokes in tightly
  // related greens only (no brown, no broad mottled patches, no bright sunlit
  // tips) so it reads as even turf under moonlight instead of a blotchy or
  // daytime-bright surface. Kept in step with the viewer's createConcreteTexture().
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = `#${MITUNET_RENDER_STYLE.concrete.toString(16).padStart(6, "0")}`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Shadow blades (the bulk of the texture) — a touch darker than the base.
  for (let index = 0; index < 2400; index += 1) {
    const g = 58 + Math.floor(Math.random() * 32);
    const r = 30 + Math.floor(Math.random() * 16);
    const b = 28 + Math.floor(Math.random() * 14);
    context.fillStyle = `rgba(${r},${g},${b},0.34)`;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1,
      2 + Math.random() * 3
    );
  }
  // Slightly lighter blades for gentle texture — still dim, still green.
  for (let index = 0; index < 900; index += 1) {
    const g = 92 + Math.floor(Math.random() * 28);
    const r = 46 + Math.floor(Math.random() * 18);
    const b = 40 + Math.floor(Math.random() * 14);
    context.fillStyle = `rgba(${r},${g},${b},0.26)`;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1,
      1 + Math.random() * 2
    );
  }
  // Sparse cool moonlight glints so the lawn isn't perfectly flat.
  for (let index = 0; index < 170; index += 1) {
    const g = 118 + Math.floor(Math.random() * 26);
    context.fillStyle = `rgba(72,${g},80,0.15)`;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1,
      1
    );
  }

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

export function createFloorTexture(plan: MitunetFloorPlan) {
  const [width, height] = plan.canvasSize;
  const mask = buildRoomlogInteriorMask(plan.polygons, width, height);
  const pixels = buildFloorMaterialRgba(mask, width, height, plan.floorMaterials);
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
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
