import type {
  AgentConfirmationCard,
  AgentToolName,
} from "@roomlog/types";

export const AGENT_TOOL_ACTION_REPOSITORY = Symbol(
  "AGENT_TOOL_ACTION_REPOSITORY",
);
export const AGENT_ROLE_TOOL_ADAPTER = Symbol("AGENT_ROLE_TOOL_ADAPTER");
export const AGENT_ACTION_ID_FACTORY = Symbol("AGENT_ACTION_ID_FACTORY");

export type AgentPrincipal = Readonly<{
  userId: string;
  role: "TENANT" | "LANDLORD";
}>;

export type AgentToolActionStatus =
  | "PENDING"
  | "EXECUTING"
  | "EXECUTED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type AgentToolActionRecord = Readonly<{
  id: string;
  principal: AgentPrincipal;
  tool: AgentToolName;
  toolCallId: string;
  arguments: Record<string, unknown>;
  executorName?: string;
  commandPayload?: Record<string, unknown>;
  card?: AgentConfirmationCard;
  result?: Record<string, unknown>;
  failureSummary?: string;
  status: AgentToolActionStatus;
  expiresAt?: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type BeginAgentImmediateInput = Readonly<{
  id: string;
  principal: AgentPrincipal;
  tool: AgentToolName;
  toolCallId: string;
  arguments: Record<string, unknown>;
}>;

export type CreateAgentPendingInput = BeginAgentImmediateInput &
  Readonly<{
    executorName: string;
    commandPayload: Record<string, unknown>;
    card: AgentConfirmationCard;
    expiresAt: Date;
  }>;

export type AgentToolActionClaim = Readonly<{
  claimed: boolean;
  action: AgentToolActionRecord;
}>;

export type AgentPreparedMutation = Readonly<{
  executorName: string;
  commandPayload: Record<string, unknown>;
  card: AgentConfirmationCard;
}>;

export interface AgentRoleToolAdapter {
  policy(
    principal: AgentPrincipal,
    tool: string,
  ): "IMMEDIATE" | "PREPARE" | "CONFIRM_ONLY" | undefined;
  executeImmediate(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
    context: { toolCallId: string },
  ): Promise<Record<string, unknown>>;
  prepareMutation(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
  ): Promise<AgentPreparedMutation>;
  executePending(
    principal: AgentPrincipal,
    executorName: string,
    payload: Record<string, unknown>,
    context: { confirmationId: string; toolCallId: string },
  ): Promise<Record<string, unknown>>;
}

export interface AgentToolActionRepository {
  beginImmediate(
    input: BeginAgentImmediateInput,
  ): Promise<"CLAIMED" | AgentToolActionRecord>;
  createPending(input: CreateAgentPendingInput): Promise<AgentToolActionRecord>;
  current(principal: AgentPrincipal): Promise<AgentToolActionRecord | null>;
  claim(
    principal: AgentPrincipal,
    confirmationId: string,
  ): Promise<AgentToolActionClaim>;
  complete(
    principal: AgentPrincipal,
    actionId: string,
    result: Record<string, unknown>,
  ): Promise<AgentToolActionRecord>;
  fail(
    principal: AgentPrincipal,
    actionId: string,
    summary: string,
  ): Promise<AgentToolActionRecord>;
  cancel(
    principal: AgentPrincipal,
    confirmationId: string,
  ): Promise<AgentToolActionRecord>;
}

export class AgentToolActionUnavailableError extends Error {
  constructor() {
    super("확인할 수 있는 보류 작업이 없습니다.");
    this.name = "AgentToolActionUnavailableError";
  }
}
