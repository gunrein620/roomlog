import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { TicketModule } from "./ticket/ticket.module";
import { ContractModule } from "./contract/contract.module";
import { PaymentModule } from "./payment/payment.module";
import { MessagingModule } from "./messaging/messaging.module";
import { MoveinModule } from "./movein/movein.module";
import { MoveoutModule } from "./moveout/moveout.module";
import { CostModule } from "./cost/cost.module";
import { ReportModule } from "./report/report.module";
import { VendorMgmtModule } from "./vendor-mgmt/vendor-mgmt.module";

// 도메인 모듈은 슬라이스마다 추가된다.
// 등록은 여기 imports 배열에 한 줄씩 — 도메인 팀은 자기 모듈만 추가.
@Module({
  imports: [
    TicketModule,
    ContractModule,
    PaymentModule,
    MessagingModule,
    MoveinModule,
    MoveoutModule,
    CostModule,
    ReportModule,
    VendorMgmtModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
