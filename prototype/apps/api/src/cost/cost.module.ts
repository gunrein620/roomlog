import { Module } from "@nestjs/common";
import { CostController } from "./cost.controller";
import { CostRepository, InMemoryCostRepository } from "./cost.repository";
import { CostService } from "./cost.service";

@Module({
  controllers: [CostController],
  providers: [
    CostService,
    {
      provide: CostRepository,
      useClass: InMemoryCostRepository,
    },
  ],
})
export class CostModule {}
