import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 세입자 룸로그 API 프록시 — SPA(page.tsx)의 수리요청/민원 조회가 httpOnly 쿠키 인증으로
// Nest /tenant/*에 닿게 한다. manager/[...path] 프록시와 같은 패턴.

async function forward(
  request: Request,
  path: string[],
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const search = new URL(request.url).search;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`
  };
  const init: RequestInit = { method, headers, cache: "no-store" };

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    init.body = await request.text();
  }

  const upstream = await fetch(
    apiUrl(`/tenant/${path.join("/")}${search}`, { requestUrl: request.url }),
    init
  );
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json(
      { message: message || "요청을 처리하지 못했습니다." },
      { status: upstream.status }
    );
  }

  // 업스트림이 빈 바디(예: vendor-workflow의 null)를 주면 undefined가 되는데,
  // NextResponse.json(undefined)는 500을 던지므로 null로 정규화한다.
  return NextResponse.json(data ?? null);
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "GET");
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "POST");
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "PUT");
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "PATCH");
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "DELETE");
}
