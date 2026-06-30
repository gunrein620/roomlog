import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { resolveAttachmentUrl } from "./attachment-url";

describe("tenant attachment urls", () => {
  it("resolves API-relative uploaded file urls against an absolute API base", () => {
    assert.equal(
      resolveAttachmentUrl("/api/files/leak-photo.png", "http://localhost:4000"),
      "http://localhost:4000/api/files/leak-photo.png"
    );
    assert.equal(
      resolveAttachmentUrl("/api/files/leak-photo.png", "http://localhost:4000/api"),
      "http://localhost:4000/api/files/leak-photo.png"
    );
  });

  it("keeps same-origin and already absolute attachment urls unchanged", () => {
    assert.equal(resolveAttachmentUrl("/api/files/leak-photo.png", "/api"), "/api/files/leak-photo.png");
    assert.equal(
      resolveAttachmentUrl("https://cdn.example.com/leak-photo.png", "http://localhost:4000"),
      "https://cdn.example.com/leak-photo.png"
    );
    assert.equal(
      resolveAttachmentUrl("data:image/png;base64,abc", "http://localhost:4000"),
      "data:image/png;base64,abc"
    );
  });
});
