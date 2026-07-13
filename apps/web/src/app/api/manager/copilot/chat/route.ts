import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const upstream = await fetch(apiUrl("/manager/copilot/chat", { requestUrl: request.url }), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: await request.text(),
    cache: "no-store"
  });
  const data = await upstream.json().catch(() => undefined);

  if (data === undefined) {
    return NextResponse.json({ message: "업스트림 응답을 해석하지 못했습니다." }, { status: upstream.status });
  }

  return NextResponse.json(data, { status: upstream.status });
}
