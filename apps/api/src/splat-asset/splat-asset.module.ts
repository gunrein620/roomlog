import { Module } from "@nestjs/common";
import { SplatAssetController } from "./splat-asset.controller";
import { SplatAssetService } from "./splat-asset.service";

@Module({
  controllers: [SplatAssetController],
  providers: [SplatAssetService]
})
export class SplatAssetModule {}
