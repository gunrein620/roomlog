import { Module } from "@nestjs/common";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { TradeModule } from "../trade/trade.module";
import { SplatAssetController } from "./splat-asset.controller";
import { SplatAssetService } from "./splat-asset.service";

@Module({
  imports: [RoomlogModule, TradeModule],
  controllers: [SplatAssetController],
  providers: [SplatAssetService],
  exports: [SplatAssetService]
})
export class SplatAssetModule {}
