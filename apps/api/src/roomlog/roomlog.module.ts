import { Module } from "@nestjs/common";
import { RoomlogController } from "./roomlog.controller";
import {
  ROOMLOG_SERVICE_OPTIONS,
  RoomlogService,
  RoomlogServiceOptions
} from "./roomlog.service";
import { PrismaStoreProjector } from "./prisma-store-projector";
import { RealtimeModule } from "../realtime/realtime.module";

export async function createRoomlogServiceOptions(
  env: NodeJS.ProcessEnv = process.env
): Promise<RoomlogServiceOptions> {
  const databaseUrl = env.DATABASE_URL?.trim();
  const storeProjector = databaseUrl ? new PrismaStoreProjector(databaseUrl) : undefined;

  return {
    initialStore: await storeProjector?.load?.(),
    storeProjector
  };
}

@Module({
  imports: [RealtimeModule],
  controllers: [RoomlogController],
  providers: [
    {
      provide: ROOMLOG_SERVICE_OPTIONS,
      useFactory: async () => createRoomlogServiceOptions()
    },
    RoomlogService
  ],
  // 거래(trade) 모듈이 같은 토큰 인증을 재사용한다.
  exports: [RoomlogService]
})
export class RoomlogModule {}
