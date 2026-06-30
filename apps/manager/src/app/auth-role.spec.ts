import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ensureManagerAuth } from "./auth-role";

describe("manager auth role guard", () => {
  it("accepts manager auth results before the manager app persists them", () => {
    const auth = ensureManagerAuth({
      accessToken: "token-manager",
      name: "관리자",
      role: "LANDLORD",
      userId: "manager-1"
    });

    assert.equal(auth.role, "LANDLORD");
  });

  it("rejects tenant or vendor auth results before local storage persistence", () => {
    for (const role of ["TENANT", "VENDOR"]) {
      assert.throws(
        () =>
          ensureManagerAuth({
            accessToken: `token-${role.toLowerCase()}`,
            name: role,
            role,
            userId: `${role.toLowerCase()}-1`
          }),
        /관리자 계정/
      );
    }
  });
});
