import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "03/page.tsx"), "utf8");
const selectionPath = join(__dirname, "_dispute-selection.tsx");
const selectionSource = existsSync(selectionPath) ? readFileSync(selectionPath, "utf8") : "";

test("manager moveout dispute queue uses single-select checkbox cards", () => {
  assert.match(pageSource, /import \{ DisputeSelectionList \} from "\.\.\/_dispute-selection"/);
  assert.doesNotMatch(pageSource, /<select[\s\S]*name="selectedDisputeId"/);
  assert.doesNotMatch(pageSource, /처리 대상 선택/);
  assert.match(selectionSource, /type="checkbox"/);
  assert.match(selectionSource, /checked=\{dispute\.id === selectedDisputeId\}/);
  assert.match(selectionSource, /query\.set\("selectedDisputeId", disputeId\)/);
});

test("manager moveout original comparison mirrors the selected dispute as a checkbox item", () => {
  assert.match(pageSource, /대상 항목/);
  assert.match(pageSource, /type="checkbox"[\s\S]*checked=\{Boolean\(selected\)\}/);
  assert.match(pageSource, /readOnly/);
  assert.match(pageSource, /selected\?\.targetLabel/);
});
