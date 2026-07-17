import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  type RepairPaymentOrder,
  type VendorPaymentRequestStatus
} from "@prisma/client";
import type { RepairPaymentOrderView } from "@roomlog/types";
import type { DomainEventRepository } from "../domain-events/domain-event.repository";
import type { TossPaymentSnapshot } from "../payment/toss-payment.gateway";
import { CreditPrismaClient } from "./credit-prisma.client";
import type {
  CancelRepairPaymentOrderCommand,
  ClaimRepairPaymentConfirmationCommand,
  CreateRepairPaymentOrderCommand,
  ExplainRepairPaymentOrderCommand,
  FinalizeRepairPaymentOrderCommand,
  RepairPaymentActor,
  RepairPaymentConfirmationClaim,
  RetryRepairPaymentOrderCommand,
  RepairPaymentOrderRepository
} from "./repair-payment-order.repository";
import {
  requireRepairPaymentCreationKey,
  requireRepairPaymentKey,
  requireRepairPaymentOrderId,
  requireRepairPaymentReturnPath
} from "./repair-payment-order.validation";

const MAX_CREATE_ATTEMPTS = 3;
const MAX_REASON_LENGTH = 500;
const PAYABLE_REQUEST_STATUSES = new Set<VendorPaymentRequestStatus>([
  "PENDING_APPROVAL",
  "INSUFFICIENT_CREDIT"
]);

type LockedPaymentAuthority = {
  id: string;
  payerRole: "MANAGER" | "TENANT";
  payerUserId: string;
  managerId: string;
  amount: number;
  status: VendorPaymentRequestStatus;
  lastAttemptMode: "AUTO_CREDIT" | "MANUAL_CREDIT" | "DIRECT" | "TOSS" | null;
  ticketTenantId: string;
  roomId: string;
  landlordId: string | null;
  payerAccountRole: "SEEKER" | "TENANT" | "LANDLORD" | "VENDOR";
  payerAccountStatus: "ACTIVE" | "INVITED" | "DISABLED";
  tenantRoomLinked: boolean;
};

function canPrepareTossPayment(authority: Pick<
  LockedPaymentAuthority,
  "payerRole" | "status" | "lastAttemptMode"
>) {
  return PAYABLE_REQUEST_STATUSES.has(authority.status) &&
    !(authority.payerRole === "TENANT" && authority.lastAttemptMode === "DIRECT");
}

type NormalizedActor = Readonly<{
  payerRole: "MANAGER" | "TENANT";
  payerUserId: string;
  initiatedBy: "USER_UI" | "AI_AGENT" | "SYSTEM_POLICY";
  confirmationId?: string;
  toolCallId?: string;
}>;

type NormalizedCreateCommand = Readonly<{
  paymentRequestId: string;
  creationKey: string;
  returnPath: string;
}>;

type FinalizationPaymentRequest = Prisma.VendorPaymentRequestGetPayload<{
  include: {
    repair: { include: { ticket: { include: { room: true } } } };
    completionReport: true;
  };
}>;

