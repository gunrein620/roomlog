import { MITUNET_INTERNAL_SERVICE_URL } from "../../mitunet-proxy";

export const dynamic = "force-dynamic";

const ALLOWED_ENDPOINTS = new Set(["extract-image", "compose-edits", "integration-config", "healthz"]);

type RouteContext = {
  params: Promise<{ endpoint: string[] }>;
};

async function targetUrl(context: RouteContext) {
  const { endpoint } = await context.params;
  const endpointPath = endpoint.join("/");
  if (!ALLOWED_ENDPOINTS.has(endpointPath)) {
    return null;
  }
  return new URL(`/${endpointPath}`, MITUNET_INTERNAL_SERVICE_URL);
}

async function proxyJsonRequest(request: Request, context: RouteContext) {
  const url = await targetUrl(context);
  if (!url) return new Response("Not found", { status: 404 });

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    method: request.method,
  });
  return new Response(response.body, {
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    status: response.status,
  });
}

async function proxyFormRequest(request: Request, context: RouteContext) {
  const url = await targetUrl(context);
  if (!url) return new Response("Not found", { status: 404 });

  const formData = await request.formData();
  const response = await fetch(url, {
    body: formData,
    cache: "no-store",
    headers: { Accept: "application/json" },
    method: "POST",
  });
  return new Response(response.body, {
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    status: response.status,
  });
}

export async function GET(request: Request, context: RouteContext) {
  return proxyJsonRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyFormRequest(request, context);
}
