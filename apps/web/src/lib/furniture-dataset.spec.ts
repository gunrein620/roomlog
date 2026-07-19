import test from "node:test";
import assert from "node:assert/strict";

import { furnitureContentTypeFor } from "./furniture-dataset";

test("serves local furniture preview PNGs as images", () => {
  assert.equal(furnitureContentTypeFor("appliance/kenney-previews/fridge.png"), "image/png");
});
