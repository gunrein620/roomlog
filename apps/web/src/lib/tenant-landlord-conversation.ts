import type { CreateTenantMessagingThreadInput } from "@roomlog/types";

export const tenantLandlordConversationPaths = {
  current: (roomId?: string) =>
    `/api/tenant/messaging/landlord-conversation${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ""}`,
  threads: () => "/api/tenant/messaging/threads",
} as const;

export function tenantLandlordThreadInput(body = "", roomId?: string): CreateTenantMessagingThreadInput {
  return {
    ...(roomId ? { roomId } : {}),
    context: "general",
    contextLabel: "일반 문의",
    body: body.trim(),
  };
}

export function tenantLandlordThreadHref(threadId: string): string {
  return `/tenant/messaging/01?id=${encodeURIComponent(threadId)}`;
}
