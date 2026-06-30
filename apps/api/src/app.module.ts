import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { RoomlogModule } from "./roomlog/roomlog.module";

@Module({
  imports: [HealthModule, RoomlogModule]
})
export class AppModule {}
