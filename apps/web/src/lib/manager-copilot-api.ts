import type {
  AgentPendingActionView,
  ManagerCopilotChatRequest,
  ManagerCopilotChatResponse,
  ManagerCopilotPendingAction,
} from "@roomlog/types";

export async function requestManagerCopilotChat(
  payload: ManagerCopilotChatRequest,
): Promise<ManagerCopilotChatResponse> {
  let response: Response;

  try {
    response = await fetch("/api/manager/copilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("네트워크 오류");
  }

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(responseMessage(body) || "네트워크 오류");
  }

  if (!isManagerCopilotChatResponse(body)) {
    throw new Error(responseMessage(body) || "AI 응답을 해석하지 못했습니다.");
  }

  return body;
}

export async function requestManagerCurrentConfirmation(): Promise<
  ManagerCopilotPendingAction | null
> {
  const response = await fetch("/api/manager/agent-confirmations/current", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(responseMessage(body) || "보류 작업을 확인하지 못했습니다.");
  }

  const pendingAction =
    body && typeof body === "object" && "pendingAction" in body
      ? (body as { pendingAction?: unknown }).pendingAction
      : undefined;
  return managerPendingActionFromConfirmation(pendingAction);
}

export function managerPendingActionFromConfirmation(
  value: unknown,
): ManagerCopilotPendingAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Partial<AgentPendingActionView>;
  if (
    typeof action.confirmationId !== "string" ||
    (action.tool !== "billing.send_dunning" &&
      action.tool !== "messaging.send_reply" &&
      action.tool !== "messaging.send_announcement") ||
    !action.card ||
    typeof action.card.target !== "string"
  ) {
    return null;
  }

  return {
    id: action.confirmationId,
    kind: action.tool,
    summary: action.card.target,
  };
}

export function isManagerCopilotChatResponse(
  body: unknown,
): body is ManagerCopilotChatResponse {
  if (!body || typeof body !== "object") return false;
  const maybe = body as Partial<ManagerCopilotChatResponse>;
  return (
    (maybe.mode === "openai" || maybe.mode === "not_configured") &&
    typeof maybe.reply === "string"
  );
}

function responseMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("message" in body)) return undefined;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(", ");
  return typeof message === "string" ? message : undefined;
}
