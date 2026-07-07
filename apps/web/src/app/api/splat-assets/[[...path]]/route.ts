import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

type SplatProxyMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function forward(request: Request, path: string[] | undefined, method: SplatProxyMethod) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const search = new URL(request.url).search;
  const suffix = path && path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const headers = new Headers();
  headers.set("Accept", request.headers.get("Accept") ?? "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const init: RequestInit & { duplex?: "half" } = { method, headers, cache: "no-store" };

  if (method === "POST" || method === "PATCH") {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (contentType) headers.set("Content-Type", contentType);

    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      init.body = request.body;
      init.duplex = "half";
    } else {
      init.body = await request.text();
    }
  }

  const upstream = await fetch(apiUrl(`/splat-assets${suffix}${search}`, { requestUrl: request.url }), init);
  const body = await upstream.text();
  const responseHeaders = new Headers();
  const responseContentType = upstream.headers.get("Content-Type");
  if (responseContentType) responseHeaders.set("Content-Type", responseContentType);

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "GET");
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "POST");
}

export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "PATCH");
}

export async function DELETE(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path, "DELETE");
}
