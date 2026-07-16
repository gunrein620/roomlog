import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const componentPath = join(
  __dirname,
  "../app/manager/ticket/dash/01/TicketEvidenceGallery.tsx",
);
const pageSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);

describe("manager ticket evidence gallery", () => {
  it("renders real attachment thumbnails and an accessible large-image modal", () => {
    assert.equal(existsSync(componentPath), true);
    const componentSource = readFileSync(componentPath, "utf8");

    assert.match(pageSource, /<TicketEvidenceGallery attachmentUrls=\{detail\.attachmentUrls\}/);
    assert.match(componentSource, /manager-ticket-dialog__attachment-thumbnail/);
    assert.match(componentSource, /manager-ticket-image-preview/);
    assert.match(componentSource, /role="dialog"/);
    assert.match(componentSource, /aria-modal="true"/);
    assert.match(componentSource, /event\.key === "Escape"/);
    assert.match(componentSource, /event\.target === event\.currentTarget/);
    assert.match(componentSource, /조회할 사진 비교·근거 내용이 없습니다\./);
    assert.match(componentSource, /manager-ticket-dialog__attachment-fallback/);
  });
});
