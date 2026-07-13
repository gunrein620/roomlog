import type { ManagerMessagingRecipient } from "@roomlog/types";

export function conversationRecipientKey(
  recipient: Pick<ManagerMessagingRecipient, "roomId" | "tenantId">,
): string {
  return `${recipient.roomId}:${recipient.tenantId}`;
}

export function recipientsForBuilding(
  recipients: ManagerMessagingRecipient[],
  buildingName: string,
): ManagerMessagingRecipient[] {
  if (!buildingName) return recipients;

  return recipients.filter((recipient) => recipient.buildingName === buildingName);
}

export function findConversationRecipient(
  recipients: ManagerMessagingRecipient[],
  key: string,
): ManagerMessagingRecipient | undefined {
  return recipients.find((recipient) => conversationRecipientKey(recipient) === key);
}
