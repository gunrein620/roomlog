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

export async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new ApiError(response.status, message || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
