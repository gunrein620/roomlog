import { Module } from "@nestjs/common";
import { RoomlogController } from "./roomlog.controller";
import {
  ROOMLOG_SERVICE_OPTIONS,
  RoomlogService,
  RoomlogServiceOptions
} from "./roomlog.service";
import { PrismaStoreProjector } from "./prisma-store-projector";

export function createRoomlogServiceOptions(
  env: NodeJS.ProcessEnv = process.env
): RoomlogServiceOptions {
  const databaseUrl = env.DATABASE_URL?.trim();

  return {
    storeProjector: databaseUrl ? new PrismaStoreProjector(databaseUrl) : undefined
  };
}

@Module({
  controllers: [RoomlogController],
  providers: [
    {
      provide: ROOMLOG_SERVICE_OPTIONS,
      useFactory: () => createRoomlogServiceOptions()
    },
    RoomlogService
  ]
})
export class RoomlogModule {}
