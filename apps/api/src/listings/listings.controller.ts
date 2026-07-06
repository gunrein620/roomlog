import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { PropertyKind, TradeType } from "./listings.data";
import { ListingsService } from "./listings.service";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  list(
    @Query("kind") kind?: PropertyKind,
    @Query("tradeType") tradeType?: TradeType,
    @Query("lawdCd") lawdCd?: string,
    @Query("petsAllowed") petsAllowed?: string,
    @Query("ownerId") ownerId?: string,
    @Query("ownerEmail") ownerEmail?: string
  ) {
    return this.listingsService.list({ kind, tradeType, lawdCd, petsAllowed, ownerId, ownerEmail });
  }

  @Get("me")
  mine(@Query("ownerId") ownerId?: string, @Query("ownerEmail") ownerEmail?: string) {
    return this.listingsService.mine({ ownerId, ownerEmail });
  }

  @Post()
  create(@Body() payload: Record<string, unknown>) {
    return this.listingsService.create(payload);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() payload: Record<string, unknown>) {
    return this.listingsService.update(id, payload);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.listingsService.detail(id);
  }
}
