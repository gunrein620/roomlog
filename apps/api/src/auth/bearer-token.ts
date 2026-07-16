import { createHmac, timingSafeEqual } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";

const INVALID_BEARER_MESSAGE = "인증 토큰이 올바르지 않습니다.";

function invalidBearer(): never {
  throw new UnauthorizedException(INVALID_BEARER_MESSAGE);
}

export function requireBearerSubject(
  authorization: string | undefined,
  secret: string
): string {
  try {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "");
    if (!match || !secret) invalidBearer();

    const segments = match[1].split(".");
    if (segments.length !== 2) invalidBearer();
    const [payload, signature] = segments;
    if (!payload || !signature) invalidBearer();

    const expected = Buffer.from(
      createHmac("sha256", secret).update(payload).digest("base64url"),
      "utf8"
    );
    const actual = Buffer.from(signature, "utf8");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      invalidBearer();
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { sub?: unknown }).sub !== "string"
    ) {
      invalidBearer();
    }
    const subject = (parsed as { sub: string }).sub.trim();
    if (!subject) invalidBearer();
    return subject;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    invalidBearer();
  }
}
