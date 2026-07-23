import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPolyhavenCatalog,
  mapPolyhavenCategory,
  readGlbSizeMm,
} from "./build-polyhaven-catalog.mjs";

function glbWithBounds(min, max) {
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" },
    accessors: [{ type: "VEC3", min, max }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const padded = Buffer.alloc(paddedLength, 0x20);
  json.copy(padded);
  const glb = Buffer.alloc(12 + 8 + padded.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  return glb;
}

test("reads millimetre dimensions from GLB accessor bounds", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "roomlog-polyhaven-"));
  const file = path.join(root, "ArmChair_01.glb");
  await writeFile(file, glbWithBounds([-0.5, 0, -0.35], [0.5, 0.8, 0.35]));

  assert.deepEqual(await readGlbSizeMm(file), { width: 1000, height: 800, depth: 700 });
});

test("maps Poly Haven metadata to Roomlog placement categories", () => {
  assert.equal(mapPolyhavenCategory({ category: "Furniture/Seating/Chairs", tags: ["victorian"] }), "소파·의자");
  assert.equal(mapPolyhavenCategory({ category: "Nature/Rocks", tags: ["outdoor"] }), "야외");
  assert.equal(mapPolyhavenCategory({ category: "Props", tags: ["vase"] }), "데코");
});

test("builds a stable placeable catalog record", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "roomlog-polyhaven-"));
  const file = path.join(root, "ArmChair_01.glb");
  const glb = glbWithBounds([-0.5, 0, -0.35], [0.5, 0.8, 0.35]);
  await writeFile(file, glb);

  const catalog = await buildPolyhavenCatalog({
    sourceRoot: root,
    apiAssets: {
      ArmChair_01: {
        name: "Arm Chair 01",
        category: "Furniture/Seating/Chairs",
        tags: ["gothic", "chair"],
        thumbnail_url: "https://cdn.polyhaven.com/armchair.png",
      },
    },
  });

  assert.equal(catalog.itemCount, 1);
  assert.deepEqual(catalog.items[0], {
    assetId: "ArmChair_01",
    bytes: glb.length,
    catalogCategoryLabel: "소파·의자",
    displayName: "Arm Chair 01",
    fileName: "ArmChair_01.glb",
    license: "CC0-1.0",
    placementCapability: "floor",
    relativePath: "polyhaven-cc0/ArmChair_01.glb",
    sizeMm: { width: 1000, height: 800, depth: 700 },
    sourceUrl: "https://polyhaven.com/a/ArmChair_01",
    tags: ["gothic", "chair"],
    thumbnailPath: "polyhaven-cc0/thumbnails/ArmChair_01.png",
    thumbnailSourceUrl: "https://cdn.polyhaven.com/armchair.png",
  });
});
