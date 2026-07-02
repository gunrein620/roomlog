import { Module } from "@nestjs/common";
import { PaymentController } from "./payment.controller";
import {
  InMemoryPaymentRepository,
  PaymentRepository,
} from "./payment.repository";
import { PaymentService } from "./payment.service";

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    {
      provide: PaymentRepository,
      useClass: InMemoryPaymentRepository,
    },
  ],
})
export class PaymentModule {}
