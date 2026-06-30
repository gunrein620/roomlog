import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ensureVendorAuth } from "./auth-role";

describe("vendor auth role guard", () => {
  it("accepts vendor auth results before the vendor app persists them", () => {
    const auth = ensureVendorAuth({
      accessToken: "token-vendor",
      name: "협력업체",
      role: "VENDOR",
      userId: "vendor-1"
    });

    assert.equal(auth.role, "VENDOR");
  });

  it("rejects tenant or manager auth results before local storage persistence", () => {
    for (const role of ["TENANT", "LANDLORD"]) {
      assert.throws(
        () =>
          ensureVendorAuth({
            accessToken: `token-${role.toLowerCase()}`,
            name: role,
            role,
            userId: `${role.toLowerCase()}-1`
          }),
        /업체 계정/
      );
    }
  });
});
