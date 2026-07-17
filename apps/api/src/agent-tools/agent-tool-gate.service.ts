import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  AgentPendingActionView,
  AgentToolName,
  AgentToolInvokeInput,
  AgentToolInvokeResponse,
} from "@roomlog/types";
import {
  AGENT_ACTION_ID_FACTORY,
  AGENT_ROLE_TOOL_ADAPTER,
  AGENT_TOOL_ACTION_REPOSITORY,
  AgentToolActionUnavailableError,
  type AgentPrincipal,
  type AgentRoleToolAdapter,
  type AgentToolActionRecord,
  type AgentToolActionRepository,
} from "./agent-tool-action.repository";

const TEN_MINUTES = 10 * 60 * 1000;
const IDENTITY_ARGUMENTS = new Set([
  "userId",
  "tenantId",
  "landlordId",
  "managerId",
  "payerUserId",
  "principalUserId",
  "principalRole",
  "role",
]);

function normalizeArguments(value: unknown) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("도구 인자는 객체여야 합니다.");
  }
  const args = { ...(value as Record<string, unknown>) };
  for (const key of IDENTITY_ARGUMENTS) delete args[key];
  return args;
}

function normalizeToolCallId(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 160) {
    throw new BadRequestException("유효한 toolCallId가 필요합니다.");
  }
  return value.trim();
}

function safeFailure(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const detail =
      typeof response === "object" && response
        ? (response as { message?: unknown }).message
        : undefined;
    const message =
      typeof response === "string"
        ? response
        : Array.isArray(detail)
          ? detail.join(" ")
          : detail;
    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 300);
    }
  }
  return "요청을 실행하지 못했습니다. 상태를 다시 확인해 주세요.";
}

@Injectable()
export class AgentToolGateService {
  private readonly nextId: () => string;

  constructor(
    @Inject(AGENT_TOOL_ACTION_REPOSITORY)
    private readonly repository: AgentToolActionRepository,
    @Inject(AGENT_ROLE_TOOL_ADAPTER)
    private readonly adapter: AgentRoleToolAdapter,
    @Optional() @Inject(AGENT_ACTION_ID_FACTORY) nextId?: () => string,
  ) {
    this.nextId = nextId ?? randomUUID;
  }

  async invoke(
    principal: AgentPrincipal,
    input: AgentToolInvokeInput,
  ): Promise<AgentToolInvokeResponse> {
    const toolName = typeof input.tool === "string" ? input.tool.trim() : "";
    const policy = this.adapter.policy(principal, toolName);
    if (!policy) {
      return { status: "blocked", summary: "허용되지 않은 도구입니다." };
    }
    const tool = toolName as AgentToolName;
    if (policy === "CONFIRM_ONLY") {
      return {
        status: "blocked",
        summary: "이 도구는 확인 API에서만 실행할 수 있습니다.",
      };
    }
    const args = normalizeArguments(input.arguments);
    const toolCallId = normalizeToolCallId(input.toolCallId);
    return policy === "IMMEDIATE"
      ? this.invokeImmediate(principal, tool, args, toolCallId)
      : this.prepare(principal, tool, args, toolCallId);
  }

  async current(principal: AgentPrincipal) {
    const action = await this.repository.current(principal);
    return action?.status === "PENDING" ? this.pending(action) : null;
  }

  async confirm(
    principal: AgentPrincipal,
    confirmationId: string,
  ): Promise<AgentToolInvokeResponse> {
    try {
      const claim = await this.repository.claim(principal, confirmationId);
      if (!claim.claimed) return this.response(claim.action);
      const { action } = claim;
      if (!action.executorName || !action.commandPayload) {
        const summary = "실행 정보가 올바르지 않습니다.";
        await this.repository.fail(principal, action.id, summary);
        return { status: "failed", confirmationId: action.id, summary };
      }
      try {
        const result = await this.adapter.executePending(
          principal,
          action.executorName,
          action.commandPayload,
          { confirmationId: action.id, toolCallId: action.toolCallId },
        );
        return this.response(
          await this.repository.complete(principal, action.id, result),
        );
      } catch (error) {
        const summary = safeFailure(error);
        await this.repository.fail(principal, action.id, summary);
        return { status: "failed", confirmationId: action.id, summary };
      }
    } catch (error) {
      if (error instanceof AgentToolActionUnavailableError) {
        return { status: "blocked", summary: error.message };
      }
      throw error;
    }
  }

  async cancel(
    principal: AgentPrincipal,
    confirmationId: string,
  ): Promise<AgentToolInvokeResponse> {
    try {
      return this.response(
        await this.repository.cancel(principal, confirmationId),
      );
    } catch (error) {
      if (error instanceof AgentToolActionUnavailableError) {
        return { status: "blocked", summary: error.message };
      }
      throw error;
    }
  }

  private async invokeImmediate(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
    toolCallId: string,
  ): Promise<AgentToolInvokeResponse> {
    const id = this.nextId();
    const claimed = await this.repository.beginImmediate({
      id,
      principal,
      tool,
      toolCallId,
      arguments: args,
    });
    if (claimed !== "CLAIMED") return this.response(claimed);
    try {
      const result = await this.adapter.executeImmediate(principal, tool, args, {
        toolCallId,
      });
      return this.response(
        await this.repository.complete(principal, id, result),
      );
    } catch (error) {
      const summary = safeFailure(error);
      await this.repository.fail(principal, id, summary);
      return { status: "failed", summary };
    }
  }

  private async prepare(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
    toolCallId: string,
  ): Promise<AgentToolInvokeResponse> {
    const current = await this.repository.current(principal);
    if (current) return this.response(current);
    const prepared = await this.adapter.prepareMutation(principal, tool, args);
    return this.response(
      await this.repository.createPending({
        id: this.nextId(),
        principal,
        tool,
        toolCallId,
        arguments: args,
        ...prepared,
        expiresAt: new Date(Date.now() + TEN_MINUTES),
      }),
    );
  }

  private pending(action: AgentToolActionRecord): AgentPendingActionView {
    if (!action.card || !action.expiresAt) {
      throw new Error("Pending action is missing confirmation data.");
    }
    return {
      confirmationId: action.id,
      tool: action.tool,
      expiresAt: action.expiresAt.toISOString(),
      card: action.card,
    };
  }

  private response(action: AgentToolActionRecord): AgentToolInvokeResponse {
    switch (action.status) {
      case "PENDING":
        return { status: "pending_confirmation", pendingAction: this.pending(action) };
      case "EXECUTING":
        return {
          status: "executing",
          confirmationId: action.id,
          summary: "요청을 실행하고 있습니다.",
        };
      case "EXECUTED":
        return { status: "executed", tool: action.tool, data: action.result ?? {} };
      case "CANCELLED":
        return {
          status: "cancelled",
          confirmationId: action.id,
          summary: "보류 작업을 취소했습니다.",
        };
      case "EXPIRED":
        return {
          status: "failed",
          confirmationId: action.id,
          summary: "확인 시간이 만료되었습니다. 다시 요청해 주세요.",
        };
      case "FAILED":
        return {
          status: "failed",
          confirmationId: action.id,
          summary: action.failureSummary ?? "요청을 실행하지 못했습니다.",
        };
    }
  }
}
