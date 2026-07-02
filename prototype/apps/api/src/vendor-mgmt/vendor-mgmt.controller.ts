import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  VendorJobRecord,
  VendorPerf,
  VendorPerfEvent,
  VendorProfile,
  VendorStatus,
  VendorTrade,
} from "@roomlog/types";
import { VendorMgmtService } from "./vendor-mgmt.service";

interface VendorCreateRequestDto {
  name?: string;
  trades?: VendorTrade[];
  status?: VendorStatus;
  phone?: string;
  contactPerson?: string;
  address?: string;
  memo?: string;
}

interface VendorUpdateRequestDto {
  name?: string;
  trades?: VendorTrade[];
  status?: VendorStatus;
  phone?: string;
  contactPerson?: string;
  address?: string;
  memo?: string;
}

@Controller("vendors")
export class VendorMgmtController {
  constructor(private readonly vendorMgmtService: VendorMgmtService) {}

  @Get()
  listVendors(
    @Query("q") q?: string,
    @Query("trade") trade?: string,
    @Query("sort") sort?: string,
  ): VendorProfile[] {
    return this.vendorMgmtService.listVendors({
      q,
      trade: trade ? this.vendorMgmtService.parseTrade(trade) : undefined,
      sort: sort ? this.vendorMgmtService.parseSort(sort) : undefined,
    });
  }

  @Get(":id")
  getVendor(@Param("id") id: string): VendorProfile {
    return this.vendorMgmtService.getVendor(id);
  }

  @Get(":id/jobs")
  listVendorJobs(@Param("id") id: string): VendorJobRecord[] {
    return this.vendorMgmtService.listVendorJobs(id);
  }

  @Get(":id/perf")
  getVendorPerf(@Param("id") id: string): VendorPerf {
    return this.vendorMgmtService.getVendorPerf(id);
  }

  @Get(":id/events")
  listVendorPerfEvents(@Param("id") id: string): VendorPerfEvent[] {
    return this.vendorMgmtService.listVendorPerfEvents(id);
  }

  @Post()
  createVendor(@Body() dto: VendorCreateRequestDto): VendorProfile {
    return this.vendorMgmtService.createVendor({
      name: dto.name ?? "",
      trades: dto.trades ?? [],
      status: dto.status,
      phone: dto.phone,
      contactPerson: dto.contactPerson,
      address: dto.address,
      memo: dto.memo,
    });
  }

  @Patch(":id")
  updateVendor(@Param("id") id: string, @Body() dto: VendorUpdateRequestDto): VendorProfile {
    return this.vendorMgmtService.updateVendor(id, {
      name: dto.name,
      trades: dto.trades,
      status: dto.status,
      phone: dto.phone,
      contactPerson: dto.contactPerson,
      address: dto.address,
      memo: dto.memo,
    });
  }
}
