import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { missingUploadPlaceholderSvg } from "../missing-upload-placeholder";

describe("missing upload placeholder", () => {
  it("renders a safe SVG placeholder for missing local upload files", () => {
    const svg = missingUploadPlaceholderSvg("../<script>alert(1)</script>.png");

    assert.match(svg, /^<svg /);
    assert.match(svg, /PHOTO RECORD/);
    assert.match(svg, /LOCAL FILE MISSING/);
    assert.doesNotMatch(svg, /<script>/);
    assert.doesNotMatch(svg, /\.\./);
  });
});
