import { Module } from "@nestjs/common";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { TenantFurnitureController } from "./tenant-furniture.controller";
import { TenantFurnitureService } from "./tenant-furniture.service";

@Module({
  imports: [RoomlogModule],
  controllers: [TenantFurnitureController],
  providers: [TenantFurnitureService],
  exports: [TenantFurnitureService]
})
export class TenantFurnitureModule {}
