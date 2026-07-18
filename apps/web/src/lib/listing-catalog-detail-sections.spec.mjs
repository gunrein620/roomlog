import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("listing detail catalog sections", () => {
  it("exports the safety and neighborhood data used by ListingDetailView", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "listing-catalog.ts"),
      "utf8"
    );

    assert.match(source, /export const safetyReportItems\s*=/);
    assert.match(source, /export const neighborhoodItems\s*=/);
  });
});
