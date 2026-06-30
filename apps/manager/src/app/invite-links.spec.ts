import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildInviteHref } from "./invite-links";

describe("manager invite links", () => {
  it("opens legacy role-prefixed invite paths at each role app root", () => {
    assert.equal(
      buildInviteHref("/tenant?inviteToken=tenant-token", "http://localhost:3001"),
      "http://localhost:3001/?inviteToken=tenant-token"
    );
    assert.equal(
      buildInviteHref("/vendor?inviteToken=vendor-token", "http://localhost:3003"),
      "http://localhost:3003/?inviteToken=vendor-token"
    );
  });

  it("preserves root-relative and absolute invite URLs", () => {
    assert.equal(
      buildInviteHref("/?inviteToken=root-token", "http://localhost:3001"),
      "http://localhost:3001/?inviteToken=root-token"
    );
    assert.equal(
      buildInviteHref("https://roomlog.example/vendor?inviteToken=prod-token", "http://localhost:3003"),
      "https://roomlog.example/vendor?inviteToken=prod-token"
    );
  });
});
