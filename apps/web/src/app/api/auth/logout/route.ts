import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 로그아웃: httpOnly 쿠키 삭제. (백엔드는 무상태 토큰이라 서버 세션 무효화 불필요.)
// CSRF 방어: 교차출처 강제 로그아웃을 막기 위해 Origin이 있으면 host와 일치해야 함.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ message: "잘못된 요청 출처입니다." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "잘못된 요청 출처입니다." }, { status: 403 });
    }
  }
  (await cookies()).delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
