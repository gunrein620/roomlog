import { redirect } from "next/navigation";
import { serverFetch, ApiError } from "./server-api";

export type UserRole = "TENANT" | "LANDLORD" | "VENDOR";

// GET /auth/me 응답 shape (roomlog.service.getMe). 백엔드 불변이므로 이 shape에 맞춘다.
export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  roomId?: string;
  room?: { id: string; roomNo?: string; buildingId?: string } | undefined;
  managedRooms?: Array<{ id: string }> | undefined;
  vendorId?: string;
  vendor?: unknown;
}

/** 로그인 안 됐으면 null (쿠키 없음/만료). 화면에서 분기용. */
export async function getUser(): Promise<SessionUser | null> {
  try {
    return await serverFetch<SessionUser>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError) return null; // 401·토큰 무효 등 → 미인증 취급
    throw error; // 네트워크 등 예기치 못한 오류는 표면화
  }
}

/**
 * 보호 화면 상단에서 호출. 미인증이면 로그인으로 리다이렉트.
 * role을 주면 역할까지 강제 — 다른 역할 세션의 진입을 막는다(백엔드 403이
 * 데모 폴백으로 가려지는 것 방지). 각 도메인 가드가 자기 역할을 명시한다.
 */
export async function requireUser(
  loginPath = "/tenant/login",
  role?: UserRole
): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(loginPath);
  if (role && user.role !== role) redirect(loginPath);
  return user;
}
