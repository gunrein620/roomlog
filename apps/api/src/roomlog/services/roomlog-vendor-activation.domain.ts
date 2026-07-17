import { randomUUID } from "node:crypto";
import type {
  ResceneVendorActivation,
  VendorActivationClaimResult,
  VendorActivationErrorCode,
  VendorActivationErrorResponse,
  VendorActivationIssueInput,
  VendorActivationIssueResult,
  VendorActivationPreview,
  VendorTrade
} from "@roomlog/types";
import type { UserAccount } from "../roomlog.types";
import {
  deriveUserRoles,
  type UserRoleRelations
} from "../roomlog-support";
import {
  RESCENE_ACTIVATION_ID_PREFIX,
  RESCENE_VENDOR_ID_PREFIX,
  VendorActivationRepositoryError,
  type VendorActivationRecord,
  type VendorActivationRepository
} from "../vendor-activation.repository";
import {
  deriveResceneActivationKey,
  hashActivationKey,
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

export class VendorActivationIssueValidationError extends Error {}

const activationLifetimeMs = 15 * 24 * 60 * 60 * 1000;
const vendorTrades = new Set<VendorTrade>(
  [
    "plumbing",
    "electrical",
    "hvac",
    "appliance",
    "locksmith",
    "waterproofing",
    "cleaning",
    "general",
    "other"
  ]
);
const issueFields = [
  "businessName",
  "contactPerson",
  "phone",
  "trades",
  "serviceAreas"
] as const;

function issueInput(input: unknown): VendorActivationIssueInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new VendorActivationIssueValidationError();
  }
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).length !== issueFields.length ||
    issueFields.some((field) => !Object.hasOwn(record, field))
  ) {
    throw new VendorActivationIssueValidationError();
  }
  const text = (field: "businessName" | "contactPerson" | "phone") => {
    const value = record[field];
    if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
      throw new VendorActivationIssueValidationError();
    }
    return value.trim();
  };
  if (
    !Array.isArray(record.trades) ||
    record.trades.length === 0 ||
    record.trades.some((trade) => typeof trade !== "string" || !vendorTrades.has(trade as VendorTrade))
  ) {
    throw new VendorActivationIssueValidationError();
  }
  if (
    !Array.isArray(record.serviceAreas) ||
    record.serviceAreas.length === 0 ||
    record.serviceAreas.some(
      (area) => typeof area !== "string" || !area.trim() || area.trim().length > 120
    )
  ) {
    throw new VendorActivationIssueValidationError();
  }
  return {
    businessName: text("businessName"),
    contactPerson: text("contactPerson"),
    phone: text("phone"),
    trades: [...new Set(record.trades as VendorTrade[])],
    serviceAreas: [...new Set((record.serviceAreas as string[]).map((area) => area.trim()))]
  };
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
  at: Date
) {
  assertAvailableVendor(record);
  if (record.status === "CLAIMED") fail("ALREADY_CLAIMED");
  if (record.status === "REVOKED") fail("INVALID_KEY");
  if (
    record.status === "EXPIRED" ||
    record.expiresAt.getTime() <= at.getTime()
  ) {
    fail("EXPIRED_KEY");
  }
}

export class RoomlogVendorActivationDomain {
  constructor(
    private readonly repository: VendorActivationRepository,
    private readonly security: VendorActivationSecurityConfig | undefined,
    private readonly loadAccountContext: VendorActivationAccountContextLoader,
    private readonly now: () => Date = () => new Date()
  ) {}

  async issue(input: unknown): Promise<VendorActivationIssueResult> {
    const vendor = issueInput(input);
    const currentTime = this.now();
    const security = this.requireSecurity();
    const activationId = `${RESCENE_ACTIVATION_ID_PREFIX}${randomUUID()}`;
    const activationKey = deriveResceneActivationKey(
      activationId,
      security.keyPepper
    );
    let record: VendorActivationRecord;
    try {
      record = await this.repository.issue({
        vendorId: `${RESCENE_VENDOR_ID_PREFIX}${randomUUID()}`,
        activationId,
        keyHash: hashActivationKey(activationKey, security.keyPepper),
        now: currentTime,
        expiresAt: new Date(currentTime.getTime() + activationLifetimeMs),
        vendor
      });
    } catch (error) {
      translateRepositoryError(error);
    }
    return this.publicResceneActivation(record, activationKey);
  }

  async listRescene(): Promise<ResceneVendorActivation[]> {
    const security = this.requireSecurity();
    let records: VendorActivationRecord[];
    try {
      records = await this.repository.listRescene();
    } catch (error) {
      translateRepositoryError(error);
    }
    return records.map((record) => {
      const activationKey = deriveResceneActivationKey(
        record.id,
        security.keyPepper
      );
      if (hashActivationKey(activationKey, security.keyPepper) !== record.keyHash) {
        fail("ACTIVATION_UNAVAILABLE");
      }
      return this.publicResceneActivation(record, activationKey);
    });
  }

  async preview(rawKey: string): Promise<VendorActivationPreview> {
    const record = await this.recordForKey(rawKey);
    const currentTime = this.now();
    assertPreviewable(record, currentTime);
    return {
      vendor: {
        businessName: record.vendor.businessName,
        trades: [...record.vendor.trades],
        serviceAreas: [...record.vendor.serviceAreas],
        verificationStatus: record.vendor.verificationStatus,
        maskedPhone: maskPhone(record.vendor.phone)
      }
    };
  }

  async claim(userId: string, rawKey: string): Promise<VendorActivationClaimResult> {
    const currentTime = this.now();
    const record = await this.recordForKey(rawKey);
    assertClaimable(record, currentTime);

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
      nextPath: "/vendor/job/00"
    };
  }

  private async recordForKey(rawKey: string) {
    let keyHash: string;
    try {
      keyHash = hashActivationKey(rawKey, this.requireSecurity().keyPepper);
    } catch {
      fail("INVALID_KEY");
    }
    try {
      const record = await this.repository.getByKeyHash(keyHash);
      if (!record) fail("INVALID_KEY");
      return record;
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  private publicResceneActivation(
    record: VendorActivationRecord,
    activationKey: string
  ): ResceneVendorActivation {
    return {
      businessName: record.vendor.businessName,
      contactPerson: record.vendor.contactPerson,
      phone: record.vendor.phone,
      trades: record.vendor.trades as VendorTrade[],
      serviceAreas: [...record.vendor.serviceAreas],
      verificationStatus: record.vendor.verificationStatus,
      activationStatus: record.status,
      expiresAt: record.expiresAt.toISOString(),
      activationKey
    };
  }

  private requireSecurity(): VendorActivationSecurityConfig {
    if (!this.security) fail("ACTIVATION_UNAVAILABLE");
    return this.security;
  }
}
