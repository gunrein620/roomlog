import type { DunningGuard } from "./payment";

export type ManagerAgentCommandName =
  | "ticket.query"
  | "billing.summary"
  | "billing.send_dunning"
  | "messaging.list_threads"
  | "messaging.draft_reply"
  | "messaging.send_reply";

export interface ManagerAgentCommandInput {
  command: string;
  text?: string;
  billId?: string;
  channel?: string;
  threadId?: string;
  body?: string;
}

export interface ManagerAgentCommandResult {
  status: "executed" | "draft_only" | "blocked";
  domain: "ticket" | "billing" | "messaging" | "system";
  summary: string;
  data?: unknown;
  navigation?: {
    label: string;
    href: string;
  };
  requiresConfirmation?: boolean;
}

/**
 * AI 비서 표시 방식과 독립적인 업무 의도.
 * 현재 전체 화면과 이후 플로팅 패널이 같은 의도를 소비한다.
 */
export interface ManagerDunningAssistantIntent {
  type: "billing.send_dunning";
  source: "overdue" | "assistant";
  billId?: string;
  prompt?: string;
  channel?: string;
  messageText?: string;
}

export type ManagerAssistantIntent = ManagerDunningAssistantIntent;

export interface ManagerDunningActionPreview {
  billId: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  unpaidAmount: number;
  dueDate: string;
  daysOverdue: number;
  channel: string;
  messageText: string;
  guard: DunningGuard;
}

export interface ManagerCopilotPendingAction {
  id: string;
  kind: "billing.send_dunning" | "messaging.send_reply";
  summary: string;
  dunningPreview?: ManagerDunningActionPreview;
}

export interface ManagerCopilotChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ManagerCopilotChatRequest {
  messages: ManagerCopilotChatMessage[];
  intent?: ManagerAssistantIntent;
  confirmActionId?: string;
  cancelActionId?: string;
}

export interface ManagerCopilotChatResponse {
  mode: "openai" | "not_configured";
  reply: string;
  pendingAction?: ManagerCopilotPendingAction;
  receipts?: Array<{ kind: string; summary: string }>;
}
