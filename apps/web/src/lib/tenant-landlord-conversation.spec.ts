import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  formatTenantLandlordUnreadCount,
  isTenantLandlordMessagingActivity,
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
  assert.equal(
    tenantLandlordConversationPaths.thread("mth 1"),
    "/api/tenant/messaging/threads/mth%201"
  );
  assert.equal(
    tenantLandlordConversationPaths.read("mth 1"),
    "/api/tenant/messaging/threads/mth%201/read"
  );
  assert.equal(
    tenantLandlordConversationPaths.current("room 301"),
    "/api/tenant/messaging/landlord-conversation?roomId=room%20301"
  );
  assert.deepEqual(tenantLandlordThreadInput("  수도 문의입니다.  "), {
    context: "general",
    contextLabel: "일반 문의",
    body: "수도 문의입니다."
  });
  assert.deepEqual(tenantLandlordThreadInput("  수도 문의입니다.  ", "room-301"), {
    roomId: "room-301",
    context: "general",
    contextLabel: "일반 문의",
    body: "수도 문의입니다."
  });
  assert.equal(tenantLandlordThreadHref("mth 1"), "/tenant/messaging/01?id=mth%201");
});

test("formats and filters tenant landlord unread updates", () => {
  assert.equal(formatTenantLandlordUnreadCount(0), "");
  assert.equal(formatTenantLandlordUnreadCount(-1), "");
  assert.equal(formatTenantLandlordUnreadCount(7), "7");
  assert.equal(formatTenantLandlordUnreadCount(100), "99+");
  assert.equal(isTenantLandlordMessagingActivity({ kind: "messaging" }), true);
  assert.equal(isTenantLandlordMessagingActivity({ kind: "messaging", action: "read" }), true);
  assert.equal(isTenantLandlordMessagingActivity({ kind: "ticket" }), false);
  assert.equal(isTenantLandlordMessagingActivity(null), false);
});

test("trims an empty first message for client validation", () => {
  assert.equal(tenantLandlordThreadInput("   ").body, "");
});

test("builds an empty landlord thread request for direct chat entry", () => {
  assert.deepEqual(tenantLandlordThreadInput(), {
    context: "general",
    contextLabel: "일반 문의",
    body: ""
  });
});

test("tenant my page opens landlord inquiries through roomlog messaging", () => {
  const source = readFileSync(
    join(__dirname, "../app/my/flows/TenantMyPage.tsx"),
    "utf8"
  );

  assert.match(source, /tenantLandlordConversationPaths/);
  assert.match(source, /openLandlordConversation/);
  assert.match(source, /loadLandlordUnreadCount/);
  assert.match(source, /markTenantLandlordThreadRead/);
  assert.match(source, /tenant-landlord-unread-badge/);
  assert.match(source, /landlordInquiryLabel/);
  assert.doesNotMatch(source, /submitLandlordMessage/);
  assert.doesNotMatch(source, /setIsLandlordChatOpen/);
  assert.doesNotMatch(source, /TradeChatCenter/);
});
