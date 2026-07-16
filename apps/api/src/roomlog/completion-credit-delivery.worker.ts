import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional
} from "@nestjs/common";
import {
  DOMAIN_EVENT_REPOSITORY,
  type DomainEventDeliveryRecord,
  type DomainEventRepository
} from "../domain-events/domain-event.repository";
import {
  VENDOR_COMPLETION_CREDIT_BOUNDARY,
  type VendorCompletionCreditBoundary
} from "./vendor-completion-credit.boundary";

const LEASE_MS = 60_000;
const POLL_MS = 5_000;
const MAX_ERROR_LENGTH = 2_000;

function boundedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function retryAt(now: Date, attemptCount: number) {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 8));
  return new Date(now.getTime() + Math.min(1_000 * 2 ** exponent, 300_000));
}

function requiredEventIds(delivery: DomainEventDeliveryRecord) {
  const { event } = delivery;
  if (event.type !== "VENDOR_COMPLETION_APPROVED") {
    throw new Error("credit delivery must reference an approved completion event");
  }
  const values = {
    managerId: event.managerId,
    paymentRequestId: event.paymentRequestId,
    completionDecisionId: event.completionDecisionId,
    actorUserId: event.actorUserId
  };
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`credit delivery is missing ${name}`);
    }
  }
  if (values.actorUserId !== values.managerId) {
    throw new Error("credit delivery actor does not match manager");
  }
  return values as {
    managerId: string;
    paymentRequestId: string;
    completionDecisionId: string;
    actorUserId: string;
  };
}

@Injectable()
export class CompletionCreditDeliveryWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CompletionCreditDeliveryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private activeDrain?: Promise<number>;

  constructor(
    @Inject(DOMAIN_EVENT_REPOSITORY)
    private readonly events: DomainEventRepository,
    @Inject(VENDOR_COMPLETION_CREDIT_BOUNDARY)
    private readonly boundary: VendorCompletionCreditBoundary,
    @Optional()
    private readonly clock: () => Date = () => new Date()
  ) {}

  onModuleInit() {
    if (this.boundary.availability === "DEFERRED") return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activeDrain?.catch(() => undefined);
  }

  private tick() {
    void this.dispatchPending().catch((error: unknown) => {
      this.logger.error(boundedError(error));
    });
  }

  dispatchPending(limit = 25): Promise<number> {
    if (this.boundary.availability === "DEFERRED") return Promise.resolve(0);
    if (this.activeDrain) return Promise.resolve(0);
    const drain = this.drain(limit).finally(() => {
      if (this.activeDrain === drain) this.activeDrain = undefined;
    });
    this.activeDrain = drain;
    return drain;
  }

  private async drain(limit: number): Promise<number> {
    const now = this.clock();
    const deliveries = await this.events.claimPending(
      "CREDIT_EVALUATION",
      limit,
      now,
      new Date(now.getTime() + LEASE_MS)
    );

    for (const delivery of deliveries) {
      try {
        const input = requiredEventIds(delivery);
        const result = await this.boundary.evaluateAfterCompletion(input);
        if (result.outcome === "DEFERRED") {
          throw new Error("ready credit boundary returned DEFERRED");
        }
        await this.events.markDelivered(
          delivery.id,
          delivery.lockToken,
          this.clock()
        );
      } catch (error) {
        const failedAt = this.clock();
        try {
          await this.events.reschedule(
            delivery.id,
            delivery.lockToken,
            retryAt(failedAt, delivery.attemptCount),
            boundedError(error)
          );
        } catch (rescheduleError) {
          this.logger.error(boundedError(rescheduleError));
        }
      }
    }
    return deliveries.length;
  }
}
