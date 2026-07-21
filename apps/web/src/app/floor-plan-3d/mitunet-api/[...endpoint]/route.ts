import {
  applyRoomLogMitunetFormOptions,
  MITUNET_INTERNAL_SERVICE_URL,
} from "../../mitunet-proxy";
import {
  fetchMitunetUpstream,
  MitunetUpstreamTimeoutError,
} from "../../mitunet-upstream";

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

  const response = await fetchMitunetUpstream(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    method: request.method,
  }, {
    timeoutMs: 5_000,
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
  applyRoomLogMitunetFormOptions(url.pathname.slice(1), formData);
  const response = await fetchMitunetUpstream(url, {
    body: formData,
    cache: "no-store",
    headers: { Accept: "application/json" },
    method: "POST",
  }, {
    timeoutMs: 90_000,
  });
  return new Response(response.body, {
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    status: response.status,
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    return await proxyJsonRequest(request, context);
  } catch (error) {
    return upstreamErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    return await proxyFormRequest(request, context);
  } catch (error) {
    return upstreamErrorResponse(error);
  }
}

function upstreamErrorResponse(error: unknown) {
  if (error instanceof MitunetUpstreamTimeoutError) {
    return Response.json({ error: "MITUNET_UPSTREAM_TIMEOUT" }, { status: 504 });
  }
  throw error;
}
