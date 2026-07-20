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
// 공지(messaging.send_announcement)는 보류 카드 없이 즉시 실행한다 — 페르소나 지침이
// 호출 전 대화에서 명시 승인을 받도록 강제하고, 카드까지 겹치면 이중 확인이 된다.
const sendCommands: Record<string, CopilotPendingAction["kind"] | undefined> = {
  "billing.send_dunning": "billing.send_dunning",
  "messaging.send_reply": "messaging.send_reply"
};

// 짧은 명시 승인 발화 판별 — 내용이 함께 담긴 첫 요청("...5만원 인상 공지 보내줘")은
// 길이 제한에 걸려 승인으로 치지 않고, "진행해"/"응 보내" 같은 답변만 승인으로 본다.
export function isExplicitApproval(message?: string): boolean {
  const normalized = (message ?? "").trim();

  if (!normalized || normalized.length > 25) return false;
  if (/(지\s*마|말아|말고|취소|안\s*돼|안돼|않|중단|보류)/.test(normalized)) return false;

  return /(진행|발송|보내|승인|전송|괜찮|응|어|네|넵|예|그래|좋아|ㅇㅋ|ㅇㅇ|ㄱ+|고고|ok|okay|yes)/i.test(
    normalized
  );
}

export function isExplicitDunningSendRequest(message?: string): boolean {
  const normalized = (message ?? "").trim();

  if (!normalized) return false;
  if (/(취소|보류|말고|문구만|초안|작성|현황|조회|알려)/u.test(normalized)) return false;

  return (
    /(독촉|미납|연체|월세|납부)/u.test(normalized) &&
    /(보내|발송|전송|문자)/u.test(normalized)
  );
}

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

    const lastUserMessage = [...(input.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user")?.content;

    if (isExplicitDunningSendRequest(lastUserMessage)) {
      const prepared = await this.createPendingAction(managerId, "billing.send_dunning", {
        command: "billing.send_dunning",
        text: lastUserMessage
      });
      const summary = this.resultSummary(prepared.content);

      return {
        mode: "openai",
        reply: prepared.pendingAction
          ? `${prepared.pendingAction.summary} 내용을 확인했습니다. 발송하려면 '승인' 또는 '진행해'를 입력해 주세요.`
          : summary || "독촉을 준비하지 못했습니다. 대상 청구를 다시 확인해 주세요.",
        pendingAction: prepared.pendingAction
      };
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
        ? `${prepared.pendingAction.summary} 내용을 확인했습니다. 발송하려면 '승인' 또는 '진행해'를 입력해 주세요.`
        : summary || "독촉을 준비하지 못했습니다. 대상 청구를 다시 확인해 주세요.",
      pendingAction: prepared.pendingAction
    };
  }

  private async runChatLoop(
    managerId: string,
    input: CopilotChatRequest
  ): Promise<CopilotChatResponse> {
    const messages = this.initialMessages(input);
    const lastUserMessage = [...(input.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user")?.content;
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
        const toolResult = await this.runToolCall(managerId, toolCall, lastUserMessage);

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
    toolCall: OpenAiToolCall,
    lastUserMessage?: string
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

    // 공지는 모델 지침만으로는 확인 단계가 비결정적이라 서버가 1회 확인을 강제한다:
    // 마지막 사용자 발화가 짧은 명시 승인("진행해", "응 보내")일 때만 실행하고,
    // 아니면 요약을 보여주고 승인을 받아오라는 결과를 돌려준다.
    if (
      commandInput.command === "messaging.send_announcement" &&
      !isExplicitApproval(lastUserMessage)
    ) {
      return {
        content: {
          status: "needs_confirmation",
          summary:
            "공지 발송 전 관리인 승인이 필요합니다. 대상·제목·본문을 요약해 보여주고 발송해도 되는지 물어보세요. 관리인이 승인하면 같은 내용으로 다시 호출하세요."
        }
      };
    }

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
          channel: this.optionalStringValue(parsed.channel),
          threadId: this.optionalStringValue(parsed.threadId),
          body: this.optionalStringValue(parsed.body),
          title: this.optionalStringValue(parsed.title),
          target: this.optionalStringValue(parsed.target)
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
