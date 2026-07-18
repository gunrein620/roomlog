const LOCAL_MUTATION_TTL_MS = 5_000;
const localMutationCleanup = new Map<string, ReturnType<typeof setTimeout> | undefined>();

export function beginLocalTicketLaneMutation(clientRequestId: string) {
  abandonLocalTicketLaneMutation(clientRequestId);
  localMutationCleanup.set(clientRequestId, undefined);
}

export function completeLocalTicketLaneMutation(clientRequestId: string) {
  if (!localMutationCleanup.has(clientRequestId)) return;
  const timer = setTimeout(
    () => localMutationCleanup.delete(clientRequestId),
    LOCAL_MUTATION_TTL_MS,
  );
  localMutationCleanup.set(clientRequestId, timer);
}

export function abandonLocalTicketLaneMutation(clientRequestId: string) {
  const timer = localMutationCleanup.get(clientRequestId);
  if (timer) clearTimeout(timer);
  localMutationCleanup.delete(clientRequestId);
}

export function isLocalTicketLaneMutationActivity(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const activity = payload as {
    kind?: unknown;
    action?: unknown;
    clientRequestId?: unknown;
  };
  return (
    activity.kind === "ticket" &&
    activity.action === "lane_changed" &&
    typeof activity.clientRequestId === "string" &&
    localMutationCleanup.has(activity.clientRequestId)
  );
}
