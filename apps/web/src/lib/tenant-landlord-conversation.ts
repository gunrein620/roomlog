import type { CreateTenantMessagingThreadInput } from "@roomlog/types";

export const tenantLandlordConversationPaths = {
  current: () => "/api/tenant/messaging/landlord-conversation",
  threads: () => "/api/tenant/messaging/threads"
} as const;

export function tenantLandlordThreadInput(body = ""): CreateTenantMessagingThreadInput {
  return {
    context: "general",
    contextLabel: "일반 문의",
    body: body.trim()
  };
}

export function tenantLandlordThreadHref(threadId: string): string {
  return `/tenant/messaging/01?id=${encodeURIComponent(threadId)}`;
}
