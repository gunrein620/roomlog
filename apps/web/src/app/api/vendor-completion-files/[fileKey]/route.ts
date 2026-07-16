import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileKey: string }> }
) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { fileKey } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(
      apiUrl(`/vendor-completion-files/${encodeURIComponent(fileKey)}`, {
        requestUrl: request.url
      }),
      {
        headers: {
          Accept: request.headers.get("Accept") ?? "image/*",
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      }
    );
  } catch {
    return NextResponse.json(
      { code: "UPSTREAM_UNAVAILABLE", message: "API 서버에 연결할 수 없습니다." },
      { status: 503 }
    );
  }

  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (const name of ["Content-Type", "Content-Length", "Content-Disposition"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}
