import type { Prisma } from "@prisma/client";
import type { RoomlogDomainEvent } from "@roomlog/types";

export const DOMAIN_EVENT_REPOSITORY = Symbol("DOMAIN_EVENT_REPOSITORY");

export interface DomainEventOutboxRecord extends RoomlogDomainEvent {
  id: string;
  completionDecisionId?: string;
  actorUserId?: string;
}

export type DomainEventConsumer = "NOTIFICATION" | "CREDIT_EVALUATION";

export interface DomainEventDeliveryRecord {
  id: string;
  lockToken: string;
  consumer: DomainEventConsumer;
  state: "PROCESSING";
  attemptCount: number;
  leaseExpiresAt: string;
  event: DomainEventOutboxRecord;
}

export interface DomainEventRepository {
  enqueue(
    tx: Prisma.TransactionClient,
    input: {
      event: RoomlogDomainEvent;
      consumers: readonly DomainEventConsumer[];
    }
  ): Promise<{ eventId: string }>;
  claimPending(
    consumer: DomainEventConsumer,
    limit: number,
    now: Date,
    leaseUntil: Date
  ): Promise<DomainEventDeliveryRecord[]>;
  markDelivered(
    deliveryId: string,
    lockToken: string,
    deliveredAt: Date
  ): Promise<boolean>;
  reschedule(
    deliveryId: string,
    lockToken: string,
    availableAt: Date,
    lastError: string
  ): Promise<boolean>;
  close?(): Promise<void>;
}
