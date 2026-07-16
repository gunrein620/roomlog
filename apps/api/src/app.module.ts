import { Module } from "@nestjs/common";
import { FurnitureCatalogModule } from "./furniture-catalog/furniture-catalog.module";
import { HealthModule } from "./health/health.module";
import { ListingsModule } from "./listings/listings.module";
import { MarketModule } from "./market/market.module";
import { MapSearchModule } from "./map/map-search.module";
import { RoomlogModule } from "./roomlog/roomlog.module";
import { SplatAssetModule } from "./splat-asset/splat-asset.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ReconstructionModule } from "./reconstruction/reconstruction.module";
import { TradeModule } from "./trade/trade.module";

@Module({
  imports: [
    HealthModule,
    RoomlogModule,
    FurnitureCatalogModule,
    MarketModule,
    MapSearchModule,
    ListingsModule,
    SplatAssetModule,
    TradeModule,
    RealtimeModule,
    ReconstructionModule
  ]
})
export class AppModule {}
