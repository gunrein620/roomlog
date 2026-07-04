// 공유 순수 유틸 — roomlog 도메인 서비스들이 공통으로 쓰는 무상태 함수.
// roomlog.service.ts에서 추출(동작 불변). 도메인 협력 클래스가 순환 import 없이 참조하도록 별도 모듈로 분리.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { UserAccount } from "./roomlog.types";

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

export function tokenFor(user: UserAccount) {
  const payload = Buffer.from(
    JSON.stringify({ sub: user.id, role: user.role, email: user.email })
  ).toString("base64url");
  const signature = createHmac("sha256", tokenSecret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}
