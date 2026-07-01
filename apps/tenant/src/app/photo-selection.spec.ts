import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  normalizeSelectedPhotos,
  photoUploadStatus,
  selectedPhotoSummary,
  type SelectablePhoto
} from "./photo-selection";

const photos: SelectablePhoto[] = [
  { name: "bathroom-wide.jpg", size: 184 * 1024 },
  { name: "ceiling-close.jpg", size: 96 * 1024 },
  { name: "floor-water.jpg", size: 71 * 1024 },
  { name: "extra-angle.jpg", size: 42 * 1024 },
  { name: "ignored-fifth.jpg", size: 31 * 1024 }
];

describe("photo selection", () => {
  it("keeps the intake photo turn focused on the two useful photos", () => {
    assert.deepEqual(
      normalizeSelectedPhotos(photos).map((photo) => photo.name),
      ["bathroom-wide.jpg", "ceiling-close.jpg"]
    );
  });

  it("summarizes selected near and wide photos for the composer", () => {
    assert.equal(
      selectedPhotoSummary(photos.slice(0, 3)),
      "3장 첨부 예정 · 351.0KB · bathroom-wide.jpg, ceiling-close.jpg 외 1장"
    );
    assert.equal(photoUploadStatus(photos.slice(0, 2)), "사진 2장 업로드 중");
    assert.equal(photoUploadStatus([]), "AI가 상담 내용을 정리 중");
  });
});
