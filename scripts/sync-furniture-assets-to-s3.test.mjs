import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("uploads local furniture preview PNGs with the GLB package", async () => {
  const source = await readFile(new URL("./sync-furniture-assets-to-s3.ps1", import.meta.url), "utf8");
  assert.match(source, /--include\s+"\*\.png"/);
});
