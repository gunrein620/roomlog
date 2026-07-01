import { Body, Controller, Get, Post } from "@nestjs/common";
import { FurnitureCatalogService } from "./furniture-catalog.service";

@Controller("furniture-catalog")
export class FurnitureCatalogController {
  constructor(private readonly furnitureCatalogService: FurnitureCatalogService) {}

  @Get()
  listCatalogItems() {
    return this.furnitureCatalogService.listCatalogItems();
  }

  @Post("sync/dummyjson")
  syncDummyJson(@Body() body: { limit?: number } = {}) {
    return this.furnitureCatalogService.syncFromDummyJson({
      limit: body.limit
    });
  }
}
