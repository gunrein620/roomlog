import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCookieOptions } from "@/lib/auth-cookie";
import { apiUrl } from "@/lib/api-url";

// 로그인 프록시(BFF): 자격을 Nest /auth/login에 forward → accessToken을 httpOnly 쿠키로 심고
// 토큰이 아닌 프로필만 클라이언트에 반환. 토큰은 브라우저 JS에 절대 노출되지 않는다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  const upstream = await fetch(apiUrl("/auth/login", { requestUrl: request.url }), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });

  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json(
      { message: message || "로그인에 실패했습니다." },
      { status: upstream.status }
    );
  }

  const { accessToken, ...profile } = data as { accessToken: string; [k: string]: unknown };
  (await cookies()).set(AUTH_COOKIE, accessToken, authCookieOptions);

  return NextResponse.json(profile);
}
