type QuickReplyMessage = {
  id: string;
  sender: string;
};

export function activeQuickReplyMessageId(
  messages: QuickReplyMessage[],
  threadStatus: string
) {
  if (threadStatus !== "ACTIVE") {
    return undefined;
  }

  const latestMessage = messages.at(-1);

  return latestMessage?.sender === "AI_ASSISTANT" ? latestMessage.id : undefined;
}
