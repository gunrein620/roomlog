import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { LISTINGS, findListing, type PropertyKind, type TradeType } from "./listings.data";

@Controller("listings")
export class ListingsController {
  @Get()
  list(
    @Query("kind") kind?: PropertyKind,
    @Query("tradeType") tradeType?: TradeType,
    @Query("lawdCd") lawdCd?: string,
    @Query("petsAllowed") petsAllowed?: string
  ) {
    return LISTINGS.filter((listing) => {
      if (kind && listing.kind !== kind) {
        return false;
      }
      if (tradeType && listing.tradeType !== tradeType) {
        return false;
      }
      if (lawdCd && listing.lawdCd !== lawdCd) {
        return false;
      }
      if (petsAllowed === "true" && !listing.petsAllowed) {
        return false;
      }
      return true;
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const listing = findListing(id);
    if (!listing) {
      throw new NotFoundException(`Listing ${id} not found`);
    }
    return listing;
  }
}
