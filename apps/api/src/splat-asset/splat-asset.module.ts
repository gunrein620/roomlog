import { Module } from "@nestjs/common";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { SplatAssetController } from "./splat-asset.controller";
import { SplatAssetService } from "./splat-asset.service";

@Module({
  imports: [RoomlogModule],
  controllers: [SplatAssetController],
  providers: [SplatAssetService],
  exports: [SplatAssetService]
})
export class SplatAssetModule {}
