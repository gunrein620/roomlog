import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

export async function GET(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const upstream = await fetch(apiUrl("/auth/me", { requestUrl: request.url }), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    (await cookies()).delete(AUTH_COOKIE);
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json({ message: message || "로그인이 필요합니다." }, { status: upstream.status });
  }

  return NextResponse.json(data);
}
