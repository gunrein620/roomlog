import { Module } from "@nestjs/common";
import { RoomlogController } from "./roomlog.controller";
import {
  ROOMLOG_SERVICE_OPTIONS,
  RoomlogService,
  RoomlogServiceOptions
} from "./roomlog.service";
import { PrismaStoreProjector } from "./prisma-store-projector";

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
  controllers: [RoomlogController],
  providers: [
    {
      provide: ROOMLOG_SERVICE_OPTIONS,
      useFactory: async () => createRoomlogServiceOptions()
    },
    RoomlogService
  ]
})
export class RoomlogModule {}
