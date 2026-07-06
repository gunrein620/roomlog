import { Module } from "@nestjs/common";
import { FurnitureCatalogModule } from "./furniture-catalog/furniture-catalog.module";
import { HealthModule } from "./health/health.module";
import { ListingsModule } from "./listings/listings.module";
import { MarketModule } from "./market/market.module";
import { RoomlogModule } from "./roomlog/roomlog.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { TradeModule } from "./trade/trade.module";

@Module({
  imports: [HealthModule, RoomlogModule, FurnitureCatalogModule, MarketModule, ListingsModule, TradeModule, RealtimeModule]
})
export class AppModule {}
