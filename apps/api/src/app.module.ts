import { Module } from "@nestjs/common";
import { FurnitureCatalogModule } from "./furniture-catalog/furniture-catalog.module";
import { HealthModule } from "./health/health.module";
import { RoomlogModule } from "./roomlog/roomlog.module";
import { SplatAssetModule } from "./splat-asset/splat-asset.module";

@Module({
  imports: [HealthModule, RoomlogModule, FurnitureCatalogModule, SplatAssetModule]
})
export class AppModule {}
