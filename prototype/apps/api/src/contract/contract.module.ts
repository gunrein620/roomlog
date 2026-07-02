import { Module } from "@nestjs/common";
import { ContractController } from "./contract.controller";
import {
  InMemoryContractRepository,
  ContractRepository,
} from "./contract.repository";
import { ContractService } from "./contract.service";

@Module({
  controllers: [ContractController],
  providers: [
    ContractService,
    {
      provide: ContractRepository,
      useClass: InMemoryContractRepository,
    },
  ],
})
export class ContractModule {}
