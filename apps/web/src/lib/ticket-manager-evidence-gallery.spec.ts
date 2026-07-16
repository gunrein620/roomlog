import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const thumbnailGalleryPath = join(
  __dirname,
  "../app/manager/ticket/dash/01/AttachmentThumbnailGallery.tsx",
);
const pageSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);

describe("manager ticket evidence gallery", () => {
  it("renders an accessible large-image modal from the shared thumbnail gallery", () => {
    const thumbnailGallerySource = readFileSync(thumbnailGalleryPath, "utf8");

    assert.match(thumbnailGallerySource, /manager-ticket-dialog__attachment-thumbnail/);
    assert.match(thumbnailGallerySource, /manager-ticket-image-preview/);
    assert.match(thumbnailGallerySource, /role="dialog"/);
    assert.match(thumbnailGallerySource, /aria-modal="true"/);
    assert.match(thumbnailGallerySource, /event\.key === "Escape"/);
    assert.match(thumbnailGallerySource, /event\.target === event\.currentTarget/);
    assert.match(thumbnailGallerySource, /manager-ticket-dialog__attachment-fallback/);
  });

  it("shows thumbnails only in the tenant input attachment card", () => {
    assert.equal(existsSync(thumbnailGalleryPath), true);
    assert.match(
      pageSource,
      /<AttachmentThumbnailGallery\s+attachmentUrls=\{detail\.attachmentUrls\}/,
    );
    assert.doesNotMatch(pageSource, /TicketEvidenceGallery|사진 비교·근거/);
    assert.doesNotMatch(pageSource, /<Badge>사진 \{detail\.attachmentUrls\.length\}장<\/Badge>/);
  });
});
