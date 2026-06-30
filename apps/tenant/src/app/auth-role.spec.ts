import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ensureTenantAuth } from "./auth-role";

describe("tenant auth role guard", () => {
  it("accepts tenant auth results before the tenant app persists them", () => {
    const auth = ensureTenantAuth({
      accessToken: "token-tenant",
      name: "세입자",
      role: "TENANT",
      userId: "tenant-1"
    });

    assert.equal(auth.role, "TENANT");
  });

  it("rejects manager or vendor auth results before local storage persistence", () => {
    for (const role of ["LANDLORD", "VENDOR"]) {
      assert.throws(
        () =>
          ensureTenantAuth({
            accessToken: `token-${role.toLowerCase()}`,
            name: role,
            role,
            userId: `${role.toLowerCase()}-1`
          }),
        /세입자 계정/
      );
    }
  });
});
