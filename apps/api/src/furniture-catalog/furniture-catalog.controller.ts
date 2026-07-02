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

  @Post("sync/naver-shopping")
  syncNaverShopping(@Body() body: { display?: number; query?: string; sort?: "sim" | "date" | "asc" | "dsc"; start?: number } = {}) {
    return this.furnitureCatalogService.syncFromNaverShopping({
      display: body.display,
      query: body.query,
      sort: body.sort,
      start: body.start
    });
  }

  @Post("import/csv")
  importCsv(@Body() body: { csv?: string } = {}) {
    return this.furnitureCatalogService.importManualCsv(body.csv ?? "");
  }
}
