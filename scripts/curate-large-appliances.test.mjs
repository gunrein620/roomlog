import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { curateLargeAppliances } from "./curate-large-appliances.mjs";

test("replaces repeated electronics cards with distinct Korean-labelled appliance models", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "curate-large-appliances-"));
  try {
    const datasetRoot = path.join(workspace, "dataset");
    const importRoot = path.join(workspace, "imports");
    await mkdir(path.join(datasetRoot, "appliance"), { recursive: true });
    await mkdir(path.join(importRoot, "kenney"), { recursive: true });
    await writeFile(path.join(datasetRoot, "catalog.json"), JSON.stringify({ items: [
      { displayNameKo: "기존 가전", catalogCategory: "electronics", relativePath: "appliance/reused.glb" },
      { displayNameKo: "소파", catalogCategory: "sofa", relativePath: "sofa/keep.glb" },
    ] }));
    await writeFile(path.join(datasetRoot, "appliance", "fridge.glb"), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
    await writeFile(path.join(importRoot, "kenney", "stove.glb"), Buffer.from([0x67, 0x6c, 0x54, 0x46]));

    const result = await curateLargeAppliances({
      datasetRoot,
      importRoot,
      models: [
        { displayNameKo: "기본 냉장고", relativePath: "appliance/fridge.glb", sizeMm: { width: 600, height: 1500, depth: 600 }, thumbnailUrl: "https://example.com/fridge.png" },
        { displayNameKo: "전기레인지", relativePath: "appliance/stove.glb", sourceRelativePath: "kenney/stove.glb", sizeMm: { width: 600, height: 850, depth: 600 }, thumbnailUrl: "https://example.com/stove.png" },
      ],
    });

    assert.deepEqual(result, { applianceCount: 2, catalogItemCount: 3 });
    const catalog = JSON.parse(await readFile(path.join(datasetRoot, "catalog.json"), "utf8"));
    assert.deepEqual(catalog.items.map(item => item.displayNameKo), ["소파", "기본 냉장고", "전기레인지"]);
    assert.equal(new Set(catalog.items.map(item => item.relativePath)).size, 3);
    assert.equal(catalog.items[1].catalogCategory, "electronics");
    assert.match(catalog.items[1].displayNameKo, /^[가-힣0-9 ]+$/);
    assert.deepEqual(await readFile(path.join(datasetRoot, "appliance", "stove.glb")), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects an appliance card whose GLB source is missing", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "curate-missing-model-"));
  try {
    const datasetRoot = path.join(workspace, "dataset");
    await mkdir(datasetRoot, { recursive: true });
    await writeFile(path.join(datasetRoot, "catalog.json"), JSON.stringify({ items: [] }));

    await assert.rejects(
      curateLargeAppliances({
        datasetRoot,
        importRoot: path.join(workspace, "imports"),
        models: [{ displayNameKo: "기본 냉장고", relativePath: "appliance/missing.glb", sizeMm: { width: 600, height: 1500, depth: 600 }, thumbnailUrl: "https://example.com/fridge.png" }],
      }),
      /GLB source is missing/i,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
