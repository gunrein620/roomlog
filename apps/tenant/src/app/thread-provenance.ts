export type ThreadProvenanceTone = "neutral" | "info" | "warning" | "ready";

export type ThreadProvenanceItem = {
  label: string;
  value: string;
  tone: ThreadProvenanceTone;
};

export type ThreadProvenanceInput = {
  id: string;
  status: string;
  sourceChannel: string;
  complaintId?: string;
  ticketId?: string;
  messages: Array<{
    sender: "TENANT" | "AI_ASSISTANT" | "SYSTEM";
    attachmentUrls: string[];
  }>;
  threadSummary: {
    channelLabel: string;
    statusLabel: string;
    messageCount: number;
    attachmentCount: number;
  };
};

function uniqueAttachmentCount(input: ThreadProvenanceInput) {
  return new Set(input.messages.flatMap((message) => message.attachmentUrls)).size;
}

function messageCount(input: ThreadProvenanceInput, sender: "TENANT" | "AI_ASSISTANT") {
  return input.messages.filter((message) => message.sender === sender).length;
}

function ticketValue(input: ThreadProvenanceInput): ThreadProvenanceItem {
  if (input.ticketId) {
    return {
      label: "접수",
      value: `티켓 ${input.ticketId}`,
      tone: "ready"
    };
  }

  if (input.complaintId) {
    return {
      label: "접수",
      value: `민원 ${input.complaintId}`,
      tone: "ready"
    };
  }

  if (input.status === "ACTIVE") {
    return {
      label: "접수",
      value: "초안 저장 중",
      tone: "warning"
    };
  }

  return {
    label: "접수",
    value: "티켓 미연결",
    tone: "neutral"
  };
}

export function threadProvenance(input: ThreadProvenanceInput) {
  const tenantMessages = messageCount(input, "TENANT");
  const assistantMessages = messageCount(input, "AI_ASSISTANT");
  const attachments = Math.max(input.threadSummary.attachmentCount, uniqueAttachmentCount(input));

  return {
    title: "스레드 기록",
    status: `${input.threadSummary.channelLabel} · ${input.threadSummary.statusLabel}`,
    items: [
      {
        label: "스레드",
        value: input.id,
        tone: "neutral" as const
      },
      {
        label: "대화",
        value: `세입자 ${tenantMessages}건 · AI ${assistantMessages}건`,
        tone: "info" as const
      },
      {
        label: "사진",
        value: `${attachments}장`,
        tone: attachments > 0 ? ("info" as const) : ("neutral" as const)
      },
      ticketValue(input)
    ]
  };
}
