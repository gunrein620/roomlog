import type { Thread } from "@roomlog/types";

export function managerThreadConfirmationLabel(
  thread: Pick<Thread, "managerUnreadCount">,
): "미확인" | "확인" {
  return thread.managerUnreadCount > 0 ? "미확인" : "확인";
}

export function managerThreadNeedsReply(
  thread: Pick<Thread, "lastMessageSender" | "pendingRequest">,
): boolean {
  return thread.lastMessageSender === "tenant" || thread.pendingRequest;
}

export function sortManagerThreads(threads: readonly Thread[]): Thread[] {
  return [...threads].sort((left, right) => {
    const confirmationPriority =
      Number(right.managerUnreadCount > 0) - Number(left.managerUnreadCount > 0);
    if (confirmationPriority !== 0) return confirmationPriority;

    const replyPriority =
      Number(managerThreadNeedsReply(right)) - Number(managerThreadNeedsReply(left));
    if (replyPriority !== 0) return replyPriority;

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}
