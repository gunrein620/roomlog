import type {
  VendorActivationClaimResult,
  VendorActivationErrorCode,
  VendorActivationErrorResponse,
  VendorActivationPreviewEnvelope
} from "@roomlog/types";
import type { UserAccount } from "../roomlog.types";
import {
  deriveUserRoles,
  type UserRoleRelations
} from "../roomlog-support";
import {
  VendorActivationRepositoryError,
  type VendorActivationRecord,
  type VendorActivationRepository
} from "../vendor-activation.repository";
import {
  VendorActivationSessionVerificationError,
  hashActivationKey,
  normalizeActivationKey,
  signActivationSession,
  verifyActivationKeyFingerprint,
  verifyActivationSession,
  type VendorActivationSecurityConfig
} from "./vendor-activation-security";

export interface VendorActivationAccountContext {
  user: UserAccount;
  relations: UserRoleRelations;
}

export type VendorActivationAccountContextLoader = (
  userId: string
) =>
  | VendorActivationAccountContext
  | undefined
  | Promise<VendorActivationAccountContext | undefined>;

const publicErrors: Record<
  VendorActivationErrorCode,
  VendorActivationErrorResponse
> = {
  INVALID_KEY: {
    code: "INVALID_KEY",
    message: "업체 활성화 키가 올바르지 않습니다."
  },
  EXPIRED_KEY: {
    code: "EXPIRED_KEY",
    message: "업체 활성화 키가 만료되었습니다."
  },
  UNAVAILABLE_VENDOR: {
    code: "UNAVAILABLE_VENDOR",
    message: "현재 활성화할 수 없는 업체입니다."
  },
  ALREADY_CLAIMED: {
    code: "ALREADY_CLAIMED",
    message: "이미 다른 계정에 연결된 업체입니다."
  },
  DEDICATED_ACCOUNT_REQUIRED: {
    code: "DEDICATED_ACCOUNT_REQUIRED",
    message: "업체 전용 계정으로 다시 진행해 주세요."
  },
  ACCOUNT_ALREADY_LINKED: {
    code: "ACCOUNT_ALREADY_LINKED",
    message: "이미 다른 업체 계정에 연결되어 있습니다."
  },
  ACTIVATION_UNAVAILABLE: {
    code: "ACTIVATION_UNAVAILABLE",
    message: "업체 계정 활성화를 현재 사용할 수 없습니다."
  }
};

export class VendorActivationDomainError extends Error {
  constructor(readonly response: VendorActivationErrorResponse) {
    super(response.message);
  }
}

function fail(code: VendorActivationErrorCode): never {
  const response = publicErrors[code];
  throw new VendorActivationDomainError({ ...response });
}

function translateRepositoryError(error: unknown): never {
  if (error instanceof VendorActivationRepositoryError) {
    fail(error.code);
  }

  throw error;
}

function maskPhone(phone: string | undefined) {
  const digits = phone?.replace(/\D+/g, "") ?? "";

  if (digits.length === 11 && digits.startsWith("010")) {
    return `010-****-${digits.slice(-4)}`;
  }

  if (digits.length >= 4) {
    return `***-****-${digits.slice(-4)}`;
  }

  return "연락처 비공개";
}

function assertAvailableVendor(record: VendorActivationRecord) {
  if (!record.vendor.isActive || record.vendor.verificationStatus === "REJECTED") {
    fail("UNAVAILABLE_VENDOR");
  }
}

function assertPreviewable(record: VendorActivationRecord, at: Date) {
  if (record.status === "REVOKED") fail("INVALID_KEY");
  if (record.status === "EXPIRED" || record.expiresAt.getTime() <= at.getTime()) {
    fail("EXPIRED_KEY");
  }
  if (record.status === "CLAIMED") fail("ALREADY_CLAIMED");

  assertAvailableVendor(record);
}

function assertClaimable(
  record: VendorActivationRecord,
  userId: string,
  at: Date
) {
  assertAvailableVendor(record);

  if (record.status === "CLAIMED") {
    if (record.claimedByUserId !== userId) fail("ALREADY_CLAIMED");
  } else {
    if (record.status === "REVOKED") fail("INVALID_KEY");
    if (
      record.status === "EXPIRED" ||
      record.expiresAt.getTime() <= at.getTime()
    ) {
      fail("EXPIRED_KEY");
    }
  }
}

