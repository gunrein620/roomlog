import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("tenant AI intake confirms through chat without a separate filing button", () => {
  const page = readFileSync(join(process.cwd(), "src/app/my/flows/TenantMyPage.tsx"), "utf8");
  const hook = readFileSync(join(process.cwd(), "src/app/my/flows/useTenantAiAssistant.ts"), "utf8");

  assert.doesNotMatch(page, /aria-label="민원 접수 확인"/);
  assert.doesNotMatch(page, />\s*민원 접수\s*</);
  assert.match(hook, /draftForRequest/);
  assert.match(page, /ai\.draftForRequest/);
  assert.match(page, /setIsRequestSheetOpen\(true\)/);
});
