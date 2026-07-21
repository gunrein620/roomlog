import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const specDir = dirname(fileURLToPath(import.meta.url));
const serviceWorkerSource = readFileSync(join(specDir, "../../public/sw.js"), "utf8");

test("does not cache the live MitUNet editor or its integration API", () => {
  assert.match(serviceWorkerSource, /url\.pathname === "\/floor-plan-3d\/mitunet"/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/floor-plan-3d\/mitunet-api\/"\)/);
});