export class RoomlogVendorActivationDomain {
  constructor(
    private readonly repository: VendorActivationRepository,
    private readonly security: VendorActivationSecurityConfig | undefined,
    private readonly loadAccountContext: VendorActivationAccountContextLoader,
    private readonly now: () => Date = () => new Date()
  ) {}

  async preview(rawKey: string): Promise<VendorActivationPreviewEnvelope> {
    const security = this.requireSecurity();
    let normalizedKey: string;

    try {
      normalizedKey = normalizeActivationKey(rawKey);
    } catch {
      fail("INVALID_KEY");
    }
    const keyHash = hashActivationKey(normalizedKey, security.keyPepper);

    let record: VendorActivationRecord | undefined;
    try {
      record = await this.repository.getByKeyHash(keyHash);
    } catch (error) {
      translateRepositoryError(error);
    }

    if (!record) fail("INVALID_KEY");

    const currentTime = this.now();
    assertPreviewable(record, currentTime);
    const session = signActivationSession(
      {
        activationId: record.id,
        keyHash: record.keyHash,
        now: currentTime
      },
      security.sessionSecret
    );

    return {
      preview: {
        activationSessionExpiresAt: session.claims.expiresAt,
        vendor: {
          vendorId: record.vendor.id,
          businessName: record.vendor.businessName,
          trades: [...record.vendor.trades],
          serviceAreas: [...record.vendor.serviceAreas],
          verificationStatus: record.vendor.verificationStatus,
          maskedPhone: maskPhone(record.vendor.phone)
        }
      },
      activationSession: session.token
    };
  }

  async claim(
    userId: string,
    activationSession: string
  ): Promise<VendorActivationClaimResult> {
    const security = this.requireSecurity();
    const currentTime = this.now();
    let claims: ReturnType<typeof verifyActivationSession>;

    try {
      claims = verifyActivationSession(
        activationSession,
        security.sessionSecret,
        currentTime
      );
    } catch (error) {
      if (error instanceof VendorActivationSessionVerificationError) {
        if (error.reason === "EXPIRED_SESSION") fail("EXPIRED_KEY");
        fail("INVALID_KEY");
      }
      throw error;
    }

    let record: VendorActivationRecord | undefined;
    try {
      record = await this.repository.getById(claims.activationId);
    } catch (error) {
      translateRepositoryError(error);
    }

    if (!record) fail("INVALID_KEY");

    const fingerprintMatches = verifyActivationKeyFingerprint(
      record.keyHash,
      claims.keyFingerprint,
      security.sessionSecret
    );
    if (!fingerprintMatches) fail("INVALID_KEY");

    assertClaimable(record, userId, currentTime);

    const context = await this.loadAccountContext(userId);
    if (!context || context.user.status !== "ACTIVE") {
      fail("DEDICATED_ACCOUNT_REQUIRED");
    }

    const nonVendorCapabilities = deriveUserRoles(
      context.user,
      context.relations
    ).filter((role) => role !== "VENDOR");
    if (
      nonVendorCapabilities.includes("TENANT") ||
      nonVendorCapabilities.includes("LANDLORD")
    ) {
      fail("DEDICATED_ACCOUNT_REQUIRED");
    }

    let claimed: Awaited<ReturnType<VendorActivationRepository["claim"]>>;
    try {
      claimed = await this.repository.claim({
        activationId: record.id,
        userId,
        now: currentTime
      });
    } catch (error) {
      translateRepositoryError(error);
    }

    return {
      vendor: {
        vendor: claimed.vendor,
        accountStatus: "LINKED",
        role: claimed.link.role
      },
      idempotent: claimed.idempotent,
      nextPath: "/vendor/job/00"
    };
  }

  private requireSecurity(): VendorActivationSecurityConfig {
    if (!this.security) fail("ACTIVATION_UNAVAILABLE");
    return this.security;
  }
}
