import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { TradeController } from "./trade.controller";
import { TradeService } from "./trade.service";

@Module({
  imports: [RoomlogModule, RealtimeModule],
  controllers: [TradeController],
  providers: [TradeService]
})
export class TradeModule {}
