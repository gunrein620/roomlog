import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 로그아웃: httpOnly 쿠키 삭제. (백엔드는 무상태 토큰이라 서버 세션 무효화 불필요.)
export async function POST() {
  (await cookies()).delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
