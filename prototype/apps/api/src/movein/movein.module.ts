import { Module } from "@nestjs/common";
import { MoveinController } from "./movein.controller";
import {
  InMemoryMoveinRepository,
  MoveinRepository,
} from "./movein.repository";
import { MoveinService } from "./movein.service";

@Module({
  controllers: [MoveinController],
  providers: [
    MoveinService,
    {
      provide: MoveinRepository,
      useClass: InMemoryMoveinRepository,
    },
  ],
})
export class MoveinModule {}
