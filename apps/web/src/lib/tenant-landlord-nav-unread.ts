export type TenantLandlordUnreadThread = {
  context: string;
  contextRef?: string;
  unreadCount: number;
};

export function sumTenantLandlordUnreadCount(
  threads: readonly TenantLandlordUnreadThread[],
): number {
  return threads.reduce((total, thread) => {
    if (thread.context !== "general" || thread.contextRef) return total;
    if (!Number.isFinite(thread.unreadCount) || thread.unreadCount <= 0) return total;
    return total + Math.floor(thread.unreadCount);
  }, 0);
}

export function tenantLandlordNavLabel(count: number): string {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return normalizedCount > 0
    ? `세입자, 미확인 메시지 ${normalizedCount}개`
    : "세입자";
}
