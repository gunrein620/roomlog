import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type {
  AgentToolInvokeResponse,
  ManagerAgentCommandInput,
  ManagerCopilotChatResponse,
  ManagerCopilotPendingAction,
} from "@roomlog/types";
import { RoomlogService } from "../roomlog/roomlog.service";
import type { ManagerCopilotActionGateway } from "../roomlog/services/roomlog-copilot.domain";
import { AgentToolGateService } from "./agent-tool-gate.service";
import { AgentResourceRefCodec } from "./agent-resource-ref";
import type { AgentPrincipal } from "./agent-tool-action.repository";

type PendingKind = ManagerCopilotPendingAction["kind"];

@Injectable()
export class ManagerCopilotActionGatewayService
  implements ManagerCopilotActionGateway, OnModuleInit
{
  constructor(
    private readonly roomlog: RoomlogService,
    private readonly gate: AgentToolGateService,
    private readonly refs: AgentResourceRefCodec,
  ) {}

  onModuleInit() {
    this.roomlog.configureManagerCopilotActionGateway(this);
  }

  async prepare(
    managerId: string,
    kind: PendingKind,
    commandInput: ManagerAgentCommandInput,
  ): Promise<{
    content: unknown;
    pendingAction?: ManagerCopilotPendingAction;
  }> {
    const resolution = this.roomlog.resolveManagerAgentPendingCommand(
      managerId,
      kind,
      commandInput,
    );

    if (resolution.status !== "ready") {
      return {
        content: {
          status: "blocked",
          domain: resolution.domain ?? this.domain(kind),
          summary: resolution.summary,
          requiresConfirmation: resolution.requiresConfirmation ?? true,
        },
      };
    }

    const principal = this.principal(managerId);
    const resolvedInput = resolution.commandInput;
    const args: Record<string, unknown> = {};
    for (const key of ["text", "channel", "body", "title", "target"] as const) {
      const value = resolvedInput[key]?.trim();
      if (value) args[key] = value;
    }
    if (kind === "billing.send_dunning" && resolvedInput.billId) {
      args.billRef = this.refs.issue(principal, "bill", resolvedInput.billId);
    }
    if (kind === "messaging.send_reply" && resolvedInput.threadId) {
      args.threadRef = this.refs.issue(principal, "thread", resolvedInput.threadId);
    }

    const response = await this.gate.invoke(principal, {
      tool: kind,
      arguments: args,
      toolCallId: `manager-copilot:${kind}:${randomUUID()}`,
    });

    if (response.status !== "pending_confirmation") {
      return { content: response };
    }
    if (response.pendingAction.tool !== kind) {
      return {
        content: {
          status: "blocked",
          summary:
            "다른 확인 대기 작업이 있습니다. 기존 작업을 완료하거나 취소한 뒤 다시 요청해 주세요.",
        },
      };
    }

    const pendingAction: ManagerCopilotPendingAction = {
      id: response.pendingAction.confirmationId,
      kind,
      summary: resolution.summary,
      ...("dunningPreview" in resolution && resolution.dunningPreview
        ? { dunningPreview: resolution.dunningPreview }
        : {}),
    };

    return {
      pendingAction,
      content: {
        status: "pending_confirmation",
        summary: pendingAction.summary,
        pendingActionId: pendingAction.id,
      },
    };
  }

  async confirm(
    managerId: string,
    actionId: string,
  ): Promise<ManagerCopilotChatResponse> {
    const response = await this.gate.confirm(this.principal(managerId), actionId);
    return this.confirmResponse(response);
  }

  async cancel(
    managerId: string,
    actionId: string,
  ): Promise<ManagerCopilotChatResponse> {
    const response = await this.gate.cancel(this.principal(managerId), actionId);
    return {
      mode: "openai",
      reply:
        response.status === "cancelled"
          ? "발송을 취소했습니다."
          : this.summary(response, "보류 작업을 취소하지 못했습니다."),
    };
  }

  private confirmResponse(
    response: AgentToolInvokeResponse,
  ): ManagerCopilotChatResponse {
    if (response.status === "executed") {
      const summary =
        typeof response.data.summary === "string"
          ? response.data.summary
          : "발송을 완료했습니다.";
      return {
        mode: "openai",
        reply: `확인했습니다. ${summary}`,
        receipts: [{ kind: response.tool, summary }],
      };
    }

    return {
      mode: "openai",
      reply: this.summary(response, "발송을 완료하지 못했습니다. 다시 요청해 주세요."),
    };
  }

  private summary(response: AgentToolInvokeResponse, fallback: string) {
    return "summary" in response && typeof response.summary === "string"
      ? response.summary
      : fallback;
  }

  private principal(managerId: string): AgentPrincipal {
    return { userId: managerId, role: "LANDLORD" };
  }

  private domain(kind: PendingKind) {
    return kind === "billing.send_dunning" ? "billing" : "messaging";
  }
}
