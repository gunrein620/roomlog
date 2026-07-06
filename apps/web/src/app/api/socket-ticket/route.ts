import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 소켓 핸드셰이크용 단기 티켓 발급 프록시.
// 인증 토큰은 httpOnly 쿠키라 브라우저 JS가 못 읽는다 — 여기서 쿠키 토큰으로
// Nest에 티켓을 대신 받아 넘겨주고, 토큰 자체는 계속 JS에 노출하지 않는다.
export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const upstream = await fetch(apiUrl("/auth/socket-ticket", { requestUrl: request.url }), {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    return NextResponse.json({ message: data?.message || "티켓 발급에 실패했습니다." }, { status: upstream.status });
  }

  return NextResponse.json(data);
}
