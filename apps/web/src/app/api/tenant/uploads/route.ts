import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const incoming = await request.formData();
  const form = new FormData();
  for (const [key, value] of incoming.entries()) {
    form.append(key, value);
  }

  const upstream = await fetch(apiUrl("/attachments", { requestUrl: request.url }), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    body: form,
    cache: "no-store"
  });
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json(
      { message: message || "이미지 업로드에 실패했습니다." },
      { status: upstream.status }
    );
  }

  return NextResponse.json(data);
}
