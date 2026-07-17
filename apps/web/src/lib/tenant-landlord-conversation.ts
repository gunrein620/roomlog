import type { CreateTenantMessagingThreadInput } from "@roomlog/types";

export const tenantLandlordConversationPaths = {
  current: (roomId?: string) =>
    `/api/tenant/messaging/landlord-conversation${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ""}`,
  threads: () => "/api/tenant/messaging/threads",
  thread: (threadId: string) =>
    `/api/tenant/messaging/threads/${encodeURIComponent(threadId)}`,
  read: (threadId: string) =>
    `/api/tenant/messaging/threads/${encodeURIComponent(threadId)}/read`,
} as const;

export function formatTenantLandlordUnreadCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
}

export function isTenantLandlordMessagingActivity(payload: unknown): boolean {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    "kind" in payload &&
    payload.kind === "messaging"
  );
}

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
