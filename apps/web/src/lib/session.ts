import { redirect } from "next/navigation";
import type { VendorAccountView } from "@roomlog/types";
import { serverFetch, ApiError } from "./server-api";
import {
  defaultRedirectForIntent,
  hasCapability,
  intentForRole,
  unifiedLoginPath,
  type UserRole
} from "./unified-login";

export type { UserRole };

// GET /auth/me 응답 shape (roomlog.service.getMe). 백엔드가 관계에서 파생한
// roles/primaryRole을 내려주고, role 단일값은 backward compatibility로 유지된다.
export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  roles?: UserRole[];
  primaryRole?: UserRole;
  roomId?: string;
  room?: { id: string; roomNo?: string; buildingId?: string } | undefined;
  managedRooms?: Array<{ id: string; buildingName?: string; roomNo?: string; address?: string }> | undefined;
  vendorId?: string;
  vendor?: VendorAccountView;
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
 * 보호 화면 상단에서 호출. 미인증이면 통합 로그인(/login)으로 리다이렉트.
 * role은 파생 capability(roles) 기준으로 확인한다 — 겸직 계정(TENANT+LANDLORD)도
 * 각 표면에 진입할 수 있다. capability가 없으면 재로그인 대신 /login의
 * "이 계정에 연결이 필요하다" 안내 상태로 보낸다(intent 유지).
 */
export async function requireUser(role?: UserRole, redirectTo?: string): Promise<SessionUser> {
  const intent = intentForRole(role);
  const loginPath = unifiedLoginPath(intent, redirectTo ?? defaultRedirectForIntent(intent));
  const user = await getUser();

  if (!user) redirect(loginPath);
  if (role && !hasCapability(user, role)) redirect(loginPath);

  return user;
}
