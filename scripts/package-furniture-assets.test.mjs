import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildFurnitureUploadPackage } from "./package-furniture-assets.mjs";

test("creates an upload package containing only image-backed GLB assets", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "furniture-upload-package-"));
  const sourceRoot = path.join(workspace, "source");
  const destinationRoot = path.join(workspace, "package");

  try {
    await mkdir(path.join(sourceRoot, "sofa"), { recursive: true });
    await mkdir(path.join(sourceRoot, "previews"), { recursive: true });
    await writeFile(path.join(sourceRoot, "sofa", "shown.glb"), "shown-model");
    await writeFile(path.join(sourceRoot, "sofa", "hidden.glb"), "hidden-model");
    await writeFile(path.join(sourceRoot, "previews", "shown.png"), "shown-preview");
    await writeFile(path.join(sourceRoot, "catalog.json"), JSON.stringify({
      version: 1,
      items: [
        { fileName: "shown.glb", relativePath: "sofa/shown.glb", category: "sofa", thumbnailUrl: "/floor-plan-3d/furniture-assets/previews/shown.png" },
        { fileName: "hidden.glb", relativePath: "sofa/hidden.glb", category: "sofa" },
      ],
    }));

    const result = await buildFurnitureUploadPackage({ sourceRoot, destinationRoot });

    assert.deepEqual(result, { copiedItemCount: 1, skippedItemCount: 1, copiedPreviewCount: 1 });
    assert.equal(await readFile(path.join(destinationRoot, "sofa", "shown.glb"), "utf8"), "shown-model");
    assert.equal(await readFile(path.join(destinationRoot, "previews", "shown.png"), "utf8"), "shown-preview");
    await assert.rejects(readFile(path.join(destinationRoot, "sofa", "hidden.glb"), "utf8"));
    const catalog = JSON.parse(await readFile(path.join(destinationRoot, "catalog.json"), "utf8"));
    assert.deepEqual(catalog.items.map(item => item.fileName), ["shown.glb"]);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
