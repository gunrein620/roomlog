import { Module } from "@nestjs/common";
import { VendorMgmtController } from "./vendor-mgmt.controller";
import {
  InMemoryVendorMgmtRepository,
  VendorMgmtRepository,
} from "./vendor-mgmt.repository";
import { VendorMgmtService } from "./vendor-mgmt.service";

@Module({
  controllers: [VendorMgmtController],
  providers: [
    VendorMgmtService,
    {
      provide: VendorMgmtRepository,
      useClass: InMemoryVendorMgmtRepository,
    },
  ],
})
export class VendorMgmtModule {}
