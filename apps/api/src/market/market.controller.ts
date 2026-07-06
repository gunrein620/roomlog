import { Controller, Get, Query } from "@nestjs/common";
import { MarketService, type PropertyType } from "./market.service";
import { REGIONS } from "./lawd-codes";

@Controller("market")
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get("regions")
  listRegions() {
    return REGIONS;
  }

  @Get("transactions")
  getTransactions(
    @Query("lawdCd") lawdCd?: string,
    @Query("propertyType") propertyType?: PropertyType,
    @Query("months") months?: string
  ) {
    return this.marketService.getTransactions({
      lawdCd,
      propertyType,
      months: months ? Number(months) : undefined
    });
  }

  @Get("summary")
  getSummary(
    @Query("lawdCd") lawdCd?: string,
    @Query("propertyType") propertyType?: PropertyType,
    @Query("months") months?: string
  ) {
    return this.marketService.getSummary({
      lawdCd,
      propertyType,
      months: months ? Number(months) : undefined
    });
  }
}
