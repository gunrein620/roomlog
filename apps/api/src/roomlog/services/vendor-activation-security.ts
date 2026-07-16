import { createHmac, timingSafeEqual } from "node:crypto";
import type { VendorActivationSessionClaims } from "../vendor-activation.repository";

const activationSessionLifetimeMs = 5 * 60 * 1000;
const activationKeyDomain = "vendor-activation-key:";
const activationSessionDomain = "vendor-activation-session:";
const asciiPresentationSeparators = /[-\x09-\x0d\x20]/g;
const normalizedActivationKeyPattern = /^[A-Z0-9]+$/;

export interface VendorActivationSecurityConfig {
  keyPepper: string;
  sessionSecret: string;
}

export type VendorActivationSessionVerificationErrorReason =
  | "INVALID_SESSION"
  | "EXPIRED_SESSION";

export class VendorActivationSessionVerificationError extends Error {
  constructor(
    readonly reason: VendorActivationSessionVerificationErrorReason,
    message: string
  ) {
    super(message);
    this.name = "VendorActivationSessionVerificationError";
  }
}

function invalidSession(message: string) {
  return new VendorActivationSessionVerificationError(
    "INVALID_SESSION",
    message
  );
}

function requireSecret(value: string, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty.`);
  }

  return value;
}

function requireNonEmpty(value: string, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be non-empty.`);
  }

  return value;
}

function requireValidDate(value: Date, label: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid Date.`);
  }

  return value;
}

function signEncodedPayload(encodedPayload: string, sessionSecret: string) {
  return createHmac("sha256", requireSecret(sessionSecret, "Session secret"))
    .update(`${activationSessionDomain}${encodedPayload}`, "utf8")
    .digest("base64url");
}

function equalEncodedValues(expected: string, claimed: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const claimedBuffer = Buffer.from(claimed, "utf8");

  return (
    expectedBuffer.length === claimedBuffer.length &&
    timingSafeEqual(expectedBuffer, claimedBuffer)
  );
}

function parseSessionClaims(encodedPayload: string): VendorActivationSessionClaims {
  let value: unknown;

  try {
    value = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw invalidSession("Invalid vendor activation session payload.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidSession("Invalid vendor activation session claims.");
  }

  const claims = value as Record<string, unknown>;
  const keys = Object.keys(claims).sort();
  const exactKeys = ["activationId", "expiresAt", "keyFingerprint"];
  if (
    keys.length !== exactKeys.length ||
    keys.some((key, index) => key !== exactKeys[index]) ||
    typeof claims.activationId !== "string" ||
    claims.activationId.length === 0 ||
    typeof claims.keyFingerprint !== "string" ||
    claims.keyFingerprint.length === 0 ||
    typeof claims.expiresAt !== "string"
  ) {
    throw invalidSession("Invalid vendor activation session claims.");
  }

  const expiresAt = new Date(claims.expiresAt);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.toISOString() !== claims.expiresAt
  ) {
    throw invalidSession("Invalid vendor activation session expiry.");
  }

  return {
    activationId: claims.activationId,
    keyFingerprint: claims.keyFingerprint,
    expiresAt: claims.expiresAt
  };
}

export function loadVendorActivationSecurityConfig(
  env: NodeJS.ProcessEnv
): VendorActivationSecurityConfig | undefined {
  const keyPepper = env.VENDOR_ACTIVATION_KEY_PEPPER?.trim();
  const sessionSecret = env.VENDOR_ACTIVATION_SESSION_SECRET?.trim();

  if (keyPepper && sessionSecret) {
    return { keyPepper, sessionSecret };
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "VENDOR_ACTIVATION_KEY_PEPPER and VENDOR_ACTIVATION_SESSION_SECRET are required in production."
    );
  }

  return undefined;
}

export function normalizeActivationKey(rawKey: string) {
  if (typeof rawKey !== "string") {
    throw new Error("Invalid activation key.");
  }

  const normalized = rawKey
    .replace(asciiPresentationSeparators, "")
    .replace(/[a-z]/g, (letter) => letter.toUpperCase());

  if (!normalizedActivationKeyPattern.test(normalized)) {
    throw new Error("Invalid activation key.");
  }

  return normalized;
}

export function hashActivationKey(rawKey: string, pepper: string) {
  const normalizedKey = normalizeActivationKey(rawKey);

  return createHmac("sha256", requireSecret(pepper, "Activation key pepper"))
    .update(normalizedKey, "utf8")
    .digest("hex");
}

export function activationKeyFingerprint(keyHash: string, sessionSecret: string) {
  return createHmac("sha256", requireSecret(sessionSecret, "Session secret"))
    .update(
      `${activationKeyDomain}${requireNonEmpty(keyHash, "Activation key hash")}`,
      "utf8"
    )
    .digest("base64url");
}

export function verifyActivationKeyFingerprint(
  keyHash: string,
  claimedFingerprint: string,
  sessionSecret: string
) {
  if (typeof claimedFingerprint !== "string") return false;

  const expected = activationKeyFingerprint(keyHash, sessionSecret);
  return equalEncodedValues(expected, claimedFingerprint);
}

export function signActivationSession(
  input: { activationId: string; keyHash: string; now: Date },
  sessionSecret: string
): { token: string; claims: VendorActivationSessionClaims } {
  const activationId = requireNonEmpty(input.activationId, "Activation id");
  const keyHash = requireNonEmpty(input.keyHash, "Activation key hash");
  const now = requireValidDate(input.now, "Activation session time");
  const claims: VendorActivationSessionClaims = {
    activationId,
    keyFingerprint: activationKeyFingerprint(keyHash, sessionSecret),
    expiresAt: new Date(now.getTime() + activationSessionLifetimeMs).toISOString()
  };
  const encodedPayload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = signEncodedPayload(encodedPayload, sessionSecret);

  return {
    token: `${encodedPayload}.${signature}`,
    claims
  };
}

export function verifyActivationSession(
  token: string,
  sessionSecret: string,
  now: Date
): VendorActivationSessionClaims {
  requireSecret(sessionSecret, "Session secret");
  const verificationTime = requireValidDate(
    now,
    "Activation session verification time"
  );
  if (typeof token !== "string") {
    throw invalidSession("Invalid vendor activation session.");
  }

  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw invalidSession("Invalid vendor activation session.");
  }

  const [encodedPayload, claimedSignature] = parts;
  const expectedSignature = signEncodedPayload(encodedPayload, sessionSecret);
  if (!equalEncodedValues(expectedSignature, claimedSignature)) {
    throw invalidSession("Invalid vendor activation session signature.");
  }

  const claims = parseSessionClaims(encodedPayload);
  if (new Date(claims.expiresAt).getTime() <= verificationTime.getTime()) {
    throw new VendorActivationSessionVerificationError(
      "EXPIRED_SESSION",
      "Vendor activation session has expired."
    );
  }

  return claims;
}
