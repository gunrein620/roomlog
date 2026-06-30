import { Module } from "@nestjs/common";
import { RoomlogController } from "./roomlog.controller";
import { RoomlogService } from "./roomlog.service";

@Module({
  controllers: [RoomlogController],
  providers: [RoomlogService]
})
export class RoomlogModule {}
