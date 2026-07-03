import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCookieOptions } from "@/lib/auth-cookie";
import { apiUrl } from "@/lib/api-url";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  const upstream = await fetch(apiUrl("/auth/signup", { requestUrl: request.url }), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });

  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json(
      { message: message || "회원가입에 실패했습니다." },
      { status: upstream.status }
    );
  }

  const { accessToken, ...profile } = data as { accessToken: string; [k: string]: unknown };
  (await cookies()).set(AUTH_COOKIE, accessToken, authCookieOptions);

  return NextResponse.json(profile);
}