function requireNonblank(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${field} 값이 필요합니다.`);
  }
  return normalized;
}

function optionalNonblank(value: string | undefined, field: string) {
  if (value === undefined) return undefined;
  return requireNonblank(value, field);
}

function invalidReturnPath(): never {
  throw new BadRequestException("복귀 경로는 서비스 내부 경로여야 합니다.");
}

function returnPathname(value: string) {
  const delimiterIndex = value.search(/[?#]/);
  return delimiterIndex === -1 ? value : value.slice(0, delimiterIndex);
}

function assertInternalReturnPath(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    invalidReturnPath();
  }
}

function assertSafeReturnPathEncoding(value: string) {
  try {
    decodeURIComponent(value);
  } catch {
    invalidReturnPath();
  }

  let pathname = returnPathname(value);
  for (let depth = 0; depth < 8; depth += 1) {
    if (/%(?:25)*(?:2f|5c|2e)/i.test(pathname)) {
      invalidReturnPath();
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      invalidReturnPath();
    }
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      invalidReturnPath();
    }
    if (decoded === pathname) return;
    pathname = decoded;
  }

  invalidReturnPath();
}

function normalizeActor(actor: RepairPaymentActor): NormalizedActor {
  if (actor.payerRole !== "MANAGER" && actor.payerRole !== "TENANT") {
    throw new ForbiddenException("수리비 결제 권한이 없습니다.");
  }
  if (
    actor.initiatedBy !== "USER_UI" &&
    actor.initiatedBy !== "AI_AGENT" &&
    actor.initiatedBy !== "SYSTEM_POLICY"
  ) {
    throw new BadRequestException("지원하지 않는 결제 요청 출처입니다.");
  }
  const confirmationId = optionalNonblank(
    actor.confirmationId,
    "confirmationId"
  );
  const toolCallId = optionalNonblank(actor.toolCallId, "toolCallId");
  return {
    payerRole: actor.payerRole,
    payerUserId: requireNonblank(actor.payerUserId, "payerUserId"),
    initiatedBy: actor.initiatedBy,
    ...(confirmationId === undefined ? {} : { confirmationId }),
    ...(toolCallId === undefined ? {} : { toolCallId })
  };
}

function normalizeReturnPath(value: string) {
  const raw = requireRepairPaymentReturnPath(value);
  assertInternalReturnPath(raw);
  assertSafeReturnPathEncoding(raw);

  const base = new URL("https://roomlog.local");
  let parsed: URL;
  try {
    parsed = new URL(raw, base);
  } catch {
    invalidReturnPath();
  }
  if (parsed.origin !== base.origin) {
    invalidReturnPath();
  }
  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  assertInternalReturnPath(normalized);
  assertSafeReturnPathEncoding(normalized);
  return requireRepairPaymentReturnPath(normalized);
}

function normalizeCreateCommand(
  input: CreateRepairPaymentOrderCommand
): NormalizedCreateCommand {
  return {
    paymentRequestId: requireNonblank(
      input.paymentRequestId,
      "paymentRequestId"
    ),
    creationKey: requireRepairPaymentCreationKey(input.creationKey),
    returnPath: normalizeReturnPath(input.returnPath)
  };
}

function normalizeOrderId(orderId: string) {
  return requireRepairPaymentOrderId(orderId);
}

function normalizePaymentKey(paymentKey: string) {
  return requireRepairPaymentKey(paymentKey);
}

function boundedReason(reason: string) {
  return requireNonblank(reason, "reason").slice(0, MAX_REASON_LENGTH);
}

function requireSafePositiveAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(
      "RepairPaymentOrder.amount must be a safe positive integer."
    );
  }
  return amount;
}

function normalizeDoneSnapshot(payment: TossPaymentSnapshot) {
  const paymentKey = normalizePaymentKey(payment.paymentKey);
  const orderId = normalizeOrderId(payment.orderId);
  const amount = requireSafePositiveAmount(payment.amount);
  if (payment.status !== "DONE") {
    throw new ConflictException("DONE 상태의 Toss 승인 결과만 확정할 수 있습니다.");
  }
  const method = requireNonblank(payment.method ?? "", "payment method");
  const approvedAt = new Date(payment.approvedAt ?? "");
  if (!Number.isFinite(approvedAt.getTime())) {
    throw new BadRequestException("Toss 승인 시각이 올바르지 않습니다.");
  }
  return { paymentKey, orderId, amount, method, approvedAt };
}

function transitionConflict(status: string, action: string): never {
  throw new ConflictException(
    `현재 ${status} 상태의 수리비 결제 주문은 ${action}할 수 없습니다.`
  );
}

export function mapRepairPaymentOrder(
  row: RepairPaymentOrder
): RepairPaymentOrderView {
  return {
    id: row.id,
    paymentRequestId: row.paymentRequestId,
    payerRole: row.payerRole,
    payerUserId: row.payerUserId,
    orderId: row.orderId,
    flow: row.flow,
    amount: requireSafePositiveAmount(row.amount),
    status: row.status,
    ...(row.paymentKey === null ? {} : { paymentKey: row.paymentKey }),
    ...(row.method === null ? {} : { method: row.method }),
    ...(row.failureReason === null
      ? {}
      : { failureReason: row.failureReason }),
    returnPath: row.returnPath,
    initiatedBy: row.initiatedBy,
    ...(row.confirmationId === null
      ? {}
      : { confirmationId: row.confirmationId }),
    ...(row.toolCallId === null ? {} : { toolCallId: row.toolCallId }),
    ...(row.approvedAt === null
      ? {}
      : { approvedAt: row.approvedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function repairPaymentPayloadHash(input: {
  paymentRequestId: string;
  payerRole: "MANAGER" | "TENANT";
  payerUserId: string;
  amount: number;
  returnPath: string;
  initiatedBy: "USER_UI" | "AI_AGENT" | "SYSTEM_POLICY";
  confirmationId?: string;
  toolCallId?: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        paymentRequestId: input.paymentRequestId,
        payerRole: input.payerRole,
        payerUserId: input.payerUserId,
        amount: input.amount,
        returnPath: input.returnPath,
        initiatedBy: input.initiatedBy,
        confirmationId: input.confirmationId ?? "",
        toolCallId: input.toolCallId ?? ""
      })
    )
    .digest("hex");
}

function creationConflict(): never {
  throw new ConflictException(
    "동일한 creationKey로 다른 수리비 결제 주문을 만들 수 없습니다."
  );
}

function activeOrderConflict(): never {
  throw new ConflictException(
    "이 지급 요청에는 이미 결제 진행 중인 주문이 있습니다."
  );
}

function isSerializationFailure(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  const metadata = JSON.stringify(error.meta ?? {});
  return (
    error.code === "P2010" &&
    (metadata.includes("40001") || error.message.includes("40001"))
  );
}

function isRepairOrderUniqueRace(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = JSON.stringify(error.meta?.target ?? error.meta ?? {});
  return target.includes("creationKey") || target.includes("openOrderKey");
}

function isPaymentKeyUniqueRace(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = JSON.stringify(error.meta?.target ?? error.meta ?? {});
  return target.includes("paymentKey");
}

function sameCreationPayload(
  row: RepairPaymentOrder,
  input: {
    actor: NormalizedActor;
    command: NormalizedCreateCommand;
    amount: number;
    payloadHash: string;
  }
) {
  return (
    row.paymentRequestId === input.command.paymentRequestId &&
    row.payerRole === input.actor.payerRole &&
    row.payerUserId === input.actor.payerUserId &&
    row.amount === input.amount &&
    row.returnPath === input.command.returnPath &&
    row.initiatedBy === input.actor.initiatedBy &&
    row.confirmationId === (input.actor.confirmationId ?? null) &&
    row.toolCallId === (input.actor.toolCallId ?? null) &&
    row.payloadHash === input.payloadHash
  );
}

@Injectable()
export class PrismaRepairPaymentOrderRepository
  implements RepairPaymentOrderRepository
{
  constructor(
    private readonly database: CreditPrismaClient,
    private readonly events: DomainEventRepository
  ) {}

  async assertTenantAccess(actor: RepairPaymentActor): Promise<void> {
    const normalized = normalizeActor(actor);
    if (normalized.payerRole !== "TENANT") {
      throw new ForbiddenException("임차인 접근 권한이 없습니다.");
    }
    const account = await this.database.client.userAccount.findFirst({
      where: {
        id: normalized.payerUserId,
        role: "TENANT",
        status: "ACTIVE",
        tenantRooms: { some: {} }
      },
      select: { id: true }
    });
    if (!account) {
      throw new ForbiddenException("임차인 접근 권한이 없습니다.");
    }
  }

  async createOrder(
    actor: RepairPaymentActor,
    input: CreateRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const command = normalizeCreateCommand(input);
    let lastRetryableError: unknown;

    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
      try {
        return await this.database.client.$transaction(
          async (tx) => {
            const authority = await this.lockPaymentAuthority(
              tx,
              normalizedActor,
              command.paymentRequestId
            );
            if (!canPrepareTossPayment(authority)) {
              throw new ConflictException(
                "현재 지급 요청 상태에서는 Toss 결제 주문을 만들 수 없습니다."
              );
            }
            const amount = requireSafePositiveAmount(authority.amount);
            const payloadHash = repairPaymentPayloadHash({
              paymentRequestId: command.paymentRequestId,
              payerRole: normalizedActor.payerRole,
              payerUserId: normalizedActor.payerUserId,
              amount,
              returnPath: command.returnPath,
              initiatedBy: normalizedActor.initiatedBy,
              confirmationId: normalizedActor.confirmationId,
              toolCallId: normalizedActor.toolCallId
            });

            const existing = await tx.repairPaymentOrder.findUnique({
              where: { creationKey: command.creationKey }
            });
            if (existing) {
              if (
                existing.retryOfOrderId !== null ||
                !sameCreationPayload(existing, {
                  actor: normalizedActor,
                  command,
                  amount,
                  payloadHash
                })
              ) {
                creationConflict();
              }
              return mapRepairPaymentOrder(existing);
            }

            const active = await tx.repairPaymentOrder.findUnique({
              where: { openOrderKey: command.paymentRequestId }
            });
            if (active) activeOrderConflict();

            const suffix = randomUUID();
            const orderId = requireRepairPaymentOrderId(
              `roomlog-repair-${suffix}`
            );
            const created = await tx.repairPaymentOrder.create({
              data: {
                id: `repair-payment-${suffix}`,
                paymentRequestId: command.paymentRequestId,
                payerRole: normalizedActor.payerRole,
                payerUserId: normalizedActor.payerUserId,
                orderId,
                creationKey: command.creationKey,
                payloadHash,
                openOrderKey: command.paymentRequestId,
                flow: "TOSS_ONE_TIME",
                amount,
                status: "READY",
                returnPath: command.returnPath,
                initiatedBy: normalizedActor.initiatedBy,
                confirmationId: normalizedActor.confirmationId ?? null,
                toolCallId: normalizedActor.toolCallId ?? null
              }
            });
            return mapRepairPaymentOrder(created);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (
          !isSerializationFailure(error) &&
          !isRepairOrderUniqueRace(error)
        ) {
          throw error;
        }
        lastRetryableError = error;
        if (attempt + 1 < MAX_CREATE_ATTEMPTS) continue;
      }
    }

    const resolved = await this.resolveCreateRace(normalizedActor, command);
    if (resolved) return resolved;
    throw lastRetryableError;
  }

  async getOrder(
    actor: RepairPaymentActor,
    orderId: string
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const normalizedOrderId = normalizeOrderId(orderId);
    const row = await this.database.client.repairPaymentOrder.findFirst({
      where: {
        orderId: normalizedOrderId,
        payerRole: normalizedActor.payerRole,
        payerUserId: normalizedActor.payerUserId,
        payer: {
          status: "ACTIVE",
          role:
            normalizedActor.payerRole === "MANAGER" ? "LANDLORD" : "TENANT"
        },
        paymentRequest:
          normalizedActor.payerRole === "MANAGER"
            ? {
                payerRole: "MANAGER",
                payerUserId: normalizedActor.payerUserId,
                managerId: normalizedActor.payerUserId,
                repair: {
                  ticket: { room: { landlordId: normalizedActor.payerUserId } }
                }
              }
            : {
                payerRole: "TENANT",
                payerUserId: normalizedActor.payerUserId,
                repair: {
                  ticket: {
                    tenantId: normalizedActor.payerUserId,
                    room: {
                      tenants: {
                        some: { tenantId: normalizedActor.payerUserId }
                      }
                    }
                  }
                }
              }
      }
    });
    if (!row) {
      throw new NotFoundException("수리비 결제 주문을 찾을 수 없습니다.");
    }
    return mapRepairPaymentOrder(row);
  }

  async claimConfirmation(
    actor: RepairPaymentActor,
    input: ClaimRepairPaymentConfirmationCommand
  ): Promise<RepairPaymentConfirmationClaim> {
    const normalizedActor = normalizeActor(actor);
    const orderId = normalizeOrderId(input.orderId);
    const paymentKey = normalizePaymentKey(input.paymentKey);
    const amount = requireSafePositiveAmount(input.amount);

    try {
      return await this.database.client.$transaction(async (tx) => {
        const { order, authority } = await this.lockOrderAndAuthority(
          tx,
          normalizedActor,
          orderId
        );
        if (order.amount !== amount || authority.amount !== amount) {
          throw new BadRequestException(
            "Toss 승인 금액이 저장된 주문 금액과 일치하지 않습니다."
          );
        }
        if (order.status === "APPROVED") {
          if (order.paymentKey !== paymentKey) {
            throw new ConflictException(
              "이미 다른 Toss 결제로 승인된 주문입니다."
            );
          }
          return {
            outcome: "ALREADY_APPROVED",
            order: mapRepairPaymentOrder(order)
          };
        }
        if (order.status === "CONFIRMING") {
          if (order.paymentKey !== paymentKey) {
            throw new ConflictException(
              "이미 다른 결제 키로 승인 처리 중인 주문입니다."
            );
          }
          return {
            outcome: "IN_PROGRESS",
            order: mapRepairPaymentOrder(order)
          };
        }
        if (order.status === "RECONCILIATION_REQUIRED") {
          if (order.paymentKey !== paymentKey) {
            throw new ConflictException(
              "확인 중인 결제 키와 요청한 결제 키가 다릅니다."
            );
          }
          return {
            outcome: "RECONCILIATION_REQUIRED",
            order: mapRepairPaymentOrder(order)
          };
        }
        if (order.status !== "READY") {
          transitionConflict(order.status, "승인 요청");
        }
        if (!canPrepareTossPayment(authority)) {
          throw new ConflictException(
            "현재 지급 요청 상태에서는 Toss 승인을 시작할 수 없습니다."
          );
        }
        const used = await tx.repairPaymentOrder.findUnique({
          where: { paymentKey },
          select: { id: true }
        });
        if (used && used.id !== order.id) {
          throw new ConflictException(
            "이 결제 키는 이미 다른 수리비 결제 주문에서 사용 중입니다."
          );
        }
        const claimed = await tx.repairPaymentOrder.update({
          where: { id: order.id },
          data: {
            status: "CONFIRMING",
            paymentKey,
            failureReason: null,
            openOrderKey: order.paymentRequestId
          }
        });
        return { outcome: "CLAIMED", order: mapRepairPaymentOrder(claimed) };
      });
    } catch (error) {
      if (isPaymentKeyUniqueRace(error)) {
        throw new ConflictException(
          "이 결제 키는 이미 다른 수리비 결제 주문에서 사용 중입니다."
        );
      }
      throw error;
    }
  }

  async finalizeOrder(
    actor: RepairPaymentActor,
    input: FinalizeRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const orderId = normalizeOrderId(input.orderId);
    const payment = normalizeDoneSnapshot(input.payment);

    return this.database.client.$transaction(async (tx) => {
      const { order, authority } = await this.lockOrderAndAuthority(
        tx,
        normalizedActor,
        orderId
      );
      this.assertMatchingFinalization(order, payment);
      if (order.status === "APPROVED") {
        return mapRepairPaymentOrder(order);
      }
      if (
        order.status !== "CONFIRMING" &&
        order.status !== "RECONCILIATION_REQUIRED"
      ) {
        transitionConflict(order.status, "결제 확정");
      }
      if (!canPrepareTossPayment(authority)) {
        throw new ConflictException(
          "지급 요청이 이미 다른 방식으로 처리되어 Toss 결제를 확정할 수 없습니다."
        );
      }

      const request = await this.loadFinalizationRequest(
        tx,
        order.paymentRequestId
      );
      if (
        request.amount !== order.amount ||
        request.amount !== payment.amount ||
        request.costId !== null ||
        request.ledgerEntryId !== null
      ) {
        throw new ConflictException(
          "지급 요청과 Toss 결제 주문의 확정 정보가 일치하지 않습니다."
        );
      }

      const now = new Date();
      const costId = request.payerRole === "MANAGER"
        ? `cost_vendor_payment_${request.id}`
        : null;
      if (costId) {
        const unitId = request.repair.ticket.room.roomNo
          .trim()
          .replace(/호$/u, "");
        await tx.cost.create({
          data: {
            id: costId,
            managerId: request.managerId,
            date: request.completionReport.completedAt,
            item: `${unitId} ${request.repair.title}`,
            amount: request.amount,
            type: "REPAIR",
            scope: "UNIT",
            unitId,
            status: "CONFIRMED",
            verified: true,
            repairPayment: "ALREADY_PAID",
            paymentRef: order.orderId,
            createdAt: now,
            updatedAt: now
          }
        });
      }
      await tx.vendorPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: "TOSS_PAID",
          costId,
          ledgerEntryId: null,
          failureReason: null,
          lastAttemptMode: "TOSS",
          processedAt: now
        }
      });
      const approved = await tx.repairPaymentOrder.update({
        where: { id: order.id },
        data: {
          status: "APPROVED",
          method: payment.method,
          approvedAt: payment.approvedAt,
          failureReason: null,
          openOrderKey: null
        }
      });

      const audit = await tx.vendorPaymentAuditEvent.createMany({
        data: {
          id: `vendor-payment-audit-${randomUUID()}`,
          paymentRequestId: request.id,
          type: "TOSS_PAID",
          dedupeKey: `vendor-payment:${request.id}:TOSS_PAID`,
          actorUserId: normalizedActor.payerUserId
        },
        skipDuplicates: true
      });
      if (audit.count !== 1) {
        throw new ConflictException(
          "Toss 지급 감사 기록이 이미 다른 결제에 연결되어 있습니다."
        );
      }
      const targetUserIds = await this.activeVendorUserIds(
        tx,
        request.vendorId
      );
      await this.events.enqueue(tx, {
        event: {
          eventKey: `vendor-payment:${request.id}:TOSS_PAID`,
          type: "VENDOR_PAYMENT_PAID",
          targetUserIds,
          vendorId: request.vendorId,
          managerId: request.managerId,
          repairId: request.repairId,
          paymentRequestId: request.id,
          ...(request.completionDecisionId === null
            ? {}
            : { completionDecisionId: request.completionDecisionId }),
          actorUserId: normalizedActor.payerUserId,
          statusCode: "TOSS_PAID",
          occurredAt: now.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });
      return mapRepairPaymentOrder(approved);
    });
  }

  async markRejected(
    actor: RepairPaymentActor,
    input: ExplainRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const orderId = normalizeOrderId(input.orderId);
    const reason = boundedReason(input.reason);
    return this.database.client.$transaction(async (tx) => {
      const { order } = await this.lockOrderAndAuthority(
        tx,
        normalizedActor,
        orderId
      );
      if (
        order.status !== "CONFIRMING" &&
        order.status !== "RECONCILIATION_REQUIRED"
      ) {
        transitionConflict(order.status, "실패 처리");
      }
      const failed = await tx.repairPaymentOrder.update({
        where: { id: order.id },
        data: {
          status: "FAILED",
          failureReason: reason,
          openOrderKey: null
        }
      });
      return mapRepairPaymentOrder(failed);
    });
  }

  async markUncertain(
    actor: RepairPaymentActor,
    input: ExplainRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const orderId = normalizeOrderId(input.orderId);
    const reason = boundedReason(input.reason);
    return this.database.client.$transaction(async (tx) => {
      const { order } = await this.lockOrderAndAuthority(
        tx,
        normalizedActor,
        orderId
      );
      if (
        order.status !== "CONFIRMING" &&
        order.status !== "RECONCILIATION_REQUIRED"
      ) {
        transitionConflict(order.status, "확인 필요 처리");
      }
      const uncertain = await tx.repairPaymentOrder.update({
        where: { id: order.id },
        data: {
          status: "RECONCILIATION_REQUIRED",
          failureReason: reason,
          openOrderKey: order.paymentRequestId
        }
      });
      return mapRepairPaymentOrder(uncertain);
    });
  }

  async cancelOrder(
    actor: RepairPaymentActor,
    input: CancelRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const orderId = normalizeOrderId(input.orderId);
    return this.database.client.$transaction(async (tx) => {
      const { order } = await this.lockOrderAndAuthority(
        tx,
        normalizedActor,
        orderId
      );
      if (order.status !== "READY" && order.status !== "FAILED") {
        transitionConflict(order.status, "취소");
      }
      const cancelled = await tx.repairPaymentOrder.update({
        where: { id: order.id },
        data: { status: "CANCELLED", openOrderKey: null }
      });
      return mapRepairPaymentOrder(cancelled);
    });
  }

  async retryOrder(
    actor: RepairPaymentActor,
    input: RetryRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView> {
    const normalizedActor = normalizeActor(actor);
    const orderId = normalizeOrderId(input.orderId);
    const creationKey = requireRepairPaymentCreationKey(input.creationKey);
    const returnPath = normalizeReturnPath(input.returnPath);

    try {
      return await this.serializable(async (tx) => {
        const { order, authority } = await this.lockOrderAndAuthority(
          tx,
          normalizedActor,
          orderId
        );
        const command = {
          paymentRequestId: order.paymentRequestId,
          creationKey,
          returnPath
        };
        const payloadHash = repairPaymentPayloadHash({
          paymentRequestId: order.paymentRequestId,
          payerRole: normalizedActor.payerRole,
          payerUserId: normalizedActor.payerUserId,
          amount: order.amount,
          returnPath,
          initiatedBy: normalizedActor.initiatedBy,
          confirmationId: normalizedActor.confirmationId,
          toolCallId: normalizedActor.toolCallId
        });
        const existing = await tx.repairPaymentOrder.findUnique({
          where: { creationKey }
        });
        if (existing) {
          if (
            existing.retryOfOrderId !== order.id ||
            !sameCreationPayload(existing, {
              actor: normalizedActor,
              command,
              amount: order.amount,
              payloadHash
            })
          ) {
            creationConflict();
          }
          return mapRepairPaymentOrder(existing);
        }
        if (!canPrepareTossPayment(authority)) {
          throw new ConflictException(
            "현재 지급 요청 상태에서는 Toss 재결제 주문을 만들 수 없습니다."
          );
        }
        if (order.status !== "READY" && order.status !== "FAILED") {
          transitionConflict(order.status, "재결제");
        }
        if (order.status === "READY") {
          await tx.repairPaymentOrder.update({
            where: { id: order.id },
            data: { status: "CANCELLED", openOrderKey: null }
          });
        }
        const active = await tx.repairPaymentOrder.findUnique({
          where: { openOrderKey: order.paymentRequestId }
        });
        if (active) activeOrderConflict();

        const suffix = randomUUID();
        const retryOrderId = requireRepairPaymentOrderId(
          `roomlog-repair-${suffix}`
        );
        const created = await tx.repairPaymentOrder.create({
          data: {
            id: `repair-payment-${suffix}`,
            paymentRequestId: order.paymentRequestId,
            payerRole: normalizedActor.payerRole,
            payerUserId: normalizedActor.payerUserId,
            orderId: retryOrderId,
            creationKey,
            payloadHash,
            retryOfOrderId: order.id,
            openOrderKey: order.paymentRequestId,
            flow: "TOSS_ONE_TIME",
            amount: order.amount,
            status: "READY",
            returnPath,
            initiatedBy: normalizedActor.initiatedBy,
            confirmationId: normalizedActor.confirmationId ?? null,
            toolCallId: normalizedActor.toolCallId ?? null
          }
        });
        return mapRepairPaymentOrder(created);
      });
    } catch (error) {
      if (isRepairOrderUniqueRace(error)) {
        throw new ConflictException(
          "재결제 주문 생성 키 또는 활성 주문이 충돌했습니다."
        );
      }
      throw error;
    }
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
      try {
        return await this.database.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (
          !isSerializationFailure(error) ||
          attempt + 1 === MAX_CREATE_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error("Serializable transaction retry exhausted.");
  }

  private async lockOrderAndAuthority(
    tx: Prisma.TransactionClient,
    actor: NormalizedActor,
    orderId: string
  ): Promise<{
    order: RepairPaymentOrder;
    authority: LockedPaymentAuthority;
  }> {
    const lookup = await tx.repairPaymentOrder.findUnique({
      where: { orderId },
      select: { paymentRequestId: true }
    });
    if (!lookup) {
      throw new NotFoundException("수리비 결제 주문을 찾을 수 없습니다.");
    }

    const authority = await this.lockPaymentAuthority(
      tx,
      actor,
      lookup.paymentRequestId
    );
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "RepairPaymentOrder"
      WHERE "orderId" = ${orderId}
        AND "paymentRequestId" = ${authority.id}
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw new NotFoundException("수리비 결제 주문을 찾을 수 없습니다.");
    }
    const order = await tx.repairPaymentOrder.findUniqueOrThrow({
      where: { id: locked[0].id }
    });
    if (
      order.paymentRequestId !== authority.id ||
      order.payerRole !== actor.payerRole ||
      order.payerUserId !== actor.payerUserId ||
      order.payerRole !== authority.payerRole ||
      order.payerUserId !== authority.payerUserId
    ) {
      throw new NotFoundException("수리비 결제 주문을 찾을 수 없습니다.");
    }
    return { order, authority };
  }

  private assertMatchingFinalization(
    order: RepairPaymentOrder,
    payment: {
      paymentKey: string;
      orderId: string;
      amount: number;
      method: string;
      approvedAt: Date;
    }
  ) {
    if (
      payment.orderId !== order.orderId ||
      payment.paymentKey !== order.paymentKey ||
      payment.amount !== order.amount
    ) {
      throw new ConflictException(
        "Toss 승인 결과가 저장된 결제 주문과 일치하지 않습니다."
      );
    }
    if (order.status !== "APPROVED") return;
    if (
      order.method !== payment.method ||
      order.approvedAt === null ||
      order.approvedAt.getTime() !== payment.approvedAt.getTime()
    ) {
      throw new ConflictException(
        "이미 승인된 주문과 다른 Toss 결제 결과를 확정할 수 없습니다."
      );
    }
  }

  private loadFinalizationRequest(
    tx: Prisma.TransactionClient,
    paymentRequestId: string
  ): Promise<FinalizationPaymentRequest> {
    return tx.vendorPaymentRequest.findUniqueOrThrow({
      where: { id: paymentRequestId },
      include: {
        repair: { include: { ticket: { include: { room: true } } } },
        completionReport: true
      }
    });
  }

  private async activeVendorUserIds(
    tx: Prisma.TransactionClient,
    vendorId: string
  ) {
    const links = await tx.vendorAccountLink.findMany({
      where: {
        vendorId,
        status: "ACTIVE",
        user: { status: "ACTIVE" }
      },
      select: { userId: true }
    });
    return [...new Set(links.map(({ userId }) => userId))].sort();
  }

  private async lockPaymentAuthority(
    tx: Prisma.TransactionClient,
    actor: NormalizedActor,
    paymentRequestId: string
  ): Promise<LockedPaymentAuthority> {
    const rows = await tx.$queryRaw<LockedPaymentAuthority[]>(Prisma.sql`
      SELECT
        request."id",
        request."payerRole"::text AS "payerRole",
        request."payerUserId" AS "payerUserId",
        request."managerId" AS "managerId",
        request."amount",
        request."status"::text AS "status",
        request."lastAttemptMode"::text AS "lastAttemptMode",
        ticket."tenantId" AS "ticketTenantId",
        ticket."roomId" AS "roomId",
        room."landlordId" AS "landlordId",
        payer."role"::text AS "payerAccountRole",
        payer."status"::text AS "payerAccountStatus",
        EXISTS (
          SELECT 1
          FROM "TenantRoom" tenant_room
          WHERE tenant_room."tenantId" = request."payerUserId"
            AND tenant_room."roomId" = ticket."roomId"
        ) AS "tenantRoomLinked"
      FROM "VendorPaymentRequest" request
      JOIN "RepairRequest" repair ON repair."id" = request."repairId"
      JOIN "Ticket" ticket ON ticket."id" = repair."ticketId"
      JOIN "Room" room ON room."id" = ticket."roomId"
      JOIN "UserAccount" payer ON payer."id" = request."payerUserId"
      WHERE request."id" = ${paymentRequestId}
      FOR UPDATE OF request
    `);
    const authority = rows[0];
    if (!authority || !this.hasAuthority(actor, authority)) {
      throw new NotFoundException("지급 요청을 찾을 수 없습니다.");
    }
    return authority;
  }

  private hasAuthority(
    actor: NormalizedActor,
    authority: LockedPaymentAuthority
  ) {
    if (
      authority.payerRole !== actor.payerRole ||
      authority.payerUserId !== actor.payerUserId ||
      authority.payerAccountStatus !== "ACTIVE"
    ) {
      return false;
    }
    if (actor.payerRole === "MANAGER") {
      return (
        authority.payerAccountRole === "LANDLORD" &&
        authority.managerId === actor.payerUserId &&
        authority.landlordId === actor.payerUserId
      );
    }
    return (
      authority.payerAccountRole === "TENANT" &&
      authority.ticketTenantId === actor.payerUserId &&
      authority.tenantRoomLinked
    );
  }

  private async resolveCreateRace(
    actor: NormalizedActor,
    command: NormalizedCreateCommand
  ): Promise<RepairPaymentOrderView | undefined> {
    const authority = await this.database.client.vendorPaymentRequest.findFirst({
      where: {
        id: command.paymentRequestId,
        payerRole: actor.payerRole,
        payerUserId: actor.payerUserId
      },
      select: {
        amount: true,
        status: true,
        payerRole: true,
        lastAttemptMode: true
      }
    });
    if (!authority || !canPrepareTossPayment(authority)) {
      return undefined;
    }
    const amount = requireSafePositiveAmount(authority.amount);
    const payloadHash = repairPaymentPayloadHash({
      paymentRequestId: command.paymentRequestId,
      payerRole: actor.payerRole,
      payerUserId: actor.payerUserId,
      amount,
      returnPath: command.returnPath,
      initiatedBy: actor.initiatedBy,
      confirmationId: actor.confirmationId,
      toolCallId: actor.toolCallId
    });
    const existing = await this.database.client.repairPaymentOrder.findUnique({
      where: { creationKey: command.creationKey }
    });
    if (existing) {
      if (
        existing.retryOfOrderId !== null ||
        !sameCreationPayload(existing, { actor, command, amount, payloadHash })
      ) {
        creationConflict();
      }
      return this.getOrder(actor, existing.orderId);
    }
    const active = await this.database.client.repairPaymentOrder.findUnique({
      where: { openOrderKey: command.paymentRequestId }
    });
    if (active) {
      await this.getOrder(actor, active.orderId);
      activeOrderConflict();
    }
    return undefined;
  }
}
