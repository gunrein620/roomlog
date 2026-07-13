import assert from "node:assert/strict";
import test from "node:test";
import {
  tenantLandlordConversationPaths,
  tenantLandlordThreadHref,
  tenantLandlordThreadInput
} from "./tenant-landlord-conversation";

test("builds the tenant landlord messaging contract", () => {
  assert.equal(
    tenantLandlordConversationPaths.current(),
    "/api/tenant/messaging/landlord-conversation"
  );
  assert.equal(tenantLandlordConversationPaths.threads(), "/api/tenant/messaging/threads");
  assert.deepEqual(tenantLandlordThreadInput("  수도 문의입니다.  "), {
    context: "general",
    contextLabel: "일반 문의",
    body: "수도 문의입니다."
  });
  assert.equal(tenantLandlordThreadHref("mth 1"), "/tenant/messaging/01?id=mth%201");
});

test("trims an empty first message for client validation", () => {
  assert.equal(tenantLandlordThreadInput("   ").body, "");
});
