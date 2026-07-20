import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const tenantPageSource = readFileSync(
  join(root, "src/app/my/flows/TenantMyPage.tsx"),
  "utf8",
);
const cssSource = readFileSync(join(root, "src/app/globals.css"), "utf8");

describe("tenant AI split panel", () => {
  it("opens directly into conversation without a mode chooser dialog", () => {
    assert.doesNotMatch(tenantPageSource, /manager-ai-mode-picker/);
    assert.doesNotMatch(tenantPageSource, /aiDialogRef|showModal\(\)/);
    assert.match(tenantPageSource, /TenantAiAssistantPanel/);
  });

  it("uses a desktop split and a responsive full-screen assistant", () => {
    assert.match(cssSource, /\.tenant-ai-workspace--open/);
    assert.match(
      cssSource,
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--tenant-ai-panel-width\)/,
    );
    assert.match(cssSource, /@media \(max-width:\s*1024px\)/);
    assert.match(
      cssSource,
      /\.tenant-ai-assistant-panel[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/,
    );
  });
});
