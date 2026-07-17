import { createHmac } from "node:crypto";

const presentationSeparators = /[-\x09-\x0d\x20]/g;
const activationKeyPattern = /^[A-Z0-9]+$/;

export interface VendorActivationSecurityConfig {
  keyPepper: string;
}

function requirePepper(value: string) {
  if (!value.trim()) throw new Error("Activation key pepper must be non-empty.");
  return value;
}

export function loadVendorActivationSecurityConfig(
  env: NodeJS.ProcessEnv,
): VendorActivationSecurityConfig | undefined {
  const keyPepper = env.VENDOR_ACTIVATION_KEY_PEPPER?.trim();
  if (keyPepper) return { keyPepper };
  if (env.NODE_ENV === "production") {
    throw new Error("VENDOR_ACTIVATION_KEY_PEPPER is required in production.");
  }
  return undefined;
}

export function normalizeActivationKey(rawKey: string) {
  if (typeof rawKey !== "string") throw new Error("Invalid activation key.");
  const normalized = rawKey
    .replace(presentationSeparators, "")
    .replace(/[a-z]/g, (letter) => letter.toUpperCase());
  if (!activationKeyPattern.test(normalized)) throw new Error("Invalid activation key.");
  return normalized;
}

export function hashActivationKey(rawKey: string, pepper: string) {
  return createHmac("sha256", requirePepper(pepper))
    .update(normalizeActivationKey(rawKey), "utf8")
    .digest("hex");
}

export function deriveResceneActivationKey(
  activationId: string,
  pepper: string
) {
  const material = createHmac("sha256", requirePepper(pepper))
    .update(`rescene-vendor-activation:${activationId}`, "utf8")
    .digest("hex")
    .toUpperCase()
    .slice(0, 24);
  return `JIPJU-VND-${material.slice(0, 8)}-${material.slice(8, 16)}-${material.slice(16)}`;
}
