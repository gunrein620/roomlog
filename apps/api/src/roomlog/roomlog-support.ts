// 공유 순수 유틸 — roomlog 도메인 서비스들이 공통으로 쓰는 무상태 함수.
// roomlog.service.ts에서 추출(동작 불변). 도메인 협력 클래스가 순환 import 없이 참조하도록 별도 모듈로 분리.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { UserAccount, UserRole } from "./roomlog.types";

export const now = () => new Date().toISOString();

export function id(prefix: string) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

export function normalizePhoneNumber(phone?: string) {
  const digits = phone?.replace(/\D+/g, "") ?? "";

  return digits || undefined;
}

export function isValidPhoneNumber(phone: string) {
  return /^\d{10,11}$/.test(phone);
}

export function hasRequiredPasswordMix(password: string) {
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function hashPassword(password: string, salt = randomBytes(12).toString("hex")) {
  const key = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  const actual = Buffer.from(hashPassword(password, salt).split(":")[1], "hex");
  const expected = Buffer.from(key, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const tokenSecret = process.env.JWT_SECRET || "roomlog-local-dev-secret";

// capability 파생에 필요한 관계 스냅샷 — Store 전체가 아니라 필요한 관계만 구조적으로 받는다(순환 import 회피).
export type UserRoleRelations = {
  tenantRooms: Record<string, string>;
  rooms: Array<{ landlordId?: string }>;
  vendors: Array<{ userId: string }>;
};

/**
 * 계정의 roles를 관계에서 파생한다. UserAccount.role 단일값은 backward compatibility로만 유지되고,
 * 실제 권한 판단은 여기서 나온 capability 집합을 쓴다.
 * - SEEKER: 모든 계정 기본
 * - TENANT: TenantRoom 연결 존재
 * - LANDLORD: 소유한 Room 존재
 * - VENDOR: VendorProfile 연결 존재
 * legacy user.role은 관계가 아직 없어도 포함시킨다(기존 단일-role 계정 회귀 방지).
 */
export function deriveUserRoles(user: UserAccount, relations: UserRoleRelations): UserRole[] {
  const roles: UserRole[] = ["SEEKER"];

  if (relations.tenantRooms[user.id]) roles.push("TENANT");
  if (relations.rooms.some((room) => room.landlordId === user.id)) roles.push("LANDLORD");
  if (relations.vendors.some((vendor) => vendor.userId === user.id)) roles.push("VENDOR");
  if (user.role !== "SEEKER" && !roles.includes(user.role)) roles.push(user.role);

  return roles;
}

/** 대표 role — legacy user.role(non-SEEKER)이 파생 집합에 있으면 그대로, 아니면 첫 non-SEEKER capability. */
export function primaryUserRole(user: UserAccount, roles: UserRole[]): UserRole {
  if (user.role !== "SEEKER" && roles.includes(user.role)) return user.role;
  return roles.find((role) => role !== "SEEKER") ?? "SEEKER";
}

export function tokenFor(user: UserAccount) {
  const payload = Buffer.from(
    JSON.stringify({ sub: user.id, role: user.role, email: user.email })
  ).toString("base64url");
  const signature = createHmac("sha256", tokenSecret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}
