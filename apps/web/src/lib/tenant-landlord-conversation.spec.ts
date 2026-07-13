import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("tenant my page opens landlord inquiries through roomlog messaging", () => {
  const source = readFileSync(
    join(__dirname, "../app/my/flows/TenantMyPage.tsx"),
    "utf8"
  );

  assert.match(source, /tenantLandlordConversationPaths/);
  assert.match(source, /openLandlordConversation/);
  assert.match(source, /submitLandlordMessage/);
  assert.doesNotMatch(source, /TradeChatCenter/);
});
