import { Module } from "@nestjs/common";
import { MoveoutController } from "./moveout.controller";
import { InMemoryMoveoutRepository, MoveoutRepository } from "./moveout.repository";
import { MoveoutService } from "./moveout.service";

@Module({
  controllers: [MoveoutController],
  providers: [
    MoveoutService,
    {
      provide: MoveoutRepository,
      useClass: InMemoryMoveoutRepository,
    },
  ],
})
export class MoveoutModule {}
