import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(process.cwd(), "src/app/my/flows/TenantMyPage.tsx"), "utf8");

test("tenant repair photo attachment controls show icons without visible text", () => {
  const requestAttachmentControl = pageSource.slice(
    pageSource.indexOf('<label className="tenant-request-image-input"'),
    pageSource.indexOf("{requestImages.map", pageSource.indexOf('<label className="tenant-request-image-input"')),
  );
  const messageAttachmentControl = pageSource.slice(
    pageSource.indexOf('<label className="tenant-defect-chat-attach"'),
    pageSource.indexOf("</label>", pageSource.indexOf('<label className="tenant-defect-chat-attach"')),
  );

  assert.match(requestAttachmentControl, /<ImagePlus size=\{24\} strokeWidth=\{2\.4\} aria-hidden="true" \/>/);
  assert.match(requestAttachmentControl, /<span className="tenant-sr-only">이미지 첨부<\/span>/);
  assert.doesNotMatch(requestAttachmentControl, /<span>(?:이미지|사진)/);
  assert.match(messageAttachmentControl, /<label className="tenant-defect-chat-attach" aria-label="사진 첨부">/);
  assert.match(messageAttachmentControl, /<ImagePlus aria-hidden="true" \/>/);
  assert.doesNotMatch(messageAttachmentControl, /<span/);
});
