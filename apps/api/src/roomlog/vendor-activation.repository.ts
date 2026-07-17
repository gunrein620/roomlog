import type {
  VendorAccountLinkRecord,
  VendorAccountView,
  VendorActivationErrorCode,
  VendorActivationStatus,
  VendorCatalogRecord
} from "@roomlog/types";

export interface VendorActivationRepository {
  getByKeyHash(keyHash: string): Promise<VendorActivationRecord | undefined>;
  getById(activationId: string): Promise<VendorActivationRecord | undefined>;
  getActiveAccountLink(userId: string): Promise<VendorAccountLinkRecord | undefined>;
  claim(input: {
    activationId: string;
    userId: string;
    now: Date;
  }): Promise<{
    link: VendorAccountLinkRecord;
    vendor: VendorCatalogRecord;
    idempotent: boolean;
  }>;
  close(): Promise<void>;
}

export interface VendorActivationRecord {
  id: string;
  vendorId: string;
  keyHash: string;
  status: VendorActivationStatus;
  expiresAt: Date;
  claimedByUserId?: string;
  claimedAt?: Date;
  createdAt: Date;
  vendor: VendorCatalogRecord;
}

export interface VendorAccountResolver {
  resolveActiveVendorId(userId: string): Promise<string | undefined>;
  resolveActiveVendorAccount(userId: string): Promise<VendorAccountView | undefined>;
}

export interface VendorActivationSessionClaims {
  activationId: string;
  keyFingerprint: string;
  expiresAt: string;
}

export type VendorActivationRepositoryErrorCode = Extract<
  VendorActivationErrorCode,
  | "INVALID_KEY"
  | "EXPIRED_KEY"
  | "UNAVAILABLE_VENDOR"
  | "ALREADY_CLAIMED"
  | "ACCOUNT_ALREADY_LINKED"
  | "ACTIVATION_UNAVAILABLE"
>;

export class VendorActivationRepositoryError extends Error {
  constructor(
    readonly code: VendorActivationRepositoryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VendorActivationRepositoryError";
  }
}
