import {
  Inject,
  Injectable,
  Module,
  ServiceUnavailableException,
  type OnModuleDestroy
} from "@nestjs/common";
import { DomainEventsModule } from "../domain-events/domain-events.module";
import {
  DOMAIN_EVENT_REPOSITORY,
  type DomainEventRepository
} from "../domain-events/domain-event.repository";
import { TossPaymentsHttpGateway } from "../payment/toss-payment.gateway";
import {
  CREDIT_COMMAND_REPOSITORY,
  type CreditCommandRepository
} from "./credit-command.repository";
import { CreditController } from "./credit.controller";
import { CreditPrismaClient } from "./credit-prisma.client";
import {
  CREDIT_QUERY_REPOSITORY,
  type CreditQueryRepository
} from "./credit-query.repository";
import { PrismaCreditCommandRepository } from "./prisma-credit-command.repository";
import { PrismaCreditQueryRepository } from "./prisma-credit-query.repository";
import { PrismaRepairPaymentOrderRepository } from "./prisma-repair-payment-order.repository";
import { RepairPaymentOrderController } from "./repair-payment-order.controller";
import {
  REPAIR_PAYMENT_ORDER_REPOSITORY,
  type RepairPaymentOrderRepository
} from "./repair-payment-order.repository";
import { RepairPaymentOrderService } from "./repair-payment-order.service";
import {
  CREDIT_SERVICE_OPTIONS,
  CreditService,
  TOSS_PAYMENT_GATEWAY,
  type CreditServiceOptions
} from "./credit.service";

const CREDIT_PERSISTENCE = Symbol("CREDIT_PERSISTENCE");

type CreditPersistence = Readonly<{
  database?: CreditPrismaClient;
}>;

function creditUnavailable(): never {
  throw new ServiceUnavailableException(
    "DATABASE_URL이 없어 크레딧·결제 정보를 처리할 수 없습니다."
  );
}

const unavailable = async (..._args: unknown[]): Promise<never> =>
  creditUnavailable();

function unavailableCommandRepository(): CreditCommandRepository {
  return {
    ensureAccount: unavailable,
    createTopupOrder: unavailable,
    createGaraVendorPayout: unavailable,
    claimTopupConfirmation: unavailable,
    finalizeTopup: unavailable,
    markTopupRejected: unavailable,
    markTopupUncertain: unavailable,
    cancelReadyTopup: unavailable,
    saveAutoPayPolicy: unavailable,
    evaluateAfterCompletion: unavailable,
    settlePaymentRequest: unavailable,
    reverseCreditPayment: unavailable,
    voidDirectPayment: unavailable,
    cancelPaymentRequest: unavailable
  };
}

function unavailableQueryRepository(): CreditQueryRepository {
  return {
    assertManagerAccess: unavailable,
    getAccount: unavailable,
    getWorkspace: unavailable,
    getTopupOrder: unavailable,
    listPublicGaraVendors: unavailable,
    getGaraTopupOrder: unavailable
  };
}

function unavailableRepairPaymentOrderRepository(): RepairPaymentOrderRepository {
  return {
    assertTenantAccess: unavailable,
    createOrder: unavailable,
    getOrder: unavailable,
    claimConfirmation: unavailable,
    finalizeOrder: unavailable,
    markRejected: unavailable,
    markUncertain: unavailable,
    cancelOrder: unavailable,
    retryOrder: unavailable
  };
}

function createCreditServiceOptions(
  env: NodeJS.ProcessEnv = process.env
): CreditServiceOptions {
  return {
    clientKey:
      env.TOSS_CLIENT_KEY?.trim() ||
      env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ||
      "test_ck_roomlog_credit",
    tokenSecret: env.JWT_SECRET?.trim() || "roomlog-local-dev-secret"
  };
}

export function createCreditPersistence(
  env: NodeJS.ProcessEnv = process.env
): CreditPersistence {
  const databaseUrl = env.DATABASE_URL?.trim();
  return databaseUrl
    ? { database: new CreditPrismaClient(databaseUrl) }
    : {};
}

function createCreditCommandRepository(
  persistence: CreditPersistence,
  events: DomainEventRepository
): CreditCommandRepository {
  return persistence.database
    ? new PrismaCreditCommandRepository(persistence.database, events)
    : unavailableCommandRepository();
}

function createCreditQueryRepository(
  persistence: CreditPersistence
): CreditQueryRepository {
  return persistence.database
    ? new PrismaCreditQueryRepository(persistence.database)
    : unavailableQueryRepository();
}

function createRepairPaymentOrderRepository(
  persistence: CreditPersistence,
  events: DomainEventRepository
): RepairPaymentOrderRepository {
  return persistence.database
    ? new PrismaRepairPaymentOrderRepository(persistence.database, events)
    : unavailableRepairPaymentOrderRepository();
}

@Injectable()
class CreditPersistenceLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(CREDIT_PERSISTENCE)
    private readonly persistence: CreditPersistence
  ) {}

  async onModuleDestroy() {
    await this.persistence.database?.close();
  }
}

@Module({
  imports: [DomainEventsModule],
  controllers: [CreditController, RepairPaymentOrderController],
  providers: [
    {
      provide: CREDIT_PERSISTENCE,
      useFactory: () => createCreditPersistence()
    },
    {
      provide: CREDIT_COMMAND_REPOSITORY,
      inject: [CREDIT_PERSISTENCE, DOMAIN_EVENT_REPOSITORY],
      useFactory: (
        persistence: CreditPersistence,
        events: DomainEventRepository
      ) => createCreditCommandRepository(persistence, events)
    },
    {
      provide: CREDIT_QUERY_REPOSITORY,
      inject: [CREDIT_PERSISTENCE],
      useFactory: (persistence: CreditPersistence) =>
        createCreditQueryRepository(persistence)
    },
    {
      provide: REPAIR_PAYMENT_ORDER_REPOSITORY,
      inject: [CREDIT_PERSISTENCE, DOMAIN_EVENT_REPOSITORY],
      useFactory: (
        persistence: CreditPersistence,
        events: DomainEventRepository
      ) => createRepairPaymentOrderRepository(persistence, events)
    },
    {
      provide: TOSS_PAYMENT_GATEWAY,
      useFactory: () => new TossPaymentsHttpGateway()
    },
    {
      provide: CREDIT_SERVICE_OPTIONS,
      useFactory: () => createCreditServiceOptions()
    },
    CreditService,
    RepairPaymentOrderService,
    CreditPersistenceLifecycle
  ],
  exports: [CreditService, RepairPaymentOrderService]
})
export class CreditModule {}
