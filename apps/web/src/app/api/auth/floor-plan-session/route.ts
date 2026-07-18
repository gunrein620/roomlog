import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCookieOptions } from "@/lib/auth-cookie";
import { apiUrl } from "@/lib/api-url";

type AuthProfile = {
  role?: unknown;
  roles?: unknown;
};

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const message = (data as { message?: unknown }).message;
  if (Array.isArray(message)) return message.filter((item): item is string => typeof item === "string").join(", ") || fallback;
  return typeof message === "string" ? message : fallback;
}

function hasLandlordRole(profile: unknown) {
  if (!profile || typeof profile !== "object") return false;
  const { role, roles } = profile as AuthProfile;
  return (Array.isArray(roles) ? roles : [role]).includes("LANDLORD");
}

async function verifyAuthorization(authorization: string, request: Request) {
  const upstream = await fetch(apiUrl("/auth/me", { requestUrl: request.url }), {
    cache: "no-store",
    headers: { Accept: "application/json", Authorization: authorization },
  });
  const data = await upstream.json().catch(() => undefined);
  return { data, upstream };
}

// The floor-plan editor historically cached a direct API token in localStorage.
// This bridge validates that token and adopts it into the normal httpOnly BFF session
// only when there is no still-valid RoomLog session to preserve.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ message: "잘못된 요청 출처입니다." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "잘못된 요청 출처입니다." }, { status: 403 });
    }
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(AUTH_COOKIE)?.value;
  if (existingToken) {
    const existing = await verifyAuthorization(`Bearer ${existingToken}`, request);
    if (existing.upstream.ok) {
      if (!hasLandlordRole(existing.data)) {
        return NextResponse.json({ message: "임대인 권한이 필요합니다." }, { status: 403 });
      }
      return NextResponse.json({ ok: true });
    }
    if (existing.upstream.status !== 401) {
      return NextResponse.json(
        { message: messageFrom(existing.data, "로그인 상태를 확인하지 못했습니다.") },
        { status: existing.upstream.status },
      );
    }
    cookieStore.delete(AUTH_COOKIE);
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const adopted = await verifyAuthorization(authorization, request);
  if (!adopted.upstream.ok) {
    return NextResponse.json(
      { message: messageFrom(adopted.data, "로그인이 필요합니다.") },
      { status: adopted.upstream.status },
    );
  }
  if (!hasLandlordRole(adopted.data)) {
    return NextResponse.json({ message: "임대인 권한이 필요합니다." }, { status: 403 });
  }

  cookieStore.set(AUTH_COOKIE, token, authCookieOptions);
  return NextResponse.json({ ok: true });
}
