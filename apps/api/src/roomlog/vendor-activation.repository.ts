import type {
  VendorAccountLinkRecord,
  VendorAccountView,
  VendorActivationErrorCode,
  VendorActivationStatus,
  VendorCatalogRecord,
  VendorTrade
} from "@roomlog/types";

export const RESCENE_ACTIVATION_ID_PREFIX = "rescene-activation-";
export const RESCENE_VENDOR_ID_PREFIX = "rescene-vendor-";

export interface ResceneVendorActivationIssuePersistenceInput {
  vendorId: string;
  activationId: string;
  keyHash: string;
  now: Date;
  expiresAt: Date;
  vendor: {
    businessName: string;
    contactPerson: string;
    phone: string;
    trades: VendorTrade[];
    serviceAreas: string[];
  };
}

export interface VendorActivationRepository {
  getByKeyHash(keyHash: string): Promise<VendorActivationRecord | undefined>;
  listRescene(): Promise<VendorActivationRecord[]>;
  issue(
    input: ResceneVendorActivationIssuePersistenceInput
  ): Promise<VendorActivationRecord>;
  getActiveAccountLink(userId: string): Promise<VendorAccountLinkRecord | undefined>;
  claim(input: {
    activationId: string;
    userId: string;
    now: Date;
  }): Promise<{
    link: VendorAccountLinkRecord;
    vendor: VendorCatalogRecord;
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
