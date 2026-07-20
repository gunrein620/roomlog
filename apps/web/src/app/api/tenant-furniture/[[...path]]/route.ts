import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// 임차인 가구함 API 프록시 — src/lib/tenant-furniture-api.ts(클라이언트 fetch)가 httpOnly 쿠키
// 인증으로 Nest /tenant-furniture/*에 닿게 한다. tenant/[...path] 프록시와 같은 패턴이되, 목록
// 조회(GET /api/tenant-furniture, 세그먼트 0개)도 잡아야 해서 optional catch-all을 쓴다.

async function forward(
  request: Request,
  path: string[] | undefined,
  method: "GET" | "PUT" | "PATCH"
) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const search = new URL(request.url).search;
  const suffix = path && path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`
  };
  const init: RequestInit = { method, headers, cache: "no-store" };

  if (method === "PUT" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    init.body = await request.text();
  }

  const upstream = await fetch(apiUrl(`/tenant-furniture${suffix}${search}`, { requestUrl: request.url }), init);
  const data = await upstream.json().catch(() => undefined);

  if (!upstream.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return NextResponse.json({ message: message || "요청을 처리하지 못했습니다." }, { status: upstream.status });
  }

  return NextResponse.json(data ?? null);
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "GET");
}

export async function PUT(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "PUT");
}

export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "PATCH");
}
