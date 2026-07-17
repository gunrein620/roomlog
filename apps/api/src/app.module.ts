import { Module } from "@nestjs/common";
import { FurnitureCatalogModule } from "./furniture-catalog/furniture-catalog.module";
import { HealthModule } from "./health/health.module";
import { ListingsModule } from "./listings/listings.module";
import { MarketModule } from "./market/market.module";
import { RoomlogModule } from "./roomlog/roomlog.module";
import { SplatAssetModule } from "./splat-asset/splat-asset.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { TradeModule } from "./trade/trade.module";
import { AgentToolsModule } from "./agent-tools/agent-tools.module";

@Module({
  imports: [
    HealthModule,
    RoomlogModule,
    FurnitureCatalogModule,
    MarketModule,
    ListingsModule,
    SplatAssetModule,
    TradeModule,
    RealtimeModule,
    AgentToolsModule
  ]
})
export class AppModule {}
