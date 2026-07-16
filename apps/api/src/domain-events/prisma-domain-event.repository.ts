import { createHash, randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import type { RoomlogDomainEvent } from "@roomlog/types";
import type {
  DomainEventConsumer,
  DomainEventDeliveryRecord,
  DomainEventOutboxRecord,
  DomainEventRepository
} from "./domain-event.repository";

type IdFactory = (prefix: "evt" | "delivery") => string;
type LockTokenFactory = () => string;

interface ClaimCandidate {
  id: string;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function normalizedEvent(event: RoomlogDomainEvent): RoomlogDomainEvent {
  if (!event.eventKey.trim()) throw new TypeError("eventKey is required.");
  if (!event.statusCode.trim()) throw new TypeError("statusCode is required.");

  const occurredAt = new Date(event.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new TypeError("occurredAt must be a valid ISO date.");
  }

  return {
    eventKey: event.eventKey,
    type: event.type,
    targetUserIds: [...new Set(event.targetUserIds)].sort(),
    ...(event.vendorId === undefined ? {} : { vendorId: event.vendorId }),
    ...(event.managerId === undefined ? {} : { managerId: event.managerId }),
    ...(event.repairId === undefined ? {} : { repairId: event.repairId }),
    ...(event.paymentRequestId === undefined
      ? {}
      : { paymentRequestId: event.paymentRequestId }),
    ...(event.completionDecisionId === undefined
      ? {}
      : { completionDecisionId: event.completionDecisionId }),
    ...(event.actorUserId === undefined
      ? {}
      : { actorUserId: event.actorUserId }),
    statusCode: event.statusCode,
    occurredAt: occurredAt.toISOString()
  };
}

function eventHash(event: RoomlogDomainEvent) {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}

function mapEvent(
  row: Prisma.DomainEventOutboxGetPayload<Record<string, never>>
): DomainEventOutboxRecord {
  return {
    id: row.id,
    eventKey: row.eventKey,
    type: row.type,
    targetUserIds: [...row.targetUserIds],
    ...(row.vendorId === null ? {} : { vendorId: row.vendorId }),
    ...(row.managerId === null ? {} : { managerId: row.managerId }),
    ...(row.repairId === null ? {} : { repairId: row.repairId }),
    ...(row.paymentRequestId === null
      ? {}
      : { paymentRequestId: row.paymentRequestId }),
    ...(row.completionDecisionId === null
      ? {}
      : { completionDecisionId: row.completionDecisionId }),
    ...(row.actorUserId === null ? {} : { actorUserId: row.actorUserId }),
    statusCode: row.statusCode,
    occurredAt: row.occurredAt.toISOString()
  };
}

export class PrismaDomainEventRepository implements DomainEventRepository {
  private readonly prisma: PrismaClient;
  private closed = false;

  constructor(
    databaseUrl: string,
    private readonly nextId: IdFactory = (prefix) =>
      `${prefix}-${randomUUID()}`,
    private readonly nextLockToken: LockTokenFactory = () => randomUUID()
  ) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl })
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.prisma.$disconnect();
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    input: {
      event: RoomlogDomainEvent;
      consumers: readonly DomainEventConsumer[];
    }
  ): Promise<{ eventId: string }> {
    const event = normalizedEvent(input.event);
    const payloadHash = eventHash(event);
    const proposedId = this.nextId("evt");

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "DomainEventOutbox" (
        "id", "eventKey", "payloadHash", "type", "targetUserIds",
        "vendorId", "managerId", "repairId", "paymentRequestId",
        "completionDecisionId", "actorUserId", "statusCode", "occurredAt"
      ) VALUES (
        ${proposedId}, ${event.eventKey}, ${payloadHash},
        CAST(${event.type} AS "RoomlogDomainEventType"),
        ${event.targetUserIds}::text[],
        ${event.vendorId ?? null}, ${event.managerId ?? null},
        ${event.repairId ?? null}, ${event.paymentRequestId ?? null},
        ${event.completionDecisionId ?? null}, ${event.actorUserId ?? null},
        ${event.statusCode}, ${new Date(event.occurredAt)}
      )
      ON CONFLICT ("eventKey") DO NOTHING
    `);

    const stored = await tx.domainEventOutbox.findUniqueOrThrow({
      where: { eventKey: event.eventKey }
    });
    if (stored.payloadHash !== payloadHash) {
      throw new ConflictException(
        "동일한 eventKey에 다른 이벤트 payload를 저장할 수 없습니다."
      );
    }

    for (const consumer of [...new Set(input.consumers)]) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DomainEventDelivery" ("id", "eventId", "consumer")
        VALUES (
          ${this.nextId("delivery")}, ${stored.id},
          CAST(${consumer} AS "DomainEventDeliveryConsumer")
        )
        ON CONFLICT ("eventId", "consumer") DO NOTHING
      `);
    }

    return { eventId: stored.id };
  }

  async claimPending(
    consumer: DomainEventConsumer,
    limit: number,
    now: Date,
    leaseUntil: Date
  ): Promise<DomainEventDeliveryRecord[]> {
    if (!Number.isFinite(limit) || limit <= 0) return [];
    if (leaseUntil.getTime() <= now.getTime()) {
      throw new RangeError("leaseUntil must be later than now.");
    }
    const boundedLimit = Math.min(Math.floor(limit), 100);

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<ClaimCandidate[]>(Prisma.sql`
        SELECT "id"
        FROM "DomainEventDelivery"
        WHERE "consumer" = CAST(${consumer} AS "DomainEventDeliveryConsumer")
          AND (
            ("state" = 'PENDING' AND "availableAt" <= ${now})
            OR (
              "state" = 'PROCESSING'
              AND "leaseExpiresAt" IS NOT NULL
              AND "leaseExpiresAt" <= ${now}
            )
          )
        ORDER BY "availableAt" ASC, "id" ASC
        LIMIT ${boundedLimit}
        FOR UPDATE SKIP LOCKED
      `);

      const claimed: DomainEventDeliveryRecord[] = [];
      for (const candidate of candidates) {
        const lockToken = this.nextLockToken();
        const row = await tx.domainEventDelivery.update({
          where: { id: candidate.id },
          data: {
            state: "PROCESSING",
            attemptCount: { increment: 1 },
            lockedAt: now,
            lockToken,
            leaseExpiresAt: leaseUntil
          },
          include: { event: true }
        });
        claimed.push({
          id: row.id,
          lockToken,
          consumer: row.consumer,
          state: "PROCESSING",
          attemptCount: row.attemptCount,
          leaseExpiresAt: leaseUntil.toISOString(),
          event: mapEvent(row.event)
        });
      }
      return claimed;
    });
  }

  async markDelivered(
    deliveryId: string,
    lockToken: string,
    deliveredAt: Date
  ): Promise<boolean> {
    const result = await this.prisma.domainEventDelivery.updateMany({
      where: { id: deliveryId, lockToken, state: "PROCESSING" },
      data: {
        state: "DELIVERED",
        deliveredAt,
        lockedAt: null,
        lockToken: null,
        leaseExpiresAt: null,
        lastError: null
      }
    });
    return result.count === 1;
  }

  async reschedule(
    deliveryId: string,
    lockToken: string,
    availableAt: Date,
    lastError: string
  ): Promise<boolean> {
    const result = await this.prisma.domainEventDelivery.updateMany({
      where: { id: deliveryId, lockToken, state: "PROCESSING" },
      data: {
        state: "PENDING",
        availableAt,
        lockedAt: null,
        lockToken: null,
        leaseExpiresAt: null,
        lastError: lastError.slice(0, 2_000)
      }
    });
    return result.count === 1;
  }
}
