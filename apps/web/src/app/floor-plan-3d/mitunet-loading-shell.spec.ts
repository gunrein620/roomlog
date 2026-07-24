import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);

test("hides the empty top-left workspace shell until the 3D camera tools are ready", () => {
  assert.match(
    viewerSource,
    /body:not\(\.upload-empty\) #ui:has\(#camera-view-controls\[hidden\]\) \{ display: none; \}/,
  );
});
