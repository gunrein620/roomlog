import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { tokenSecret } from "../roomlog/roomlog-support";
import type { AgentPrincipal } from "./agent-tool-action.repository";

export type AgentResourceKind =
  | "repair"
  | "estimate"
  | "payment"
  | "order"
  | "vendor"
  | "ticket"
  | "bill"
  | "thread"
  | "topup";

type AgentResourceClaims = {
  version: 1;
  principalUserId: string;
  principalRole: AgentPrincipal["role"];
  kind: AgentResourceKind;
  resourceId: string;
  complaintId?: string;
  expiresAt: string;
};

type AgentResourceRefOptions = {
  secret?: string;
  now?: () => Date;
  ttlMs?: number;
};

const AAD = Buffer.from("roomlog-agent-resource:v1", "utf8");

function invalid(): never {
  throw new BadRequestException(
    "요청 대상 확인 정보가 만료되었거나 올바르지 않습니다.",
  );
}

export class AgentResourceRefCodec {
  private readonly key: Buffer;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(options: AgentResourceRefOptions = {}) {
    this.key = createHash("sha256")
      .update(`agent-resource:${options.secret?.trim() || tokenSecret}`, "utf8")
      .digest();
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  }

  issue(
    principal: AgentPrincipal,
    kind: AgentResourceKind,
    resourceId: string,
    complaintId?: string,
  ) {
    const normalizedId = resourceId.trim();
    if (!normalizedId) invalid();
    const claims: AgentResourceClaims = {
      version: 1,
      principalUserId: principal.userId,
      principalRole: principal.role,
      kind,
      resourceId: normalizedId,
      ...(complaintId?.trim() ? { complaintId: complaintId.trim() } : {}),
      expiresAt: new Date(this.now().getTime() + this.ttlMs).toISOString(),
    };
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(claims), "utf8"),
      cipher.final(),
    ]);
    return [nonce, ciphertext, cipher.getAuthTag()]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  read(
    principal: AgentPrincipal,
    kind: AgentResourceKind,
    token: unknown,
  ): AgentResourceClaims {
    if (typeof token !== "string") invalid();
    const [noncePart, ciphertextPart, tagPart, ...rest] = token
      .trim()
      .split(".");
    if (!noncePart || !ciphertextPart || !tagPart || rest.length) invalid();
    let claims: AgentResourceClaims;
    try {
      const nonce = Buffer.from(noncePart, "base64url");
      const ciphertext = Buffer.from(ciphertextPart, "base64url");
      const tag = Buffer.from(tagPart, "base64url");
      if (nonce.length !== 12 || !ciphertext.length || tag.length !== 16) {
        invalid();
      }
      const decipher = createDecipheriv("aes-256-gcm", this.key, nonce);
      decipher.setAAD(AAD);
      decipher.setAuthTag(tag);
      claims = JSON.parse(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
          "utf8",
        ),
      ) as AgentResourceClaims;
    } catch {
      invalid();
    }
    if (
      claims.version !== 1 ||
      claims.principalUserId !== principal.userId ||
      claims.principalRole !== principal.role ||
      claims.kind !== kind ||
      typeof claims.resourceId !== "string" ||
      !claims.resourceId.trim() ||
      typeof claims.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(claims.expiresAt)) ||
      Date.parse(claims.expiresAt) <= this.now().getTime()
    ) {
      invalid();
    }
    return claims;
  }
}
