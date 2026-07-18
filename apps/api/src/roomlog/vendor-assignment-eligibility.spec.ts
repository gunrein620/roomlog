import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isDirectManagerVendor } from "./vendor-assignment-eligibility";

test("treats a manager's directly registered vendor as assignable without a linked account", () => {
  assert.equal(
    isDirectManagerVendor({ createdByManagerId: "manager-1" }, "manager-1"),
    true,
  );
  assert.equal(
    isDirectManagerVendor({ createdByManagerId: "manager-2" }, "manager-1"),
    false,
  );
  assert.equal(isDirectManagerVendor({ createdByManagerId: null }, "manager-1"), false);
});
