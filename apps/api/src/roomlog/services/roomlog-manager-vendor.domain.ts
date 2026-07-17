import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type {
  ManagerVendorDetail,
  ManagerVendorJobLookup,
  ManagerVendorView,
  VendorCatalogSearchFilters,
  VendorCatalogSearchResult,
  VendorJobPaymentView,
  VendorJobSummary
} from "@roomlog/types";
import {
  ManagerVendorRepositoryError,
  type ManagerVendorRepository
} from "../manager-vendor.repository";

function normalizedFilterValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeFilters(
  filters: VendorCatalogSearchFilters
): VendorCatalogSearchFilters {
  const normalized: VendorCatalogSearchFilters = {};
  const query = normalizedFilterValue(filters.query);
  const trade = normalizedFilterValue(filters.trade);
  const serviceArea = normalizedFilterValue(filters.serviceArea);

  if (query) normalized.query = query;
  if (trade) normalized.trade = trade;
  if (serviceArea) normalized.serviceArea = serviceArea;
  if (filters.verificationStatus !== undefined) {
    normalized.verificationStatus = filters.verificationStatus;
  }
  if (filters.isActive !== undefined) normalized.isActive = filters.isActive;

  return normalized;
}

function translateRepositoryError(error: unknown): never {
  if (error instanceof ManagerVendorRepositoryError) {
    if (error.code === "INVALID_MANAGER") {
      throw new ForbiddenException("업체 관리 권한이 없습니다.");
    }

    throw new NotFoundException("조회 가능한 업체를 찾을 수 없습니다.");
  }

  throw error;
}

function publicJobPayment(
  payment: VendorJobPaymentView
): VendorJobPaymentView {
  return {
    id: payment.id,
    repairId: payment.repairId,
    amount: payment.amount,
    status: payment.status,
    ...(payment.failureReason === undefined
      ? {}
      : { failureReason: payment.failureReason }),
    ...(payment.lastAttemptMode === undefined
      ? {}
      : { lastAttemptMode: payment.lastAttemptMode }),
    createdAt: payment.createdAt,
    ...(payment.processedAt === undefined
      ? {}
      : { processedAt: payment.processedAt })
  };
}

function publicJob(job: VendorJobSummary): VendorJobSummary {
  return {
    repairId: job.repairId,
    ticketId: job.ticketId,
    title: job.title,
    trade: job.trade,
    status: job.status,
    publicLocation: job.publicLocation,
    ...(job.latestEstimate ? { latestEstimate: job.latestEstimate } : {}),
    ...(job.latestCompletion ? { latestCompletion: job.latestCompletion } : {}),
    ...(job.paymentRequest
      ? { paymentRequest: publicJobPayment(job.paymentRequest) }
      : {}),
    updatedAt: job.updatedAt
  };
}

export class RoomlogManagerVendorDomain {
  constructor(private readonly repository: ManagerVendorRepository) {}

  searchCatalog(
    managerId: string,
    filters: VendorCatalogSearchFilters = {}
  ): Promise<VendorCatalogSearchResult[]> {
    return this.execute(() =>
      this.repository.searchCatalog(managerId, normalizeFilters(filters))
    );
  }

  searchAssignmentCandidates(
    managerId: string,
    ticketId: string,
    query?: string
  ): Promise<VendorCatalogSearchResult[]> {
    const normalizedTicketId = ticketId.trim();
    if (!normalizedTicketId) {
      throw new NotFoundException("배정할 하자 접수 건을 찾을 수 없습니다.");
    }
    return this.execute(() =>
      this.repository.searchAssignmentCandidates(
        managerId,
        normalizedTicketId,
        normalizedFilterValue(query)
      )
    );
  }

  list(
    managerId: string,
    filters: VendorCatalogSearchFilters = {}
  ): Promise<ManagerVendorView[]> {
    return this.execute(() =>
      this.repository.list(managerId, normalizeFilters(filters))
    );
  }

  async getDetail(
    managerId: string,
    vendorId: string
  ): Promise<ManagerVendorDetail> {
    const detail = await this.execute(() =>
      this.repository.getDetail(managerId, vendorId)
    );

    if (!detail) {
      throw new NotFoundException("조회 가능한 업체를 찾을 수 없습니다.");
    }

    return {
      ...detail,
      jobs: detail.jobs.map(publicJob)
    };
  }

  async findJobByTicket(
    managerId: string,
    ticketId: string
  ): Promise<ManagerVendorJobLookup | null> {
    const result = await this.execute(() =>
      this.repository.findJobByTicket(managerId, ticketId)
    );
    return result
      ? { ...result, job: publicJob(result.job) }
      : null;
  }

  register(managerId: string, vendorId: string): Promise<ManagerVendorView> {
    return this.execute(() => this.repository.register(managerId, vendorId));
  }

  updateNote(
    managerId: string,
    vendorId: string,
    managerNote: string
  ): Promise<ManagerVendorView> {
    const normalizedNote = managerNote.trim() || null;
    return this.execute(() =>
      this.repository.updateNote(managerId, vendorId, normalizedNote)
    );
  }

  archive(managerId: string, vendorId: string): Promise<ManagerVendorView> {
    return this.execute(() => this.repository.archive(managerId, vendorId));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
