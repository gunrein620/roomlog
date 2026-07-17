import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { TradeController } from "./trade.controller";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
import { TradeService, TRADE_SERVICE_OPTIONS, type TradeServiceOptions } from "./trade.service";
import { TradeStoreProjector } from "./trade-store.projector";

/**
 * DATABASE_URL이 있으면 매물(TradeListing)을 RDS로 프로젝션할 프로젝터를 만들고,
 * 부팅 시 DB에서 매물을 미리 로드해 TradeService에 넘긴다(비동기 로드는 여기서 처리).
 * DATABASE_URL이 없으면(로컬 dev/테스트) 프로젝터 없이 JSON 스토어로만 동작한다.
 */
export async function createTradeServiceOptions(
  env: NodeJS.ProcessEnv = process.env
): Promise<TradeServiceOptions> {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return {};

  const storeProjector = new TradeStoreProjector(databaseUrl);
  return {
    storeProjector,
    initialListings: await storeProjector.load()
  };
}

@Module({
  imports: [RoomlogModule, RealtimeModule],
  controllers: [TradeController],
  providers: [
    {
      provide: TRADE_SERVICE_OPTIONS,
      useFactory: async () => createTradeServiceOptions()
    },
    TradeService,
    TradeContractBillingBridge
  ],
  // splat-asset 소유권 게이트가 runtime truth(JSON 스토어)로 소유자를 조회한다 —
  // DB 프로젝션만 보면 프로젝션 지연/실패 시 정당한 임대인이 403을 맞는다(2026-07-16 실측).
  exports: [TradeService]
})
export class TradeModule {}
