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
const tokenSource = readFileSync(join(root, "../../packages/ui/src/tokens.css"), "utf8");

function firstCssRule(selector: string) {
  const start = cssSource.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} rule must exist`);
  const end = cssSource.indexOf("}", start);
  assert.notEqual(end, -1, `${selector} rule must close`);
  return cssSource.slice(start, end + 1);
}

describe("tenant AI split panel", () => {
  it("opens directly into conversation without a mode chooser dialog", () => {
    assert.doesNotMatch(tenantPageSource, /manager-ai-mode-picker/);
    assert.doesNotMatch(tenantPageSource, /aiDialogRef|showModal\(\)/);
    assert.match(tenantPageSource, /TenantAiAssistantPanel/);
  });

  it("overlays the desktop page instead of adding a grid column", () => {
    assert.match(cssSource, /\.tenant-ai-workspace--open/);
    assert.doesNotMatch(
      firstCssRule(".tenant-ai-workspace--open"),
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--tenant-ai-panel-width\)/,
    );
    assert.match(firstCssRule(".tenant-ai-assistant-panel"), /position:\s*fixed/);
    assert.match(firstCssRule(".tenant-ai-assistant-panel"), /right:\s*0/);
    assert.match(
      firstCssRule(".tenant-ai-assistant-panel"),
      /z-index:\s*var\(--z-modal\)/,
    );
  });

  it("uses a responsive full-screen assistant above the mobile navigation", () => {
    assert.match(cssSource, /@media \(max-width:\s*1024px\)/);
    assert.match(
      cssSource,
      /@media \(max-width:\s*1024px\)[\s\S]*\.tenant-ai-assistant-panel\s*\{[\s\S]*inset:\s*0[\s\S]*z-index:\s*var\(--z-modal\)/,
    );
    assert.match(
      cssSource,
      /\.tenant-ai-assistant-panel \.manager-ai-mode-toggle\s*\{[\s\S]*padding-bottom:\s*max\([^;]*safe-area-inset-bottom[^;]*\)/,
    );
    assert.match(
      cssSource,
      /\.service-frame\.with-bottom-tabs:has\(\.tenant-ai-workspace--open\) > \.bottom-tabs\s*\{[\s\S]*display:\s*none/,
    );
  });

  it("keeps the AI conversation available while its complaint draft is edited", () => {
    assert.match(tenantPageSource, /AI가 작성한 초안/);
    assert.match(tenantPageSource, /AI 대화로 돌아가기/);
    assert.match(tenantPageSource, /markTenantAiDraftFormOpen\(true\)/);
    assert.match(
      cssSource,
      /\.tenant-ai-workspace--open[\s\S]*\.notification-sheet-backdrop[\s\S]*right:\s*var\(--tenant-ai-panel-width\)/,
    );
  });

  it("stacks the assistant above the desktop top bar so its close control receives clicks", () => {
    assert.match(tokenSource, /--z-modal:\s*60;/);
    assert.match(firstCssRule(".tenant-ai-assistant-panel"), /z-index:\s*var\(--z-modal\)/);
  });
});
