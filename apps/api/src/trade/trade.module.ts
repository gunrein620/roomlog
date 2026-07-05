import { Module } from "@nestjs/common";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { TradeController } from "./trade.controller";
import { TradeService } from "./trade.service";

@Module({
  imports: [RoomlogModule],
  controllers: [TradeController],
  providers: [TradeService]
})
export class TradeModule {}
