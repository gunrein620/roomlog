import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 거래(매물 직접등록·문의 채팅) API 프록시 — 브라우저는 Next하고만 통신하고,
// httpOnly 쿠키의 토큰을 Bearer로 바꿔 Nest로 전달한다 (/api/auth/* 와 같은 패턴).

async function forward(request: Request, path: string[], method: "GET" | "POST" | "PATCH" | "DELETE") {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const search = new URL(request.url).search;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers, cache: "no-store" };
  if (method === "POST" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    init.body = await request.text();
  }

  const upstream = await fetch(apiUrl(`/trade/${path.join("/")}${search}`, { requestUrl: request.url }), init);
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json({ message: message || "요청을 처리하지 못했습니다." }, { status: upstream.status });
  }

  return NextResponse.json(data);
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "GET");
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "POST");
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "PATCH");
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "DELETE");
}
