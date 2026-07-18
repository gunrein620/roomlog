import type { TenantVendorConnectionRequestStatus } from "@roomlog/types";
import type {
  ComplaintStatus,
  RepairCostBearer,
  RepairStatus,
  TicketStatus
} from "./roomlog.types";

export const TENANT_VENDOR_CONNECTION_REPOSITORY = Symbol(
  "TENANT_VENDOR_CONNECTION_REPOSITORY"
);

export type TenantVendorConnectionRepositoryErrorCode =
  | "COMPLAINT_NOT_FOUND"
  | "TENANT_RESPONSIBILITY_REQUIRED"
  | "TICKET_NOT_REQUESTABLE"
  | "VENDOR_NOT_ELIGIBLE"
  | "ACTIVE_REPAIR_CONFLICT";

export class TenantVendorConnectionRepositoryError extends Error {
  constructor(
    readonly code: TenantVendorConnectionRepositoryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TenantVendorConnectionRepositoryError";
  }
}

export interface TenantVendorComplaintRecord {
  tenantId: string;
  complaintId: string;
  ticketId: string;
  title: string;
  category: string;
  location: string;
  ticketSummary: string;
}

export interface TenantPartnerVendorCandidateRecord {
  tenantId: string;
  complaintId: string;
  ticketId: string;
  vendorId: string;
  complaintTitle: string;
  category: string;
  location: string;
  ticketSummary: string;
  businessName: string;
  trades: string[];
  serviceAreas: string[];
}

export interface TenantPartnerVendorSearchRecord {
  complaint: TenantVendorComplaintRecord;
  candidates: TenantPartnerVendorCandidateRecord[];
}

export interface CreateTenantVendorConnectionCommand {
  tenantId: string;
  complaintId: string;
  vendorId: string;
  idempotencyKey: string;
  requestNote?: string;
}

export interface TenantVendorWorkflowAuthority {
  tenantId: string;
  complaintId: string;
  ticketId: string;
  complaintStatus: ComplaintStatus;
  complaintUpdatedAt: string;
  ticketStatus: TicketStatus;
  ticketUpdatedAt: string;
  assignedVendorId?: string;
  category: string;
  activeRepair?: {
    id: string;
    vendorId: string;
    status: RepairStatus;
    tenantInitiated: boolean;
    title: string;
    description: string;
    costBearer?: RepairCostBearer;
    completionPhotoUrls: string[];
    createdAt: string;
    updatedAt: string;
  };
}

export interface TenantVendorRequestStoreBridge {
  synchronizeTenantVendorRequest(
    input: TenantVendorWorkflowAuthority
  ): Promise<void>;
}

export interface TenantVendorConnectionRequestRecord {
  id: string;
  tenantId: string;
  complaintId: string;
  ticketId: string;
  vendorId: string;
  status: TenantVendorConnectionRequestStatus;
  requestNote?: string;
  createdAt: string;
  vendor: TenantPartnerVendorCandidateRecord;
}

export interface TenantVendorConnectionRepository {
  search(
    tenantId: string,
    complaintId: string,
    query?: string
  ): Promise<TenantPartnerVendorSearchRecord>;
  findEligibleCandidate(
    tenantId: string,
    complaintId: string,
    vendorId: string
  ): Promise<TenantPartnerVendorCandidateRecord | null>;
  requestVendor(command: CreateTenantVendorConnectionCommand): Promise<{
    request: TenantVendorConnectionRequestRecord;
    idempotent: boolean;
  }>;
  readWorkflowAuthority(
    tenantId: string,
    complaintId: string
  ): Promise<TenantVendorWorkflowAuthority>;
}
