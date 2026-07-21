import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "scripts/next-with-root-env.mjs"), "utf8");

test("loads the root .env.local override after the shared root .env", () => {
  assert.match(source, /const rootLocalEnvPath = resolve\(appDir, "\.\.", "\.\.", "\.env\.local"\);/);
  assert.match(source, /loadRootEnv\(rootEnvPath, false\);\s*loadRootEnv\(rootLocalEnvPath, true\);/);
});
