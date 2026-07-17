import { apiUrl } from "@/lib/api-url";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;

  if (!path.length) {
    return new Response("File path is required.", { status: 404 });
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const upstream = await fetch(apiUrl(`/files/${encodedPath}`), { cache: "no-store" });

  if (!upstream.ok) {
    return new Response("File not found.", { status: upstream.status });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");

  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("cache-control", "no-store");
  headers.set(
    "content-disposition",
    upstream.headers.get("content-disposition") ?? `inline; filename="contract"; filename*=UTF-8''${encodeURIComponent(path.at(-1) ?? "contract")}`
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
