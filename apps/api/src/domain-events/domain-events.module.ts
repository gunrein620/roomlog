import {
  Inject,
  Module,
  ServiceUnavailableException,
  type OnModuleDestroy
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { RoomlogDomainEvent } from "@roomlog/types";
import { RealtimeModule } from "../realtime/realtime.module";
import { DomainEventDispatcher } from "./domain-event.dispatcher";
import {
  DOMAIN_EVENT_REPOSITORY,
  type DomainEventConsumer,
  type DomainEventDeliveryRecord,
  type DomainEventRepository
} from "./domain-event.repository";
import { PrismaDomainEventRepository } from "./prisma-domain-event.repository";

class UnavailableDomainEventRepository implements DomainEventRepository {
  async enqueue(
    _tx: Prisma.TransactionClient,
    _input: {
      event: RoomlogDomainEvent;
      consumers: readonly DomainEventConsumer[];
    }
  ): Promise<{ eventId: string }> {
    throw new ServiceUnavailableException(
      "DATABASE_URL이 없어 도메인 이벤트를 저장할 수 없습니다."
    );
  }

  async claimPending(): Promise<DomainEventDeliveryRecord[]> {
    return [];
  }

  async markDelivered(): Promise<boolean> {
    return false;
  }

  async reschedule(): Promise<boolean> {
    return false;
  }
}

export function createDomainEventRepository(
  env: NodeJS.ProcessEnv = process.env
): DomainEventRepository {
  const databaseUrl = env.DATABASE_URL?.trim();
  return databaseUrl
    ? new PrismaDomainEventRepository(databaseUrl)
    : new UnavailableDomainEventRepository();
}

@Module({
  imports: [RealtimeModule],
  providers: [
    {
      provide: DOMAIN_EVENT_REPOSITORY,
      useFactory: () => createDomainEventRepository()
    },
    DomainEventDispatcher
  ],
  exports: [DOMAIN_EVENT_REPOSITORY, DomainEventDispatcher]
})
export class DomainEventsModule implements OnModuleDestroy {
  constructor(
    @Inject(DOMAIN_EVENT_REPOSITORY)
    private readonly repository: DomainEventRepository
  ) {}

  async onModuleDestroy() {
    await this.repository.close?.();
  }
}
