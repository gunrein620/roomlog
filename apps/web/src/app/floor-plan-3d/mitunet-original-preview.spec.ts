import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);
const reviewEditorSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/review-editor.mjs"),
  "utf8",
);

test("opens the saved source plan in 2D when no editable review document exists", () => {
  assert.match(
    viewerSource,
    /function originalPreviewImageB64\(\) \{[\s\S]*?currentComposedPlan\?\.input_image_b64[\s\S]*?currentComposedPlan\?\.analysis_image_b64[\s\S]*?currentExtraction\?\.input_image_b64/,
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

test("clears the previous editable review before committing a static sample", () => {
  const fetchAndLoadBody = viewerSource.split("async function fetchAndLoad(url, init)", 2)[1]
    ?.split("async function startLandingSample()", 1)[0] ?? "";

  assert.match(
    viewerSource,
    /function resetReviewState\(\)\s*\{[\s\S]*?currentExtraction\s*=\s*null;[\s\S]*?reviewEditor\?\.clear\(\);/,
  );
  assert.match(
    fetchAndLoadBody,
    /const rendered = await loadPlan\(data\);[\s\S]*?if \(!rendered\)[\s\S]*?resetReviewState\(\);[\s\S]*?currentComposedPlan = data;/,
  );
  assert.match(
    reviewEditorSource,
    /clear\(\)\s*\{[\s\S]*?this\.document\s*=\s*null;[\s\S]*?this\.inputImage\s*=\s*null;/,
  );
});

test("turns a saved source plan into an editable review before opening 2D", () => {
  const showOriginalBody = viewerSource.split("async function showOriginalView()", 2)[1]
    ?.split("function syncCorrectedOpenings", 1)[0] ?? "";

  assert.match(
    viewerSource,
    /function buildEditableReviewPayload\(plan\)\s*\{[\s\S]*?plan\?\.polygons\?\.wall[\s\S]*?wall_mask_b64/,
  );
  assert.match(
    viewerSource,
    /async function prepareEditableReviewDocument\(\)\s*\{[\s\S]*?await reviewEditor\.load\(editablePayload\);[\s\S]*?reviewEditor\.document\.markRendered\(\);[\s\S]*?currentExtraction\s*=\s*editablePayload;/,
  );
  assert.match(showOriginalBody, /await prepareEditableReviewDocument\(\)/);
});

test("keeps the active 3D plan visible if the 2D preview cannot be prepared", () => {
  const showOriginalBody = viewerSource.split("async function showOriginalView()", 2)[1]
    ?.split("function syncCorrectedOpenings", 1)[0] ?? "";

  assert.match(
    showOriginalBody,
    /const previewReady = await prepareEditableReviewDocument\(\);[\s\S]*?if \(!previewReady\) return;[\s\S]*?setPlanGeometryVisible\(false\);/,
  );
  assert.match(showOriginalBody, /catch \(error\) \{[\s\S]*?setStatus\(/);
});
