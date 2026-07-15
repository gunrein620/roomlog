// 세입자 AI 상담(민원 intake) API 클라이언트 — /api/tenant 프록시 경유(httpOnly 쿠키 인증).
// 백엔드는 apps/api roomlog 모듈의 intake 세션(텍스트 턴 + Realtime 음성)을 그대로 사용한다.

export type TenantIntakeMessage = {
  id: string;
  sender: "TENANT" | "AI_ASSISTANT";
  messageText: string;
  inputMode?: string;
  createdAt?: string;
};

export type TenantIntakeDraft = {
  title: string;
  summary: string;
  category?: string;
  detailCategory?: string;
  priority?: number;
  readyToFinalize: boolean;
  requiredInfo: string[];
  nextQuestions: string[];
};

export type TenantIntakeSession = {
  id: string;
  status: "ACTIVE" | "FINALIZED" | "DISCARDED";
  draft: TenantIntakeDraft;
  messages: TenantIntakeMessage[];
};

export type TenantRealtimeClientSecret = {
  mode: "openai" | "not_configured";
  sessionId: string;
  model: string;
  voice: string;
  warning?: string;
  clientSecret?: { value: string; expiresAt?: string };
};

export type TenantIntakeFinalizeResult = {
  complaint?: { id: string; title?: string };
  ticket?: { id: string };
};

export type TenantRealtimeTurnResult = {
  session: TenantIntakeSession;
  deduplicated?: boolean;
};

const intakeBasePath = "/api/tenant/complaints/intake/sessions";

export async function createTenantIntakeSession(
  roomId?: string,
): Promise<TenantIntakeSession> {
  const body = await requestJson(intakeBasePath, roomId ? { roomId } : {});
  const session = (body as { session?: TenantIntakeSession }).session;
  if (!session?.id) throw new Error("AI 상담 세션을 만들지 못했습니다.");
  return session;
}

export async function sendTenantIntakeMessage(
  sessionId: string,
  messageText: string,
): Promise<{ session: TenantIntakeSession; assistantMessage: TenantIntakeMessage }> {
  const body = await requestJson(
    `${intakeBasePath}/${encodeURIComponent(sessionId)}/messages`,
    { messageText, inputMode: "CHAT" },
  );
  const result = body as {
    session?: TenantIntakeSession;
    assistantMessage?: TenantIntakeMessage;
  };
  if (!result.session || !result.assistantMessage) {
    throw new Error("AI 응답을 해석하지 못했습니다.");
  }
  return { session: result.session, assistantMessage: result.assistantMessage };
}

export async function finalizeTenantIntakeSession(
  sessionId: string,
): Promise<TenantIntakeFinalizeResult> {
  const body = await requestJson(
    `${intakeBasePath}/${encodeURIComponent(sessionId)}/finalize`,
    {},
  );
  return body as TenantIntakeFinalizeResult;
}

export async function createTenantRealtimeClientSecret(
  sessionId: string,
): Promise<TenantRealtimeClientSecret> {
  const body = await requestJson(
    `${intakeBasePath}/${encodeURIComponent(sessionId)}/realtime/client-secret`,
    { purpose: "TENANT_INTAKE" },
  );
  return body as TenantRealtimeClientSecret;
}

export async function recordTenantRealtimeTurn(
  sessionId: string,
  input: { userTranscript?: string; assistantTranscript?: string; eventId?: string },
): Promise<TenantRealtimeTurnResult> {
  const body = await requestJson(
    `${intakeBasePath}/${encodeURIComponent(sessionId)}/realtime/turns`,
    input,
  );
  return body as TenantRealtimeTurnResult;
}

async function requestJson(path: string, payload: unknown): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("네트워크 오류로 AI 상담 서버에 연결하지 못했습니다.");
  }

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(responseMessage(body) || "AI 상담 요청을 처리하지 못했습니다.");
  }

  return body;
}

function responseMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("message" in body)) return undefined;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(", ");
  return typeof message === "string" ? message : undefined;
}
