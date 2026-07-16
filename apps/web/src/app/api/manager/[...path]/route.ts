import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

async function forward(
  request: Request,
  path: string[],
  method: "GET" | "POST" | "PATCH" | "DELETE"
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

  if (method === "POST" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    init.body = await request.text();
  }

  const upstream = await fetch(
    apiUrl(`/manager/${path.join("/")}${search}`, { requestUrl: request.url }),
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
