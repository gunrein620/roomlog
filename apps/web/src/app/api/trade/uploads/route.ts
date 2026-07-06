import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 매물 사진 업로드 프록시(멀티파트 전용) — [...path] 프록시는 JSON 강제라 파일을 못 보낸다.
// 정적 세그먼트 라우트가 catch-all보다 우선하므로 /api/trade/uploads는 여기로 온다.
// Content-Type(boundary)은 직접 세팅하지 않고 FormData 재구성으로 fetch가 정하게 둔다.

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const incoming = await request.formData();
  const form = new FormData();
  for (const [key, value] of incoming.entries()) {
    form.append(key, value);
  }

  const upstream = await fetch(apiUrl("/trade/uploads", { requestUrl: request.url }), {
    method: "POST",
    headers,
    body: form,
    cache: "no-store"
  });
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json({ message: message || "사진 업로드에 실패했습니다." }, { status: upstream.status });
  }

  return NextResponse.json(data);
}
