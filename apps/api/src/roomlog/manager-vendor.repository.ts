import type {
  ManagerVendorDetail,
  ManagerVendorJobLookup,
  ManagerVendorView,
  VendorCatalogSearchFilters,
  VendorCatalogSearchResult
} from "@roomlog/types";

export const MANAGER_VENDOR_REPOSITORY = Symbol("MANAGER_VENDOR_REPOSITORY");

export type ManagerVendorRepositoryErrorCode =
  | "INVALID_MANAGER"
  | "VENDOR_NOT_FOUND"
  | "RELATION_NOT_FOUND";

export class ManagerVendorRepositoryError extends Error {
  constructor(
    readonly code: ManagerVendorRepositoryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ManagerVendorRepositoryError";
  }
}

export interface ManagerVendorRepository {
  searchCatalog(
    managerId: string,
    filters: VendorCatalogSearchFilters
  ): Promise<VendorCatalogSearchResult[]>;
  searchAssignmentCandidates(
    managerId: string,
    ticketId: string,
    query?: string
  ): Promise<VendorCatalogSearchResult[]>;
  list(
    managerId: string,
    filters: VendorCatalogSearchFilters
  ): Promise<ManagerVendorView[]>;
  getDetail(
    managerId: string,
    vendorId: string
  ): Promise<ManagerVendorDetail | null>;
  findJobByTicket(
    managerId: string,
    ticketId: string
  ): Promise<ManagerVendorJobLookup | null>;
  register(managerId: string, vendorId: string): Promise<ManagerVendorView>;
  updateNote(
    managerId: string,
    vendorId: string,
    managerNote: string | null
  ): Promise<ManagerVendorView>;
  archive(managerId: string, vendorId: string): Promise<ManagerVendorView>;
}
