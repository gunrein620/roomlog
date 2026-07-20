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

export async function createSourcePlanTexture(plan: MitunetFloorPlan) {
  if (plan.surfaceMode !== "source" || !plan.sourceImageB64) return null;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const source = new Image();
    source.onload = () => resolve(source);
    source.onerror = () => reject(new Error("Saved source plan image could not be decoded"));
    source.src = `data:image/png;base64,${plan.sourceImageB64}`;
  });
  const [width, height] = plan.canvasSize;
  const [left, top, innerWidth, innerHeight] = plan.contentRect;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const mask = buildRoomlogInteriorMask(plan.polygons, width, height);
  for (let y = 0; y < canvas.height; y += 1) {
    const sourceY = Math.min(height - 1, top + Math.floor(y * innerHeight / canvas.height));
    for (let x = 0; x < canvas.width; x += 1) {
      const sourceX = Math.min(width - 1, left + Math.floor(x * innerWidth / canvas.width));
      if (!mask[sourceY * width + sourceX]) pixels.data[(y * canvas.width + x) * 4 + 3] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
