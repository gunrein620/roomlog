import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function apiBaseUrl() {
  const internalUrl = process.env.API_INTERNAL_URL?.trim();
  if (internalUrl) return internalUrl.replace(/\/$/, "");

  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicUrl && /^https?:\/\//.test(publicUrl)) return publicUrl.replace(/\/$/, "");

  return "http://localhost:4000";
}

function apiSearchUrl(query: string) {
  const baseUrl = apiBaseUrl();
  const path = baseUrl.endsWith("/api") ? "/map/search" : "/api/map/search";
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("q", query);
  return url;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 100) {
    return NextResponse.json({ configured: true, message: "검색어를 1~100자로 입력해 주세요.", items: [] }, { status: 400 });
  }

  const url = apiSearchUrl(query);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    const payload = await response.json().catch(() => ({
      configured: true,
      message: "지도 검색 API 응답을 해석하지 못했습니다.",
      items: []
    }));

    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { configured: true, message: "지도 검색 API 서버에 연결하지 못했습니다.", items: [] },
      { status: 504 }
    );
  }
}
