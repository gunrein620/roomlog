export const TENANT_COMPLAINT_DRAFT_REPOSITORY = Symbol("TENANT_COMPLAINT_DRAFT_REPOSITORY");

export type TenantComplaintDraftCategory = "민원" | "하자";

export type TenantComplaintDraftRecord = {
  id: string;
  tenantId: string;
  roomId: string;
  category: TenantComplaintDraftCategory;
  title: string;
  occurredAt: string | null;
  description: string;
  attachmentUrls: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export type SaveTenantComplaintDraftInput = {
  roomId: string;
  category: TenantComplaintDraftCategory;
  title: string;
  occurredAt: string | null;
  description: string;
  attachmentUrls: string[];
};

export interface TenantComplaintDraftRepository {
  findActive(tenantId: string, roomId: string, now: Date): Promise<TenantComplaintDraftRecord | null>;
  upsert(
    input: SaveTenantComplaintDraftInput & { tenantId: string; expiresAt: Date }
  ): Promise<TenantComplaintDraftRecord>;
  delete(tenantId: string, roomId: string): Promise<void>;
  deleteExpired(now: Date): Promise<number>;
  close?(): Promise<void>;
}
