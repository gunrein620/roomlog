import type {
  ManagerCopilotChatRequest,
  ManagerCopilotChatResponse,
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
