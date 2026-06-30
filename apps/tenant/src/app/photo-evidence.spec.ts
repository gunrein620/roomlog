import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { photoEvidenceItems } from "./photo-evidence";

describe("photo evidence", () => {
  it("labels current and previous photos for the intake analysis preview", () => {
    assert.deepEqual(
      photoEvidenceItems({
        attachmentUrls: ["/uploads/current-wide.jpg", "/uploads/current-close.png"],
        previousAttachmentUrls: ["/uploads/move-in-before.webp"]
      }),
      [
        {
          url: "/uploads/current-wide.jpg",
          label: "현재 사진 1",
          variant: "current"
        },
        {
          url: "/uploads/current-close.png",
          label: "현재 사진 2",
          variant: "current"
        },
        {
          url: "/uploads/move-in-before.webp",
          label: "입주 전 기준 사진 1",
          variant: "previous"
        }
      ]
    );
  });

  it("removes blank and repeated evidence urls while preserving order", () => {
    assert.deepEqual(
      photoEvidenceItems({
        attachmentUrls: [" /uploads/current.jpg ", "", "/uploads/current.jpg"],
        previousAttachmentUrls: ["/uploads/current.jpg", "/uploads/before.jpg"]
      }),
      [
        {
          url: "/uploads/current.jpg",
          label: "현재 사진 1",
          variant: "current"
        },
        {
          url: "/uploads/before.jpg",
          label: "입주 전 기준 사진 1",
          variant: "previous"
        }
      ]
    );
  });
});
