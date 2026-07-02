import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  VendorDuplicateCandidate,
  VendorJobRecord,
  VendorPerf,
  VendorPerfEvent,
  VendorProfile,
  VendorStatus,
  VendorTrade,
} from "@roomlog/types";
import type {
  VendorCreateDto,
  VendorListOptions,
  VendorUpdateDto,
} from "./vendor-mgmt.repository";
import { VendorMgmtRepository } from "./vendor-mgmt.repository";

const VENDOR_TRADES: VendorTrade[] = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "locksmith",
  "waterproofing",
  "cleaning",
  "general",
  "other",
];
const VENDOR_STATUSES: VendorStatus[] = ["active", "inactive", "closed"];

@Injectable()
export class VendorMgmtService {
  constructor(private readonly repository: VendorMgmtRepository) {}

  listVendors(options?: VendorListOptions): VendorProfile[] {
    return this.repository.listVendors(options);
  }

  getVendor(id: string): VendorProfile {
    const vendor = this.repository.getVendor(id);
    if (!vendor) {
      throw new NotFoundException(`Vendor not found: ${id}`);
    }

    return vendor;
  }

  listVendorJobs(vendorId: string): VendorJobRecord[] {
    this.getVendor(vendorId);
    return this.repository.listVendorJobs(vendorId);
  }

  getVendorPerf(vendorId: string): VendorPerf {
    this.getVendor(vendorId);
    const perf = this.repository.getVendorPerf(vendorId);
    if (!perf) {
      throw new NotFoundException(`Vendor perf not found: ${vendorId}`);
    }

    return perf;
  }

  listVendorPerfEvents(vendorId: string): VendorPerfEvent[] {
    this.getVendor(vendorId);
    return this.repository.listVendorPerfEvents(vendorId);
  }

  listDuplicateCandidates(vendorId: string): VendorDuplicateCandidate[] {
    this.getVendor(vendorId);
    return this.repository.listDuplicateCandidates(vendorId);
  }

  createVendor(dto: VendorCreateDto): VendorProfile {
    this.validateCreateVendor(dto);
    return this.repository.createVendor(this.normalizeCreateVendor(dto));
  }

  updateVendor(id: string, dto: VendorUpdateDto): VendorProfile {
    this.validateUpdateVendor(dto);
    const updatedVendor = this.repository.updateVendor(id, this.normalizeUpdateVendor(dto));
    if (!updatedVendor) {
      throw new NotFoundException(`Vendor not found: ${id}`);
    }

    return updatedVendor;
  }

  parseTrade(value: string): VendorTrade {
    if (VENDOR_TRADES.includes(value as VendorTrade)) {
      return value as VendorTrade;
    }

    throw new BadRequestException(`Invalid vendor trade: ${value}`);
  }

  parseSort(value: string): VendorListOptions["sort"] {
    if (value === "recent" || value === "trade") {
      return value;
    }

    throw new BadRequestException(`Invalid vendor sort: ${value}`);
  }

  parseStatus(value: string): VendorStatus {
    if (VENDOR_STATUSES.includes(value as VendorStatus)) {
      return value as VendorStatus;
    }

    throw new BadRequestException(`Invalid vendor status: ${value}`);
  }

  private validateCreateVendor(dto: VendorCreateDto): void {
    if (!dto.name?.trim()) {
      throw new BadRequestException("name is required.");
    }
    if (!Array.isArray(dto.trades) || dto.trades.length === 0) {
      throw new BadRequestException("trades is required.");
    }

    this.validateTrades(dto.trades);
    if (dto.status) {
      this.parseStatus(dto.status);
    }
  }

  private validateUpdateVendor(dto: VendorUpdateDto): void {
    if (
      dto.name === undefined &&
      dto.trades === undefined &&
      dto.status === undefined &&
      dto.phone === undefined &&
      dto.contactPerson === undefined &&
      dto.address === undefined &&
      dto.memo === undefined
    ) {
      throw new BadRequestException("vendor update body is required.");
    }
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException("name must not be blank.");
    }
    if (dto.trades !== undefined) {
      if (!Array.isArray(dto.trades) || dto.trades.length === 0) {
        throw new BadRequestException("trades must include at least one trade.");
      }
      this.validateTrades(dto.trades);
    }
    if (dto.status) {
      this.parseStatus(dto.status);
    }
  }

  private validateTrades(trades: VendorTrade[]): void {
    for (const trade of trades) {
      this.parseTrade(trade);
    }
  }

  private normalizeCreateVendor(dto: VendorCreateDto): VendorCreateDto {
    return {
      name: dto.name.trim(),
      trades: dto.trades,
      status: dto.status,
      phone: this.normalizeOptionalText(dto.phone),
      contactPerson: this.normalizeOptionalText(dto.contactPerson),
      address: this.normalizeOptionalText(dto.address),
      memo: this.normalizeOptionalText(dto.memo),
    };
  }

  private normalizeUpdateVendor(dto: VendorUpdateDto): VendorUpdateDto {
    return {
      name: dto.name?.trim(),
      trades: dto.trades,
      status: dto.status,
      phone: this.normalizeOptionalText(dto.phone),
      contactPerson: this.normalizeOptionalText(dto.contactPerson),
      address: this.normalizeOptionalText(dto.address),
      memo: this.normalizeOptionalText(dto.memo),
    };
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }
}
