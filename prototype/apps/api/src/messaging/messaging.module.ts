import { Module } from "@nestjs/common";
import { MessagingController } from "./messaging.controller";
import {
  InMemoryMessagingRepository,
  MessagingRepository,
} from "./messaging.repository";
import { MessagingService } from "./messaging.service";

@Module({
  controllers: [MessagingController],
  providers: [
    MessagingService,
    {
      provide: MessagingRepository,
      useClass: InMemoryMessagingRepository,
    },
  ],
})
export class MessagingModule {}
