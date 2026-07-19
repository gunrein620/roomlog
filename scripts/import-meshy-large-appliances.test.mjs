import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverMeshyModels, importMeshyLargeAppliances } from "./import-meshy-large-appliances.mjs";

test("discovers distinct model pages from the requested appliance tags", async () => {
  const page = `<a href="/3d-models/Modern-Fridge-111"></a><a href="/3d-models/Retro-Fridge-222"></a>`;
  const models = await discoverMeshyModels([{ tag: "refrigerator", categoryKo: "냉장고", limit: 2 }], async () => ({ ok: true, text: async () => page }));

  assert.deepEqual(models, [
    { categoryKo: "냉장고", ordinal: 1, sourceUrl: "https://www.meshy.ai/3d-models/Modern-Fridge-111" },
    { categoryKo: "냉장고", ordinal: 2, sourceUrl: "https://www.meshy.ai/3d-models/Retro-Fridge-222" },
  ]);
});

test("filters out tag matches that are not the requested appliance type", async () => {
  const page = `<a href="/3d-models/Titan-TV-Man-111"></a><a href="/3d-models/Modern-Television-222"></a>`;
  const models = await discoverMeshyModels([{
    tag: "tv",
    categoryKo: "TV",
    limit: 1,
    includePattern: "television|tv",
    excludePattern: "man",
  }], async () => ({ ok: true, text: async () => page }));

  assert.deepEqual(models, [{ categoryKo: "TV", ordinal: 1, sourceUrl: "https://www.meshy.ai/3d-models/Modern-Television-222" }]);
});

test("imports one CC0 GLB per catalog card without reusing a model path", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "meshy-large-appliances-"));
  try {
    await writeFile(path.join(workspace, "catalog.json"), JSON.stringify({ items: [] }));
    const fetcher = async (url) => {
      if (url.includes("download=glb")) return { ok: true, arrayBuffer: async () => Uint8Array.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]).buffer };
      return {
        ok: true,
        text: async () => `<script type="application/ld+json">{"@type":["3DModel","Product"],"name":"Modern Fridge","image":"https://api.meshy.ai/preview.png","encoding":[{"name":"GLB Format","contentUrl":"https://www.meshy.ai/3d-models/Modern-Fridge-111?download=glb"}],"license":"https://creativecommons.org/publicdomain/zero/1.0/"}</script>`,
      };
    };

    const result = await importMeshyLargeAppliances({
      datasetRoot: workspace,
      models: [{ categoryKo: "냉장고", ordinal: 1, sourceUrl: "https://www.meshy.ai/3d-models/Modern-Fridge-111" }],
      fetcher,
    });

    assert.deepEqual(result, { importedItemCount: 1, catalogItemCount: 1 });
    const catalog = JSON.parse(await readFile(path.join(workspace, "catalog.json"), "utf8"));
    assert.equal(catalog.items[0].displayNameKo, "냉장고 01");
    assert.match(catalog.items[0].relativePath, /^appliance\/meshy-.*\.glb$/);
    assert.equal(catalog.items[0].thumbnailUrl, "https://www.meshy.ai/api/3d-models-og-image/Modern-Fridge-111");
    assert.deepEqual(
      (await readFile(path.join(workspace, ...catalog.items[0].relativePath.split("/")))).subarray(0, 4),
      Buffer.from([0x67, 0x6c, 0x54, 0x46]),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects a model download that is not a GLB file", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "meshy-invalid-model-"));
  try {
    await writeFile(path.join(workspace, "catalog.json"), JSON.stringify({ items: [] }));
    const fetcher = async (url) => {
      if (url.includes("download=glb")) return { ok: true, arrayBuffer: async () => new TextEncoder().encode("not-a-glb").buffer };
      return {
        ok: true,
        text: async () => `<script type="application/ld+json">{"@type":"3DModel","name":"Modern Fridge","encoding":[{"name":"GLB Format","contentUrl":"https://www.meshy.ai/3d-models/Modern-Fridge-111?download=glb"}],"license":"https://creativecommons.org/publicdomain/zero/1.0/"}</script>`,
      };
    };

    await assert.rejects(
      importMeshyLargeAppliances({
        datasetRoot: workspace,
        models: [{ categoryKo: "냉장고", ordinal: 1, sourceUrl: "https://www.meshy.ai/3d-models/Modern-Fridge-111" }],
        fetcher,
      }),
      /not a valid GLB/i,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
