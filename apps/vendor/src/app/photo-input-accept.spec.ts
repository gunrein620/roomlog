import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("vendor photo inputs", () => {
  it("limits selectable upload files to server-supported image formats", () => {
    assert.doesNotMatch(pageSource, /accept="image\/\*"/);
    assert.match(pageSource, /image\/jpeg,image\/png,image\/webp/);
  });
});
