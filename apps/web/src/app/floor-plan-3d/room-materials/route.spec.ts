import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-materials/route.ts"),
  "utf8",
);

test("room material route forwards authenticated room-structure analysis", () => {
  assert.match(source, /serverFetch/);
  assert.match(source, /analysisMode:\s*"room-structure"/);
  assert.match(source, /model:\s*"openai\/floor-plan-vision"/);
  assert.match(source, /imageDataUrl/);
});
