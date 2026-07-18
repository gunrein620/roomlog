import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveRoomlogRuntimePath } from "./runtime-asset-path";

test("resolves RoomLog-relative runtime assets from the repository root", () => {
  const webRoot = path.join("C:", "roomlog", "apps", "web");
  assert.equal(
    resolveRoomlogRuntimePath("services/mitunet", webRoot),
    path.resolve(webRoot, "..", "..", "services/mitunet"),
  );
});

test("keeps absolute container mount paths absolute", () => {
  const absoluteRoot = path.resolve(path.sep, "mitunet");
  assert.equal(resolveRoomlogRuntimePath(absoluteRoot), absoluteRoot);
});
