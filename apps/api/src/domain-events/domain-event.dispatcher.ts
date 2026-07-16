import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional
} from "@nestjs/common";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import {
  DOMAIN_EVENT_REPOSITORY,
  type DomainEventOutboxRecord,
  type DomainEventRepository
} from "./domain-event.repository";

const NOTIFICATION_EVENT = "roomlog-domain-event";
const POLL_INTERVAL_MS = 5_000;
const LEASE_MS = 60_000;
const MAX_ERROR_LENGTH = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;

type Clock = () => Date;

export interface DomainEventScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemScheduler: DomainEventScheduler = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
};

function fixedNotificationCopy(
  type: DomainEventOutboxRecord["type"]
): { title: string; message: string } | undefined {
  switch (type) {
    case "VENDOR_JOB_ASSIGNED":
      return { title: "새 수리 작업", message: "새 작업이 배정되었습니다." };
    case "VENDOR_ESTIMATE_SUBMITTED":
      return { title: "견적 도착", message: "업체가 견적을 제출했습니다." };
    case "VENDOR_ESTIMATE_REVISED":
      return { title: "수정 견적 도착", message: "업체가 수정 견적을 제출했습니다." };
    case "VENDOR_ESTIMATE_APPROVED":
      return { title: "견적 승인", message: "제출한 견적이 승인되었습니다." };
    case "VENDOR_ESTIMATE_REVISION_REQUESTED":
      return { title: "견적 수정 요청", message: "관리자가 견적 수정을 요청했습니다." };
    case "VENDOR_ESTIMATE_REJECTED":
      return { title: "견적 반려", message: "제출한 견적이 반려되었습니다." };
    case "VENDOR_COMPLETION_SUBMITTED":
      return { title: "완료 보고 도착", message: "업체가 수리 완료 보고를 제출했습니다." };
    case "VENDOR_PAYMENT_REQUEST_CREATED":
      return { title: "결제 요청 생성", message: "완료 보고에 대한 결제 요청이 생성되었습니다." };
    case "VENDOR_COMPLETION_APPROVED":
      return { title: "완료 보고 승인", message: "수리 완료 보고가 승인되었습니다." };
    case "VENDOR_COMPLETION_REJECTED":
      return { title: "완료 보고 보완 요청", message: "완료 보고가 반려되었습니다. 보완 내용을 확인해 주세요." };
    case "MANAGER_CREDIT_TOPUP_SUCCEEDED":
      return {
        title: "크레딧 충전 완료",
        message: "크레딧 충전이 완료되었습니다."
      };
    case "MANAGER_CREDIT_TOPUP_FAILED":
      return {
        title: "크레딧 충전 실패",
        message: "크레딧 충전을 완료하지 못했습니다."
      };
    case "VENDOR_PAYMENT_PENDING_APPROVAL":
      return {
        title: "지급 요청 접수",
        message: "관리자 확인 후 지급될 예정입니다."
      };
    case "VENDOR_PAYMENT_INSUFFICIENT_CREDIT":
      return {
        title: "지급 처리 확인 중",
        message: "관리자가 결제수단을 확인하고 있습니다."
      };
    case "VENDOR_PAYMENT_PAID":
      return {
        title: "업체 결제 완료",
        message: "업체 결제가 완료되었습니다."
      };
    case "VENDOR_PAYMENT_REVERSED":
      return {
        title: "업체 지급 취소",
        message: "업체 지급 처리가 취소되었습니다."
      };
    case "VENDOR_PAYMENT_CANCELLED":
      return {
        title: "지급 요청 취소",
        message: "업체 지급 요청이 취소되었습니다."
      };
    case "VENDOR_DIRECT_PAYMENT_VOIDED":
      return {
        title: "업체 지급 취소",
        message: "업체 지급 처리가 취소되었습니다."
      };
    default:
      return undefined;
  }
}

function publicEvent(event: DomainEventOutboxRecord): Record<string, unknown> {
  const notificationCopy = fixedNotificationCopy(event.type);
  return {
    type: event.type,
    ...(event.vendorId === undefined ? {} : { vendorId: event.vendorId }),
    ...(event.repairId === undefined ? {} : { repairId: event.repairId }),
    statusCode: event.statusCode,
    occurredAt: event.occurredAt,
    ...(notificationCopy ?? {})
  };
}

function boundedError(error: unknown): string {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "Unknown domain event delivery error";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function retryDelay(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(18, attemptCount - 1));
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** exponent);
}

@Injectable()
export class DomainEventDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventDispatcher.name);
  private readonly clock: Clock;
  private readonly scheduler: DomainEventScheduler;
  private intervalHandle: unknown;
  private activeDrain: Promise<number> | undefined;

  constructor(
    @Inject(DOMAIN_EVENT_REPOSITORY)
    private readonly repository: DomainEventRepository,
    @Inject(RealtimeGateway)
    private readonly realtime: RealtimeGateway,
    @Optional() clock?: Clock,
    @Optional() scheduler?: DomainEventScheduler
  ) {
    this.clock = clock ?? (() => new Date());
    this.scheduler = scheduler ?? systemScheduler;
  }

  onModuleInit() {
    if (this.intervalHandle !== undefined) return;

    this.runTick();
    this.intervalHandle = this.scheduler.setInterval(
      () => this.runTick(),
      POLL_INTERVAL_MS
    );
    const unref = (this.intervalHandle as { unref?: () => void } | undefined)
      ?.unref;
    unref?.call(this.intervalHandle);
  }

  async onModuleDestroy() {
    if (this.intervalHandle !== undefined) {
      this.scheduler.clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    await this.activeDrain?.catch(() => undefined);
  }

  dispatchPending(limit = 25): Promise<number> {
    if (this.activeDrain) return Promise.resolve(0);

    const drain = this.drain(limit).finally(() => {
      if (this.activeDrain === drain) this.activeDrain = undefined;
    });
    this.activeDrain = drain;
    return drain;
  }

  private runTick() {
    void this.dispatchPending().catch((error: unknown) => {
      this.logger.error(boundedError(error));
    });
  }

  private async drain(limit: number): Promise<number> {
    const now = this.clock();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const deliveries = await this.repository.claimPending(
      "NOTIFICATION",
      limit,
      now,
      leaseUntil
    );

    for (const delivery of deliveries) {
      try {
        const emitted = this.realtime.notifyUsers(
          delivery.event.targetUserIds,
          NOTIFICATION_EVENT,
          publicEvent(delivery.event)
        );
        if (!emitted) {
          throw new Error("Realtime gateway is unavailable.");
        }
        await this.repository.markDelivered(
          delivery.id,
          delivery.lockToken,
          this.clock()
        );
      } catch (error) {
        const retryAt = new Date(
          this.clock().getTime() + retryDelay(delivery.attemptCount)
        );
        try {
          await this.repository.reschedule(
            delivery.id,
            delivery.lockToken,
            retryAt,
            boundedError(error)
          );
        } catch (rescheduleError) {
          this.logger.error(
            boundedError(
              new Error(
                `Delivery ${delivery.id} could not be rescheduled: ${boundedError(rescheduleError)}`
              )
            )
          );
        }
      }
    }

    return deliveries.length;
  }
}
