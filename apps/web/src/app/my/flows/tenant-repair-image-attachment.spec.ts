import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(process.cwd(), "src/app/my/flows/TenantMyPage.tsx"), "utf8");

test("tenant repair image attachment button shows an icon without visible text", () => {
  const attachmentControl = pageSource.slice(
    pageSource.indexOf('<label className="tenant-request-image-input"'),
    pageSource.indexOf("{requestImages.map", pageSource.indexOf('<label className="tenant-request-image-input"')),
  );

  assert.match(attachmentControl, /<ImagePlus size=\{24\} strokeWidth=\{2\.4\} aria-hidden="true" \/>/);
  assert.match(attachmentControl, /<span className="tenant-sr-only">이미지 첨부<\/span>/);
  assert.doesNotMatch(attachmentControl, /<span>(?:이미지|사진)/);
});
