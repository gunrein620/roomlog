import assert from "node:assert/strict";
import test from "node:test";
import { garaUpstreamPath } from "./gara-path";

test("rejects decoded traversal segments before constructing a Gara upstream path", () => {
  assert.equal(garaUpstreamPath(["..", "manager", "credits"]), null);
});

test("constructs only encoded paths rooted below /gara", () => {
  assert.equal(
    garaUpstreamPath(["vendor-credit-checkouts", "order-1", "confirm"]),
    "/gara/vendor-credit-checkouts/order-1/confirm",
  );
  assert.equal(garaUpstreamPath(["vendor-credit-checkouts", "a/b"]), null);
});
