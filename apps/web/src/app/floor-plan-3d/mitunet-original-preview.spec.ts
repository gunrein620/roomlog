import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);

test("opens the saved source plan in 2D when no editable review document exists", () => {
  assert.match(
    viewerSource,
    /function originalPreviewImageB64\(\) \{[\s\S]*?currentExtraction\?\.input_image_b64[\s\S]*?currentComposedPlan\?\.input_image_b64[\s\S]*?currentComposedPlan\?\.analysis_image_b64/,
  );
  assert.match(viewerSource, /function canShowOriginalView\(\) \{[\s\S]*?originalPreviewImageB64\(\)/);
  assert.match(
    viewerSource,
    /button\.dataset\.view === "original"\s*\? canShowOriginalView\(\)/,
  );
  assert.match(
    viewerSource,
    /async function showOriginalView\(\) \{[\s\S]*?!canShowOriginalView\(\)[\s\S]*?await renderOriginalPreview\(\);/,
  );
});
