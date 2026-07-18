import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { importKenneyAppliances } from "./import-kenney-appliances.mjs";

test("copies a Kenney appliance with its preview and adds image-backed catalog metadata", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "kenney-appliance-import-"));
  const datasetRoot = path.join(workspace, "dataset");
  const kenneyRoot = path.join(workspace, "kenney");

  try {
    await mkdir(path.join(kenneyRoot, "Models", "GLTF format"), { recursive: true });
    await mkdir(path.join(kenneyRoot, "Side"), { recursive: true });
    await mkdir(datasetRoot, { recursive: true });
    await writeFile(path.join(kenneyRoot, "Models", "GLTF format", "fridge.glb"), "model");
    await writeFile(path.join(kenneyRoot, "Side", "fridge.png"), "preview");
    await writeFile(path.join(datasetRoot, "catalog.json"), JSON.stringify({ items: [] }));

    const result = await importKenneyAppliances({
      datasetRoot,
      kenneyRoot,
      assets: [{
        sourceName: "fridge",
        relativePath: "appliance/kenney-fridge.glb",
        displayNameKo: "냉장고",
        sizeMm: { width: 600, height: 1800, depth: 600 },
      }],
    });

    assert.deepEqual(result, { importedItemCount: 1, catalogItemCount: 1 });
    assert.equal(await readFile(path.join(datasetRoot, "appliance", "kenney-fridge.glb"), "utf8"), "model");
    assert.equal(await readFile(path.join(datasetRoot, "appliance", "kenney-previews", "fridge.png"), "utf8"), "preview");
    const catalog = JSON.parse(await readFile(path.join(datasetRoot, "catalog.json"), "utf8"));
    assert.deepEqual(catalog.items, [{
      fileName: "kenney-fridge.glb",
      relativePath: "appliance/kenney-fridge.glb",
      category: "appliance",
      catalogCategory: "electronics",
      catalogCategoryLabel: "가전·전자",
      displayNameKo: "냉장고",
      sizeMm: { width: 600, height: 1800, depth: 600 },
      thumbnailUrl: "/floor-plan-3d/furniture-assets/appliance/kenney-previews/fridge.png",
      imageUrls: ["/floor-plan-3d/furniture-assets/appliance/kenney-previews/fridge.png"],
      sourceUrl: "https://kenney.nl/assets/furniture-kit",
      license: "CC0-1.0",
      excludedFromCatalog: false,
    }]);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
