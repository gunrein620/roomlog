import { cookies } from "next/headers";
import { AUTH_COOKIE } from "./auth-cookie";
import { apiUrl } from "./api-url";

// 서버 컴포넌트/서버 액션/라우트 핸들러 전용 Nest API 클라이언트.
// httpOnly 쿠키에서 토큰을 꺼내 Authorization: Bearer 로 forward (팀 백엔드 헤더 인증 그대로).
// 팀 page.tsx의 인라인 apiRequest 로직을 salvage — 토큰 출처만 인자→쿠키로 바뀜.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiPayloadErrorReason = "EMPTY_BODY" | "INVALID_JSON" | "BODY_READ_FAILED";
export type ApiResponseContext = { path: string; method: string };

export class ApiPayloadError extends Error {
  readonly name = "ApiPayloadError";
  readonly outcomeUnknown: boolean;

  constructor(
    readonly reason: ApiPayloadErrorReason,
    readonly path: string,
    readonly method: string,
    readonly upstreamStatus: number,
  ) {
    super(method === "GET"
      ? "API 응답을 완전히 받지 못했습니다. 다시 시도해 주세요."
      : "요청 처리 결과를 확인할 수 없습니다. 상태를 다시 조회해 주세요.");
    this.outcomeUnknown = method !== "GET";
  }
}

function payloadError(
  reason: ApiPayloadErrorReason,
  response: Response,
  context: ApiResponseContext,
) {
  return new ApiPayloadError(reason, context.path, context.method, response.status);
}

export async function parseApiJsonResponse<T>(
  response: Response,
  context: ApiResponseContext,
): Promise<T> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw payloadError("BODY_READ_FAILED", response, context);
  }
  if (!text.trim()) throw payloadError("EMPTY_BODY", response, context);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw payloadError("INVALID_JSON", response, context);
  }
}

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => "");
  let body: { message?: string | string[] } | undefined;
  try {
    body = text.trim()
      ? (JSON.parse(text) as { message?: string | string[] })
      : undefined;
  } catch {
    body = undefined;
  }
  const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
  return new ApiError(response.status, message || `Request failed with ${response.status}`);
}

export async function fetchJsonWithPayloadRetry<T>(
  fetcher: () => Promise<Response>,
  context: ApiResponseContext,
): Promise<T> {
  const attempts = context.method === "GET" ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher();
    if (!response.ok) throw await apiErrorFromResponse(response);
    try {
      return await parseApiJsonResponse<T>(response, context);
    } catch (error) {
      if (!(error instanceof ApiPayloadError) || attempt + 1 >= attempts) throw error;
    }
  }
  throw new ApiPayloadError("BODY_READ_FAILED", context.path, context.method, 0);
}

export async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const method = (init.method ?? "GET").toUpperCase();
  const url = apiUrl(path);

  return fetchJsonWithPayloadRetry<T>(
    () =>
      fetch(url, {
        cache: "no-store",
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init.headers,
          // 쿠키 토큰의 Authorization은 호출자 헤더로 덮어쓸 수 없게 마지막에 둔다
          // (BFF 불변식: 업스트림 인증은 오직 httpOnly 쿠키 토큰으로만).
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    { path, method },
  );
}
