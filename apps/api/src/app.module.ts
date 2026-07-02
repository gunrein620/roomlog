import { Module } from "@nestjs/common";
import { FurnitureCatalogModule } from "./furniture-catalog/furniture-catalog.module";
import { HealthModule } from "./health/health.module";
import { ListingsModule } from "./listings/listings.module";
import { MarketModule } from "./market/market.module";
import { RoomlogModule } from "./roomlog/roomlog.module";

@Module({
  imports: [HealthModule, RoomlogModule, FurnitureCatalogModule, MarketModule, ListingsModule]
})
export class AppModule {}
