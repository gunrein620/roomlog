import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { importMastjieAppliances } from "./import-mastjie-appliances.mjs";

test("imports an image-backed CC0 household appliance into the electronics catalog", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "mastjie-appliance-import-"));
  const datasetRoot = path.join(workspace, "dataset");
  const sourceRoot = path.join(workspace, "source");

  try {
    await mkdir(path.join(sourceRoot, "gltf"), { recursive: true });
    await mkdir(datasetRoot, { recursive: true });
    await writeFile(path.join(sourceRoot, "gltf", "air-conditioner.glb"), "model");
    await writeFile(path.join(sourceRoot, "preview.PNG"), "preview");
    await writeFile(path.join(datasetRoot, "catalog.json"), JSON.stringify({ items: [] }));

    const result = await importMastjieAppliances({
      datasetRoot,
      sourceRoot,
      assets: [{
        sourceName: "air-conditioner",
        relativePath: "appliance/mastjie-air-conditioner.glb",
        displayNameKo: "에어컨",
        sizeMm: { width: 900, height: 300, depth: 220 },
      }],
    });

    assert.deepEqual(result, { importedItemCount: 1, catalogItemCount: 1 });
    assert.equal(await readFile(path.join(datasetRoot, "appliance", "mastjie-air-conditioner.glb"), "utf8"), "model");
    assert.equal(await readFile(path.join(datasetRoot, "appliance", "mastjie-previews", "household-goods.png"), "utf8"), "preview");
    const catalog = JSON.parse(await readFile(path.join(datasetRoot, "catalog.json"), "utf8"));
    assert.equal(catalog.items[0].displayNameKo, "에어컨");
    assert.equal(catalog.items[0].thumbnailUrl, "/floor-plan-3d/furniture-assets/appliance/mastjie-previews/household-goods.png");
    assert.equal(catalog.items[0].license, "CC0-1.0");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
