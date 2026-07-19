import { BadGatewayException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { id } from "../roomlog-support";
import type {
  CopilotChatRequest,
  CopilotChatResponse,
  ManagerAgentCommandInput,
  ManagerAgentCommandResult,
  ManagerAssistantIntent,
  ManagerDunningActionPreview
} from "../roomlog.types";
import {
  buildManagerAgentInstructions,
  toChatCompletionTools
} from "./manager-agent-persona";

type CopilotPendingAction = NonNullable<CopilotChatResponse["pendingAction"]>;
type CopilotReceipt = NonNullable<CopilotChatResponse["receipts"]>[number];
type CopilotPendingActionRecord = CopilotPendingAction & {
  managerId: string;
  commandInput: ManagerAgentCommandInput;
  expiresAtMs: number;
};
type CopilotPendingCommandResolution =
  | {
      status: "ready";
      commandInput: ManagerAgentCommandInput;
      summary: string;
      dunningPreview?: ManagerDunningActionPreview;
    }
  | {
      status: "blocked";
      domain?: ManagerAgentCommandResult["domain"];
      summary: string;
      requiresConfirmation?: boolean;
    };
type MaybePromise<T> = T | Promise<T>;

type OpenAiToolCall = {
  id: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
};

// 데모 수준의 프로세스 메모리 저장소라 서버 재시작 시 보류 액션은 유실된다.
const pendingCopilotActions = new Map<string, CopilotPendingActionRecord>();
const pendingActionTtlMs = 10 * 60 * 1000;
const sendCommands: Record<string, CopilotPendingAction["kind"] | undefined> = {
  "billing.send_dunning": "billing.send_dunning",
  "messaging.send_reply": "messaging.send_reply"
};

export class RoomlogCopilotDomain {
  constructor(
    private readonly runManagerAgentCommand: (
      managerId: string,
      input: ManagerAgentCommandInput
    ) => MaybePromise<ManagerAgentCommandResult>,
    private readonly resolvePendingCommand: (
      managerId: string,
      kind: CopilotPendingAction["kind"],
      input: ManagerAgentCommandInput
    ) => MaybePromise<CopilotPendingCommandResolution>,
    private readonly safetyIdentifier: (managerId: string, sessionId: string) => string
  ) {}

  async chat(
    managerId: string,
    input: CopilotChatRequest = { messages: [] }
  ): Promise<CopilotChatResponse> {
    const confirmActionId = input.confirmActionId?.trim();
    const cancelActionId = input.cancelActionId?.trim();

    if (confirmActionId) {
      return await this.confirmPendingAction(managerId, confirmActionId);
    }

    if (cancelActionId) {
      return this.cancelPendingAction(managerId, cancelActionId);
    }

    if (input.intent) {
      return await this.prepareIntent(managerId, input.intent);
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        mode: "not_configured",
        reply:
          "OPENAI_API_KEY가 설정되지 않아 실제 관리인 코파일럿 채팅은 비활성화되었습니다. 서버 환경변수에 OPENAI_API_KEY를 설정하면 관리인 업무 조회와 확인형 발송을 처리합니다."
      };
    }

    return await this.runChatLoop(managerId, input);
  }

  private async prepareIntent(
    managerId: string,
    intent: ManagerAssistantIntent
  ): Promise<CopilotChatResponse> {
    const prepared = await this.createPendingAction(managerId, "billing.send_dunning", {
      command: "billing.send_dunning",
      billId: intent.billId,
      text: intent.prompt,
      channel: intent.channel,
      body: intent.messageText
    });
    const summary = this.resultSummary(prepared.content);

    return {
      mode: "openai",
      reply: prepared.pendingAction
        ? `${prepared.pendingAction.summary} 내용을 확인한 뒤 발송해 주세요.`
        : summary || "독촉을 준비하지 못했습니다. 대상 청구를 다시 확인해 주세요.",
      pendingAction: prepared.pendingAction
    };
  }

  private async runChatLoop(
    managerId: string,
    input: CopilotChatRequest
  ): Promise<CopilotChatResponse> {
    const messages = this.initialMessages(input);
    let pendingAction: CopilotPendingAction | undefined;

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const completion = await this.createChatCompletion(managerId, messages);
      const message = completion.choices?.[0]?.message;
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

      if (!toolCalls.length) {
        return {
          mode: "openai",
          reply: this.cleanReply(message?.content) || this.fallbackReply(pendingAction),
          pendingAction
        };
      }

      messages.push({
        role: "assistant",
        content: typeof message?.content === "string" ? message.content : null,
        tool_calls: toolCalls
      });

      for (const toolCall of toolCalls) {
        const toolResult = await this.runToolCall(managerId, toolCall);

        if (toolResult.pendingAction) {
          pendingAction = toolResult.pendingAction;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult.content)
        });
      }
    }

    return {
      mode: "openai",
      reply: this.fallbackReply(pendingAction),
      pendingAction
    };
  }

  private initialMessages(input: CopilotChatRequest): OpenAiChatMessage[] {
    const requestMessages = Array.isArray(input.messages) ? input.messages : [];
    const recentMessages = requestMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-12)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    return [
      {
        role: "system",
        content: buildManagerAgentInstructions({ surface: "chat" })
      },
      ...recentMessages
    ];
  }

  private async createChatCompletion(
    managerId: string,
    messages: OpenAiChatMessage[]
  ): Promise<OpenAiChatCompletionResponse> {
    const model = process.env.OPENAI_COPILOT_MODEL || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": this.safetyIdentifier(managerId, `manager-copilot:${managerId}`)
      },
      body: JSON.stringify({
        model,
        messages,
        tools: toChatCompletionTools(),
        tool_choice: "auto"
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new BadGatewayException(
        `OpenAI Copilot 채팅 호출 실패 (${response.status})${errorText ? `: ${errorText}` : ""}`
      );
    }

    return (await response.json()) as OpenAiChatCompletionResponse;
  }

  private async runToolCall(
    managerId: string,
    toolCall: OpenAiToolCall
  ): Promise<{
    content: unknown;
    pendingAction?: CopilotPendingAction;
  }> {
    if (toolCall.function?.name !== "run_manager_agent_command") {
      return {
        content: {
          status: "blocked",
          summary: "지원하지 않는 도구 호출입니다."
        }
      };
    }

    const parsedCommand = this.parseCommandArguments(toolCall.function.arguments);

    if (!parsedCommand.ok) {
      return {
        content: {
          status: "blocked",
          domain: "system",
          summary: parsedCommand.summary
        }
      };
    }

    const commandInput = parsedCommand.input;
    const pendingKind = sendCommands[commandInput.command];

    if (pendingKind) {
      return await this.createPendingAction(managerId, pendingKind, commandInput);
    }

    const result = await this.runManagerAgentCommand(managerId, commandInput);

    return { content: result };
  }

  private parseCommandArguments(
    argumentsText?: string
  ): { ok: true; input: ManagerAgentCommandInput } | { ok: false; summary: string } {
    try {
      const parsed = JSON.parse(argumentsText || "{}") as Record<string, unknown>;

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          ok: false,
          summary: "도구 인자를 해석할 수 없습니다."
        };
      }

      return {
        ok: true,
        input: {
          command: this.stringValue(parsed.command),
          text: this.optionalStringValue(parsed.text),
          billId: this.optionalStringValue(parsed.billId),
          channel: this.optionalStringValue(parsed.channel),
          threadId: this.optionalStringValue(parsed.threadId),
          body: this.optionalStringValue(parsed.body)
        }
      };
    } catch {
      return {
        ok: false,
        summary: "도구 인자를 해석할 수 없습니다."
      };
    }
  }

  private async createPendingAction(
    managerId: string,
    kind: CopilotPendingAction["kind"],
    commandInput: ManagerAgentCommandInput
  ): Promise<{
    content: unknown;
    pendingAction?: CopilotPendingAction;
  }> {
    this.cleanupExpiredActions();
    const resolution = await this.resolvePendingCommand(managerId, kind, commandInput);

    if (resolution.status === "blocked") {
      return {
        content: {
          status: "blocked",
          domain: resolution.domain ?? this.pendingActionDomain(kind),
          summary: resolution.summary,
          requiresConfirmation: resolution.requiresConfirmation ?? true
        }
      };
    }

    this.deleteManagerPendingActions(managerId);

    const action: CopilotPendingActionRecord = {
      id: id("copilot_action"),
      kind,
      summary: resolution.summary,
      dunningPreview: resolution.dunningPreview,
      managerId,
      commandInput: { ...resolution.commandInput },
      expiresAtMs: Date.now() + pendingActionTtlMs
    };

    pendingCopilotActions.set(action.id, action);

    const pendingAction = this.publicPendingAction(action);

    return {
      pendingAction,
      content: {
        status: "pending_confirmation",
        summary: pendingAction.summary,
        pendingActionId: pendingAction.id
      }
    };
  }

  private publicPendingAction(action: CopilotPendingActionRecord): CopilotPendingAction {
    return {
      id: action.id,
      kind: action.kind,
      summary: action.summary,
      dunningPreview: action.dunningPreview
    };
  }

  private async confirmPendingAction(
    managerId: string,
    actionId: string
  ): Promise<CopilotChatResponse> {
    const action = this.consumePendingAction(managerId, actionId);
    const result = await this.runManagerAgentCommand(managerId, action.commandInput);

    if (result.status !== "executed") {
      const pendingAction = this.restorePendingAction(action);

      return {
        mode: "openai",
        reply: result.summary,
        pendingAction
      };
    }

    const receipts: CopilotReceipt[] =
      [
        {
          kind: action.kind,
          summary: action.summary
        }
      ];

    return {
      mode: "openai",
      reply: `확인했습니다. ${action.summary}`,
      receipts
    };
  }

  private consumePendingAction(managerId: string, actionId: string) {
    const action = pendingCopilotActions.get(actionId);

    if (!action) {
      this.cleanupExpiredActions();
      throw new ForbiddenException("확인할 수 있는 보류 액션이 아닙니다.");
    }

    if (action.expiresAtMs <= Date.now()) {
      pendingCopilotActions.delete(actionId);
      throw new BadRequestException("확인 시간이 지났습니다. 다시 요청해주세요.");
    }

    if (action.managerId !== managerId) {
      throw new ForbiddenException("확인할 수 있는 보류 액션이 아닙니다.");
    }

    pendingCopilotActions.delete(actionId);

    return action;
  }

  private cancelPendingAction(managerId: string, actionId: string): CopilotChatResponse {
    const action = this.consumePendingAction(managerId, actionId);

    return {
      mode: "openai",
      reply:
        action.kind === "billing.send_dunning"
          ? "독촉 발송을 취소했습니다."
          : "메시지 발송을 취소했습니다."
    };
  }

  private restorePendingAction(action: CopilotPendingActionRecord) {
    const restored = {
      ...action,
      expiresAtMs: Date.now() + pendingActionTtlMs
    };

    pendingCopilotActions.set(restored.id, restored);

    return this.publicPendingAction(restored);
  }

  private cleanupExpiredActions() {
    const currentTimeMs = Date.now();

    for (const [actionId, action] of pendingCopilotActions) {
      if (action.expiresAtMs <= currentTimeMs) {
        pendingCopilotActions.delete(actionId);
      }
    }
  }

  private deleteManagerPendingActions(managerId: string) {
    for (const [actionId, action] of pendingCopilotActions) {
      if (action.managerId === managerId) {
        pendingCopilotActions.delete(actionId);
      }
    }
  }

  private pendingActionDomain(kind: CopilotPendingAction["kind"]): ManagerAgentCommandResult["domain"] {
    return kind === "billing.send_dunning" ? "billing" : "messaging";
  }

  private fallbackReply(pendingAction?: CopilotPendingAction) {
    if (pendingAction) {
      return `${pendingAction.summary}을 진행할까요?`;
    }

    return "요청을 처리했지만 답변 문장을 만들지 못했습니다. 다시 한 번 요청해주세요.";
  }

  // 채팅 말풍선은 마크다운을 렌더링하지 않으므로, 모델이 실수로 쓴 문법 잔재를 걷어낸다.
  private cleanReply(content?: string | null) {
    if (typeof content !== "string") return "";

    return content
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .trim()
      .slice(0, 1200);
  }

  private stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
  }

  private optionalStringValue(value: unknown) {
    return typeof value === "string" ? value : undefined;
  }

  private resultSummary(content: unknown) {
    if (!content || typeof content !== "object" || !("summary" in content)) return "";
    const summary = (content as { summary?: unknown }).summary;
    return typeof summary === "string" ? summary : "";
  }
}
