import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const cssSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const detailPanelStart = cssSource.indexOf("/* 세입자 민원/하자 이력 상세");
const detailPanelEnd = cssSource.indexOf("@media (max-width: 768px)", detailPanelStart);
const desktopDetailPanelCss = cssSource.slice(detailPanelStart, detailPanelEnd);

test("tenant repair progress messages fill the remaining desktop detail panel height", () => {
  assert.match(
    desktopDetailPanelCss,
    /\.notification-sheet\.tenant-request-detail-panel\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
  );
  assert.match(
    desktopDetailPanelCss,
    /\.tenant-request-detail-panel \.tenant-request-detail-form\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
  );
  assert.match(
    desktopDetailPanelCss,
    /\.tenant-request-detail-panel \.tenant-defect-messages\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;/,
  );
  assert.match(
    desktopDetailPanelCss,
    /\.tenant-request-detail-panel \.tenant-defect-messages ul\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;[\s\S]*?height:\s*auto;/,
  );
});
