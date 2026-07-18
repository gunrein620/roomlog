import type { VendorJobMessageView } from "@roomlog/types";

export function vendorJobMessageSenderLabel(
  role: VendorJobMessageView["senderRole"]
) {
  if (role === "VENDOR") return "나";
  if (role === "TENANT") return "세입자";
  return "관리자";
}

export function canVendorSendJobMessage(status: string) {
  return [
    "REQUESTED",
    "ACCEPTED",
    "ESTIMATE_SUBMITTED",
    "ESTIMATE_APPROVED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETION_REPORTED",
  ].includes(status);
}
