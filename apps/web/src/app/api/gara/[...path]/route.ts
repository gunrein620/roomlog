import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { garaUpstreamPath } from "./gara-path";

type GaraMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function forward(
  request: Request,
  path: string[],
  method: GaraMethod,
) {
  const upstreamPath = garaUpstreamPath(path);
  if (!upstreamPath) {
    return NextResponse.json({ message: "요청 경로가 올바르지 않습니다." }, { status: 404 });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, headers, cache: "no-store" };
  if (method === "POST" || method === "PATCH") {
    headers["Content-Type"] = request.headers.get("content-type") ?? "application/json";
    init.body = await request.text();
  }

  let upstream: Response;
  try {
    const search = new URL(request.url).search;
    upstream = await fetch(
      apiUrl(`${upstreamPath}${search}`, { requestUrl: request.url }),
      init,
    );
  } catch {
    return NextResponse.json(
      { code: "UPSTREAM_UNAVAILABLE", message: "API 서버에 연결할 수 없습니다." },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
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
