export type TradeChatDisplayMode = "login" | "loading" | "empty" | "open" | "list";

export function tradeChatDisplayMode({
  needsLogin,
  threadsLoaded,
  threadCount,
  hasOpenThreadId,
  hasOpenThread
}: {
  needsLogin: boolean;
  threadsLoaded: boolean;
  threadCount: number;
  hasOpenThreadId: boolean;
  hasOpenThread: boolean;
}): TradeChatDisplayMode {
  if (needsLogin) return "login";
  if (hasOpenThreadId) return hasOpenThread ? "open" : "loading";
  if (!threadsLoaded) return "loading";
  if (threadCount === 0) return "empty";
  return "list";
}
