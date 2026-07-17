import path from "node:path";

import { resolveRoomlogRuntimePath } from "./runtime-asset-path";

const DEFAULT_FURNITURE_DATASET_ROOT = "runtime-assets/furniture-glb-dataset";

const CONTENT_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
};

export function resolveFurnitureDatasetRoot() {
  return resolveRoomlogRuntimePath(
    process.env.FURNITURE_DATASET_ROOT ?? DEFAULT_FURNITURE_DATASET_ROOT,
  );
}

export function resolveFurnitureAssetFile(...segments: string[]) {
  const datasetRoot = resolveFurnitureDatasetRoot();
  const filePath = path.resolve(datasetRoot, ...segments);
  if (filePath !== datasetRoot && !filePath.startsWith(`${datasetRoot}${path.sep}`)) {
    throw new Error("Furniture asset path escaped the dataset directory.");
  }
  const extension = path.extname(filePath).toLowerCase();
  if (!(extension in CONTENT_TYPES)) {
    throw new Error("Only .glb models and .json manifests are served from the furniture dataset.");
  }
  return filePath;
}

export function furnitureContentTypeFor(filePath: string) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
