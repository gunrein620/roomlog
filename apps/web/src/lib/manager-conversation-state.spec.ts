import assert from "node:assert/strict";
import test from "node:test";
import type { ManagerMessagingRecipient } from "@roomlog/types";
import {
  conversationRecipientKey,
  findConversationRecipient,
  recipientsForBuilding,
} from "./manager-conversation-state";

const recipients: ManagerMessagingRecipient[] = [
  {
    roomId: "room-a-101",
    buildingName: "계약 빌딩",
    unitId: "101",
    tenantId: "tenant-a",
    tenantName: "김세입",
  },
  {
    roomId: "room-b-201",
    buildingName: "다른 빌딩",
    unitId: "201",
    tenantId: "tenant-b",
    tenantName: "이세입",
    existingGeneralThreadId: "mth-existing",
  },
];

test("filters conversation recipients by building", () => {
  assert.deepEqual(
    recipientsForBuilding(recipients, "계약 빌딩").map((item) => item.tenantId),
    ["tenant-a"],
  );
  assert.deepEqual(recipientsForBuilding(recipients, ""), recipients);
});

test("finds one conversation recipient from its stable room and tenant key", () => {
  const key = conversationRecipientKey(recipients[1]);

  assert.equal(key, "room-b-201:tenant-b");
  assert.equal(findConversationRecipient(recipients, key)?.existingGeneralThreadId, "mth-existing");
  assert.equal(findConversationRecipient(recipients, "missing"), undefined);
});
