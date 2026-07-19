import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, type CreditTopupOrder } from "@prisma/client";
import type { DomainEventRepository } from "../domain-events/domain-event.repository";
import { DOMAIN_EVENT_REPOSITORY } from "../domain-events/domain-event.repository";
import type {
  ArchivePublicGaraVendorRegistrationCommand,
  CancelReadyTopupCommand,
  ClaimTopupConfirmationCommand,
  CreateGaraTopupOrderCommand,
  CreateGaraTopupOrderResult,
  CreateGaraVendorPayoutCommand,
  CreatePublicGaraVendorPayoutRequestCommand,
  CreateTopupOrderCommand,
  CreateGaraVendorPayoutResult,
  CreditCommandRepository,
  EvaluateAfterCompletionCommand,
  EvaluateAfterCompletionResult,
  FinalizeTopupCommand,
  MarkTopupRejectedCommand,
  MarkTopupUncertainCommand,
  SaveAutoPayPolicyCommand,
  SettlePaymentRequestCommand,
  SettlePaymentRequestResult,
  SettleGaraVendorPayoutCommand,
  TopupConfirmationClaim,
  VendorPaymentCorrectionCommand
} from "./credit-command.repository";
import { CreditPrismaClient } from "./credit-prisma.client";
import {
  mapAutoPayPolicy,
  mapCreditAccount,
  mapCreditTopupOrder,
  mapVendorPaymentRequest
} from "./prisma-credit-query.repository";

const MAX_REASON_LENGTH = 500;
const MAX_SAFE_CREDIT_BALANCE = BigInt(Number.MAX_SAFE_INTEGER);
const FINAL_PAYMENT_STATUSES = new Set([
  "AUTO_PAID",
  "MANUAL_CREDIT_PAID",
  "DIRECT_PAID",
  "TOSS_PAID",
  "CANCELLED",
  "REVERSED",
  "DIRECT_PAYMENT_VOIDED"
] as const);

type SettlementRequest = Prisma.VendorPaymentRequestGetPayload<{
  include: {
    repair: {
      include: {
        ticket: { include: { room: true } };
        completionReports: true;
        estimates: true;
      };
    };
    approvedEstimate: true;
    completionReport: true;
    completionDecision: true;
  };
}>;

type CorrectionRequest = Prisma.VendorPaymentRequestGetPayload<{
  include: { cost: true; ledgerEntry: true };
}>;

function requireNonblank(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} 값이 필요합니다.`);
  return normalized;
}

function requirePositiveSafeMoney(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BadRequestException(`${field}은(는) 안전한 양의 정수여야 합니다.`);
  }
  return value;
}

function normalizeReturnPath(value: string) {
  const raw = requireNonblank(value, "returnPath");
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    throw new BadRequestException("복귀 경로는 서비스 내부 경로여야 합니다.");
  }

  const base = new URL("https://roomlog.local");
  const parsed = new URL(raw, base);
  if (parsed.origin !== base.origin) {
    throw new BadRequestException("복귀 경로는 서비스 내부 경로여야 합니다.");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function topupPayloadHash(input: {
  managerId: string;
  amount: number;
  returnPath: string;
  garaManagerVendorId?: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        amount: input.amount,
        garaManagerVendorId: input.garaManagerVendorId,
        managerId: input.managerId,
        returnPath: input.returnPath
      })
    )
    .digest("hex");
}

function canonicalHash(value: Record<string, string>) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left.localeCompare(right)
          )
        )
      )
    )
    .digest("hex");
}

function isFinalPaymentStatus(
  status: string
): status is
  | "AUTO_PAID"
  | "MANUAL_CREDIT_PAID"
  | "DIRECT_PAID"
  | "TOSS_PAID"
  | "CANCELLED"
  | "REVERSED"
  | "DIRECT_PAYMENT_VOIDED" {
  return FINAL_PAYMENT_STATUSES.has(
    status as (typeof FINAL_PAYMENT_STATUSES extends Set<infer T> ? T : never)
  );
}

function boundedReason(reason: string) {
  return requireNonblank(reason, "reason").slice(0, MAX_REASON_LENGTH);
}

function topupConflict(message: string): never {
  throw new ConflictException(message);
}

function isSerializationFailure(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;

  // Raw SQL inside a serializable transaction can surface PostgreSQL 40001
  // through Prisma's P2010 wrapper instead of the transaction-level P2034.
  const metadata = JSON.stringify(error.meta ?? {});
  return (
    error.code === "P2010" &&
    (metadata.includes("40001") || error.message.includes("40001"))
  );
}

@Injectable()
export class PrismaCreditCommandRepository
  implements CreditCommandRepository
{
  constructor(
    private readonly database: CreditPrismaClient,
    @Inject(DOMAIN_EVENT_REPOSITORY)
    private readonly events: DomainEventRepository
  ) {}

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (!isSerializationFailure(error) || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable transaction retry exhausted.");
  }

  private async ensureAccountRows(
    tx: Prisma.TransactionClient,
    managerId: string
  ) {
    const normalizedManagerId = requireNonblank(managerId, "managerId");
    const account = await tx.creditAccount.upsert({
      where: { managerId: normalizedManagerId },
      update: {},
      create: {
        id: `credit-${randomUUID()}`,
        managerId: normalizedManagerId,
        balance: 0n,
        version: 0
      }
    });
    await tx.autoPayPolicy.upsert({
      where: { managerId: normalizedManagerId },
      update: {},
      create: {
        id: `credit-policy-${randomUUID()}`,
        managerId: normalizedManagerId,
        mode: "ALWAYS_REQUIRE_APPROVAL"
      }
    });
    return account;
  }

  async ensureAccount(input: Readonly<{ managerId: string }>) {
    const account = await this.serializable((tx) =>
      this.ensureAccountRows(tx, input.managerId)
    );
    return mapCreditAccount(account);
  }

  async createTopupOrder(input: CreateTopupOrderCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    const amount = requirePositiveSafeMoney(input.amount, "amount");
    const creationKey = requireNonblank(input.creationKey, "creationKey");
    const returnPath = normalizeReturnPath(input.returnPath);
    const garaManagerVendorId = input.garaManagerVendorId
      ? requireNonblank(input.garaManagerVendorId, "garaManagerVendorId")
      : undefined;
    const payloadHash = topupPayloadHash({
      managerId,
      amount,
      returnPath,
      garaManagerVendorId
    });

    return this.serializable(async (tx) => {
      const account = await this.ensureAccountRows(tx, managerId);
      const existing = await tx.creditTopupOrder.findUnique({
        where: { creationKey }
      });
      if (existing) {
        if (
          existing.managerId !== managerId ||
          existing.payloadHash !== payloadHash
        ) {
          topupConflict(
            "동일한 creationKey로 다른 충전 주문을 만들 수 없습니다."
          );
        }
        return { order: mapCreditTopupOrder(existing) };
      }

      const suffix = randomUUID();
      const order = await tx.creditTopupOrder.create({
        data: {
          id: `credit-topup-${suffix}`,
          creditAccountId: account.id,
          managerId,
          orderId: `roomlog-credit-${suffix}`,
          creationKey,
          payloadHash,
          amount: BigInt(amount),
          status: "READY",
          returnPath,
          ...(garaManagerVendorId ? { garaManagerVendorId } : {})
        }
      });
      return { order: mapCreditTopupOrder(order) };
    });
  }

  async createGaraTopupOrder(
    input: CreateGaraTopupOrderCommand
  ): Promise<CreateGaraTopupOrderResult> {
    const managerVendorId = requireNonblank(
      input.managerVendorId,
      "managerVendorId"
    );
    const amount = requirePositiveSafeMoney(input.amount, "amount");
    const creationKey = requireNonblank(input.creationKey, "creationKey");
    const returnPath = normalizeReturnPath(input.returnPath);

    return this.serializable(async (tx) => {
      const registration = await tx.managerVendor.findUnique({
        where: { id: managerVendorId },
        include: { manager: true, vendor: true }
      });
      if (
        !registration ||
        registration.status !== "ACTIVE" ||
        registration.manager.status !== "ACTIVE" ||
        !registration.vendor.isActive
      ) {
        throw new NotFoundException("충전할 Gara 업체 등록을 찾을 수 없습니다.");
      }
      if (!registration.settlementAccountNumber?.trim()) {
        throw new BadRequestException(
          "업체 계좌번호를 등록한 뒤 충전해 주세요."
        );
      }

      const managerId = registration.managerId;
      const payloadHash = topupPayloadHash({
        managerId,
        amount,
        returnPath,
        garaManagerVendorId: managerVendorId
      });
      const account = await this.ensureAccountRows(tx, managerId);
      const existing = await tx.creditTopupOrder.findUnique({
        where: { creationKey }
      });
      if (existing) {
        if (
          existing.managerId !== managerId ||
          existing.payloadHash !== payloadHash
        ) {
          topupConflict(
            "동일한 creationKey로 다른 충전 주문을 만들 수 없습니다."
          );
        }
        return { managerId, order: mapCreditTopupOrder(existing) };
      }

      const suffix = randomUUID();
      const order = await tx.creditTopupOrder.create({
        data: {
          id: `credit-topup-${suffix}`,
          creditAccountId: account.id,
          managerId,
          garaManagerVendorId: managerVendorId,
          orderId: `roomlog-credit-${suffix}`,
          creationKey,
          payloadHash,
          amount: BigInt(amount),
          status: "READY",
          returnPath
        }
      });
      return { managerId, order: mapCreditTopupOrder(order) };
    });
  }

  async createGaraVendorPayout(
    input: CreateGaraVendorPayoutCommand
  ): Promise<CreateGaraVendorPayoutResult> {
    const managerId = requireNonblank(input.managerId, "managerId");
    const managerVendorId = requireNonblank(input.managerVendorId, "managerVendorId");
    const amount = requirePositiveSafeMoney(input.amount, "amount");
    const idempotencyKey = requireNonblank(input.idempotencyKey, "idempotencyKey");
    const payloadHash = canonicalHash({
      amount: String(amount),
      managerId,
      managerVendorId,
    });

    return this.serializable(async (tx) => {
      const existing = await tx.garaVendorPayoutRequest.findUnique({
        where: { idempotencyKey },
        include: { creditAccount: true },
      });
      if (existing) {
        if (existing.managerId !== managerId || existing.payloadHash !== payloadHash) {
          topupConflict("동일한 멱등성 키로 다른 Gara 지급 요청을 만들 수 없습니다.");
        }
        if (!existing.creditAccount) {
          throw new ConflictException("관리자 결제를 기다리는 Gara 지급 요청입니다.");
        }
        return {
          request: {
            id: existing.id,
            amount: Number(existing.amount),
            accountNumber: existing.accountNumberSnapshot,
            status: existing.status,
            createdAt: existing.createdAt.toISOString(),
          },
          account: mapCreditAccount(existing.creditAccount),
        };
      }

      const registration = await tx.managerVendor.findUnique({
        where: { id: managerVendorId },
        include: { vendor: true },
      });
      if (!registration || registration.managerId !== managerId) {
        throw new NotFoundException("등록한 업체를 찾을 수 없습니다.");
      }
      if (registration.status !== "ACTIVE" || !registration.vendor.isActive) {
        throw new ConflictException("현재 지급할 수 없는 업체입니다.");
      }
      const accountNumber = registration.settlementAccountNumber?.trim();
      if (!accountNumber) {
        throw new BadRequestException("업체 계좌번호를 등록한 뒤 지급 요청을 만들어 주세요.");
      }

      const account = await this.ensureAccountRows(tx, managerId);
      const now = new Date();
      const balances = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "CreditAccount"
        SET
          "balance" = "balance" - ${BigInt(amount)},
          "version" = "version" + 1,
          "updatedAt" = ${now}
        WHERE "id" = ${account.id}
          AND "balance" >= ${BigInt(amount)}
        RETURNING "id"
      `);
      if (balances.length === 0) {
        throw new ConflictException("크레딧 잔액이 부족합니다.");
      }

      const payoutId = `gara-vendor-payout-${randomUUID()}`;
      const ledgerEntryId = `credit-ledger-${randomUUID()}`;
      const accountAfter = await tx.creditAccount.findUniqueOrThrow({
        where: { id: account.id },
      });
      await tx.creditLedgerEntry.create({
        data: {
          id: ledgerEntryId,
          creditAccountId: account.id,
          type: "MANUAL_DEBIT",
          signedAmount: -BigInt(amount),
          balanceAfter: accountAfter.balance,
          referenceType: "GARA_VENDOR_PAYOUT_REQUEST",
          referenceId: payoutId,
          idempotencyKey: `gara-payout:${idempotencyKey}`,
        },
      });
      const payout = await tx.garaVendorPayoutRequest.create({
        data: {
          id: payoutId,
          managerId,
          managerVendorId,
          vendorId: registration.vendorId,
          creditAccountId: account.id,
          ledgerEntryId,
          amount: BigInt(amount),
          accountNumberSnapshot: accountNumber,
          status: "CREDIT_DEBITED",
          idempotencyKey,
          payloadHash,
          createdAt: now,
        },
      });
      return {
        request: {
          id: payout.id,
          amount,
          accountNumber: payout.accountNumberSnapshot,
          status: payout.status,
          createdAt: payout.createdAt.toISOString(),
        },
        account: mapCreditAccount(accountAfter),
      };
    });
  }

  async createPublicGaraVendorPayoutRequest(
    input: CreatePublicGaraVendorPayoutRequestCommand
  ) {
    const managerVendorId = requireNonblank(input.managerVendorId, "managerVendorId");
    const amount = requirePositiveSafeMoney(input.amount, "amount");
    const idempotencyKey = requireNonblank(input.idempotencyKey, "idempotencyKey");
    const payloadHash = canonicalHash({ amount: String(amount), managerVendorId });

    return this.serializable(async (tx) => {
      const existing = await tx.garaVendorPayoutRequest.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          topupConflict("동일한 멱등성 키로 다른 Gara 지급 요청을 만들 수 없습니다.");
        }
        return {
          managerId: existing.managerId,
          creditDebited: existing.status === "CREDIT_DEBITED",
          request: {
            id: existing.id,
            amount: Number(existing.amount),
            accountNumber: existing.accountNumberSnapshot,
            status: existing.status,
            createdAt: existing.createdAt.toISOString()
          }
        };
      }

      const registration = await tx.managerVendor.findUnique({
        where: { id: managerVendorId },
        include: { vendor: true }
      });
      if (!registration) throw new NotFoundException("등록한 업체를 찾을 수 없습니다.");
      if (registration.status !== "ACTIVE" || !registration.vendor.isActive) {
        throw new ConflictException("현재 지급할 수 없는 업체입니다.");
      }
      const accountNumber = registration.settlementAccountNumber?.trim();
      if (!accountNumber) {
        throw new BadRequestException("업체 계좌번호를 등록한 뒤 지급 요청을 만들어 주세요.");
      }

      const payoutId = `gara-vendor-payout-${randomUUID()}`;
      const account = await this.ensureAccountRows(tx, registration.managerId);
      const policy = await tx.autoPayPolicy.findUniqueOrThrow({
        where: { managerId: registration.managerId }
      });
      const shouldAutoDebit =
        policy.mode === "AUTO_DEBIT_UNDER_LIMIT" &&
        policy.perRequestLimit !== null &&
        BigInt(amount) <= policy.perRequestLimit;

      if (shouldAutoDebit) {
        const now = new Date();
        const debited = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "CreditAccount"
          SET "balance" = "balance" - ${BigInt(amount)}, "version" = "version" + 1, "updatedAt" = ${now}
          WHERE "id" = ${account.id} AND "balance" >= ${BigInt(amount)}
          RETURNING "id"
        `);
        if (debited.length === 1) {
          const accountAfter = await tx.creditAccount.findUniqueOrThrow({
            where: { id: account.id }
          });
          const ledgerEntryId = `credit-ledger-${randomUUID()}`;
          await tx.creditLedgerEntry.create({
            data: {
              id: ledgerEntryId,
              creditAccountId: account.id,
              type: "AUTO_DEBIT",
              signedAmount: -BigInt(amount),
              balanceAfter: accountAfter.balance,
              referenceType: "GARA_VENDOR_PAYOUT_REQUEST",
              referenceId: payoutId,
              idempotencyKey: `gara-payout-auto:${idempotencyKey}`
            }
          });
          const payout = await tx.garaVendorPayoutRequest.create({
            data: {
              id: payoutId,
              managerId: registration.managerId,
              managerVendorId: registration.id,
              vendorId: registration.vendorId,
              creditAccountId: account.id,
              ledgerEntryId,
              amount: BigInt(amount),
              accountNumberSnapshot: accountNumber,
              status: "CREDIT_DEBITED",
              idempotencyKey,
              payloadHash,
              processedAt: now
            }
          });
          return {
            managerId: registration.managerId,
            creditDebited: true,
            request: {
              id: payout.id,
              amount,
              accountNumber: payout.accountNumberSnapshot,
              status: payout.status,
              createdAt: payout.createdAt.toISOString()
            }
          };
        }
      }

      const payout = await tx.garaVendorPayoutRequest.create({
        data: {
          id: payoutId,
          managerId: registration.managerId,
          managerVendorId: registration.id,
          vendorId: registration.vendorId,
          amount: BigInt(amount),
          accountNumberSnapshot: accountNumber,
          status: "PENDING_APPROVAL",
          idempotencyKey,
          payloadHash
        }
      });
      return {
        managerId: registration.managerId,
        creditDebited: false,
        request: {
          id: payout.id,
          amount,
          accountNumber: payout.accountNumberSnapshot,
          status: payout.status,
          createdAt: payout.createdAt.toISOString()
        }
      };
    });
  }

  async archivePublicGaraVendorRegistration(
    input: ArchivePublicGaraVendorRegistrationCommand
  ): Promise<Readonly<{ managerId: string }>> {
    const managerVendorId = requireNonblank(input.managerVendorId, "managerVendorId");

    return this.serializable(async (tx) => {
      const registration = await tx.managerVendor.findUnique({
        where: { id: managerVendorId },
        select: { managerId: true, status: true }
      });
      if (!registration || registration.status !== "ACTIVE") {
        throw new NotFoundException("삭제할 Gara 업체 등록을 찾을 수 없습니다.");
      }

      await tx.managerVendor.update({
        where: { id: managerVendorId },
        data: { status: "ARCHIVED" }
      });
      return { managerId: registration.managerId };
    });
  }

  async settleGaraVendorPayout(input: SettleGaraVendorPayoutCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    const payoutRequestId = requireNonblank(input.payoutRequestId, "payoutRequestId");
    const idempotencyKey = requireNonblank(input.idempotencyKey, "idempotencyKey");

    return this.serializable(async (tx) => {
      const payout = await tx.garaVendorPayoutRequest.findUnique({
        where: { id: payoutRequestId },
        include: { creditAccount: true }
      });
      if (!payout || payout.managerId !== managerId) {
        throw new NotFoundException("Gara 지급 요청을 찾을 수 없습니다.");
      }
      if (payout.status === "CREDIT_DEBITED") {
        if (!payout.creditAccount) throw new ConflictException("지급 요청 계정 정보가 올바르지 않습니다.");
        return {
          request: {
            id: payout.id,
            amount: Number(payout.amount),
            accountNumber: payout.accountNumberSnapshot,
            status: payout.status,
            createdAt: payout.createdAt.toISOString()
          },
          account: mapCreditAccount(payout.creditAccount)
        };
      }

      const account = await this.ensureAccountRows(tx, managerId);
      const now = new Date();
      const debited = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "CreditAccount"
        SET "balance" = "balance" - ${payout.amount}, "version" = "version" + 1, "updatedAt" = ${now}
        WHERE "id" = ${account.id} AND "balance" >= ${payout.amount}
        RETURNING "id"
      `);
      if (debited.length === 0) throw new ConflictException("크레딧 잔액이 부족합니다.");

      const ledgerEntryId = `credit-ledger-${randomUUID()}`;
      const accountAfter = await tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
      await tx.creditLedgerEntry.create({
        data: {
          id: ledgerEntryId,
          creditAccountId: account.id,
          type: "MANUAL_DEBIT",
          signedAmount: -payout.amount,
          balanceAfter: accountAfter.balance,
          referenceType: "GARA_VENDOR_PAYOUT_REQUEST",
          referenceId: payout.id,
          idempotencyKey: `gara-payout-settle:${idempotencyKey}`
        }
      });
      const settled = await tx.garaVendorPayoutRequest.update({
        where: { id: payout.id },
        data: {
          creditAccountId: account.id,
          ledgerEntryId,
          status: "CREDIT_DEBITED",
          processedAt: now
        }
      });
      return {
        request: {
          id: settled.id,
          amount: Number(settled.amount),
          accountNumber: settled.accountNumberSnapshot,
          status: settled.status,
          createdAt: settled.createdAt.toISOString()
        },
        account: mapCreditAccount(accountAfter)
      };
    });
  }

  async claimTopupConfirmation(
    input: ClaimTopupConfirmationCommand
  ): Promise<TopupConfirmationClaim> {
    const managerId = requireNonblank(input.managerId, "managerId");
    const orderId = requireNonblank(input.orderId, "orderId");
    const paymentKey = requireNonblank(input.paymentKey, "paymentKey");
    const amount = requirePositiveSafeMoney(input.amount, "amount");
    const garaManagerVendorId = input.garaManagerVendorId
      ? requireNonblank(input.garaManagerVendorId, "garaManagerVendorId")
      : undefined;

    return this.serializable(async (tx) => {
      const claimed = await tx.creditTopupOrder.updateMany({
        where: {
          managerId,
          orderId,
          status: "READY",
          amount: BigInt(amount),
          ...(garaManagerVendorId ? { garaManagerVendorId } : {})
        },
        data: { status: "CONFIRMING", paymentKey }
      });
      const order = await tx.creditTopupOrder.findFirst({
        where: { managerId, orderId }
      });
      if (!order) throw new NotFoundException("충전 주문을 찾을 수 없습니다.");

      if (
        garaManagerVendorId &&
        order.garaManagerVendorId !== garaManagerVendorId
      ) {
        topupConflict("Gara 충전 주문의 업체 등록 연결이 변경되었습니다.");
      }

      if (order.amount !== BigInt(amount)) {
        topupConflict("충전 요청 금액이 저장된 주문 금액과 다릅니다.");
      }
      if (claimed.count === 1) {
        return { outcome: "CLAIMED", order: mapCreditTopupOrder(order) };
      }

      if (order.paymentKey !== null && order.paymentKey !== paymentKey) {
        topupConflict("충전 주문에 이미 다른 결제 키가 연결되어 있습니다.");
      }
      if (order.status === "APPROVED") {
        return {
          outcome: "ALREADY_APPROVED",
          order: mapCreditTopupOrder(order)
        };
      }
      if (order.status === "CONFIRMING") {
        return { outcome: "IN_PROGRESS", order: mapCreditTopupOrder(order) };
      }
      if (order.status === "RECONCILIATION_REQUIRED") {
        return {
          outcome: "RECONCILIATION_REQUIRED",
          order: mapCreditTopupOrder(order)
        };
      }
      topupConflict(`현재 ${order.status} 상태의 충전 주문은 승인할 수 없습니다.`);
    });
  }

  async finalizeTopup(input: FinalizeTopupCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    const orderId = requireNonblank(input.orderId, "orderId");
    const paymentKey = requireNonblank(
      input.payment.paymentKey,
      "payment.paymentKey"
    );
    const paymentOrderId = requireNonblank(
      input.payment.orderId,
      "payment.orderId"
    );
    const amount = requirePositiveSafeMoney(input.payment.amount, "payment.amount");
    const garaManagerVendorId = input.garaManagerVendorId
      ? requireNonblank(input.garaManagerVendorId, "garaManagerVendorId")
      : undefined;
    const method = requireNonblank(input.payment.method ?? "", "payment.method");
    const approvedAt = new Date(input.payment.approvedAt ?? "");
    if (input.payment.status !== "DONE") {
      throw new BadRequestException("완료되지 않은 Toss 결제는 확정할 수 없습니다.");
    }
    if (paymentOrderId !== orderId) {
      topupConflict("Toss 결제의 주문 번호가 저장된 주문과 다릅니다.");
    }
    if (Number.isNaN(approvedAt.getTime())) {
      throw new BadRequestException("Toss 승인 시각이 올바르지 않습니다.");
    }

    return this.serializable(async (tx) => {
      const order = await tx.creditTopupOrder.findFirst({
        where: { managerId, orderId }
      });
      if (!order) throw new NotFoundException("충전 주문을 찾을 수 없습니다.");
      if (
        garaManagerVendorId &&
        order.garaManagerVendorId !== garaManagerVendorId
      ) {
        topupConflict("Gara 충전 주문의 업체 등록 연결이 변경되었습니다.");
      }
      this.assertPaymentMatches(order, paymentKey, amount);

      const ledgerKey = `topup:${orderId}`;
      if (order.status === "APPROVED") {
        const ledger = await tx.creditLedgerEntry.findUnique({
          where: { idempotencyKey: ledgerKey }
        });
        if (!ledger) {
          throw new ConflictException("승인된 충전 주문의 원장 기록이 없습니다.");
        }
        return {
          order: mapCreditTopupOrder(order),
          ledgerEntryId: ledger.id
        };
      }
      if (
        order.status !== "CONFIRMING" &&
        order.status !== "RECONCILIATION_REQUIRED"
      ) {
        topupConflict(`현재 ${order.status} 상태의 충전 주문은 확정할 수 없습니다.`);
      }

      const accountUpdate = await tx.creditAccount.updateMany({
        where: {
          id: order.creditAccountId,
          balance: { lte: MAX_SAFE_CREDIT_BALANCE - BigInt(amount) }
        },
        data: {
          balance: { increment: BigInt(amount) },
          version: { increment: 1 }
        }
      });
      if (accountUpdate.count !== 1) {
        throw new ConflictException(
          "충전 후 크레딧 잔액이 안전 범위를 초과합니다."
        );
      }
      const account = await tx.creditAccount.findUniqueOrThrow({
        where: { id: order.creditAccountId }
      });
      const ledger = await tx.creditLedgerEntry.create({
        data: {
          id: `credit-ledger-${randomUUID()}`,
          creditAccountId: account.id,
          type: "TOPUP",
          signedAmount: BigInt(amount),
          balanceAfter: account.balance,
          referenceType: "CREDIT_TOPUP_ORDER",
          referenceId: orderId,
          idempotencyKey: ledgerKey
        }
      });
      const approved = await tx.creditTopupOrder.update({
        where: { id: order.id },
        data: {
          status: "APPROVED",
          method,
          failureReason: null,
          approvedAt
        }
      });

      if (order.garaManagerVendorId) {
        const registration = await tx.managerVendor.findUnique({
          where: { id: order.garaManagerVendorId },
          include: { vendor: true }
        });
        if (
          !registration ||
          registration.managerId !== managerId ||
          registration.status !== "ACTIVE" ||
          !registration.vendor.isActive
        ) {
          throw new ConflictException(
            "Gara 업체 등록 상태가 변경되어 충전을 확정할 수 없습니다."
          );
        }
        const accountNumber = registration.settlementAccountNumber?.trim();
        if (!accountNumber) {
          throw new ConflictException(
            "Gara 업체 계좌번호가 없어 충전을 확정할 수 없습니다."
          );
        }

        const now = new Date();
        const debited = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "CreditAccount"
          SET
            "balance" = "balance" - ${BigInt(amount)},
            "version" = "version" + 1,
            "updatedAt" = ${now}
          WHERE "id" = ${account.id}
            AND "balance" >= ${BigInt(amount)}
          RETURNING "id"
        `);
        if (debited.length === 0) {
          throw new ConflictException("크레딧 잔액이 부족합니다.");
        }

        const accountAfterPayout = await tx.creditAccount.findUniqueOrThrow({
          where: { id: account.id }
        });
        const payoutId = `gara-vendor-payout-${randomUUID()}`;
        const payoutKey = `gara-topup-payout:${order.orderId}`;
        const payoutLedger = await tx.creditLedgerEntry.create({
          data: {
            id: `credit-ledger-${randomUUID()}`,
            creditAccountId: account.id,
            type: "MANUAL_DEBIT",
            signedAmount: -BigInt(amount),
            balanceAfter: accountAfterPayout.balance,
            referenceType: "GARA_VENDOR_PAYOUT_REQUEST",
            referenceId: payoutId,
            idempotencyKey: payoutKey
          }
        });
        await tx.garaVendorPayoutRequest.create({
          data: {
            id: payoutId,
            managerId,
            managerVendorId: registration.id,
            vendorId: registration.vendorId,
            creditAccountId: account.id,
            ledgerEntryId: payoutLedger.id,
            topupOrderId: order.id,
            amount: BigInt(amount),
            accountNumberSnapshot: accountNumber,
            status: "CREDIT_DEBITED",
            idempotencyKey: payoutKey,
            payloadHash: canonicalHash({
              amount: String(amount),
              managerId,
              managerVendorId: registration.id,
              topupOrderId: order.id
            }),
            createdAt: now
          }
        });
      }

      await this.events.enqueue(tx, {
        event: {
          eventKey: `credit-topup:${orderId}:approved`,
          type: "MANAGER_CREDIT_TOPUP_SUCCEEDED",
          targetUserIds: [managerId],
          managerId,
          statusCode: "APPROVED",
          occurredAt: approvedAt.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });

      return {
        order: mapCreditTopupOrder(approved),
        ledgerEntryId: ledger.id
      };
    });
  }

  private assertPaymentMatches(
    order: CreditTopupOrder,
    paymentKey: string,
    amount: number
  ) {
    if (order.paymentKey !== paymentKey) {
      topupConflict("Toss 결제 키가 저장된 주문과 다릅니다.");
    }
    if (order.amount !== BigInt(amount)) {
      topupConflict("Toss 결제 금액이 저장된 주문 금액과 다릅니다.");
    }
  }

  async markTopupRejected(input: MarkTopupRejectedCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    const orderId = requireNonblank(input.orderId, "orderId");
    const reason = boundedReason(input.reason);

    return this.serializable(async (tx) => {
      const order = await tx.creditTopupOrder.findFirst({
        where: { managerId, orderId }
      });
      if (!order) throw new NotFoundException("충전 주문을 찾을 수 없습니다.");
      if (order.status === "FAILED") return mapCreditTopupOrder(order);
      if (
        order.status !== "CONFIRMING" &&
        order.status !== "RECONCILIATION_REQUIRED"
      ) {
        topupConflict(`현재 ${order.status} 상태의 충전 주문은 실패 처리할 수 없습니다.`);
      }

      const failed = await tx.creditTopupOrder.update({
        where: { id: order.id },
        data: { status: "FAILED", failureReason: reason }
      });
      const occurredAt = new Date();
      await this.events.enqueue(tx, {
        event: {
          eventKey: `credit-topup:${orderId}:failed`,
          type: "MANAGER_CREDIT_TOPUP_FAILED",
          targetUserIds: [managerId],
          managerId,
          statusCode: "FAILED",
          occurredAt: occurredAt.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });
      return mapCreditTopupOrder(failed);
    });
  }

  async markTopupUncertain(input: MarkTopupUncertainCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    const orderId = requireNonblank(input.orderId, "orderId");
    const reason = boundedReason(input.reason);

    return this.serializable(async (tx) => {
      const order = await tx.creditTopupOrder.findFirst({
        where: { managerId, orderId }
      });
      if (!order) throw new NotFoundException("충전 주문을 찾을 수 없습니다.");
      if (
        order.status === "RECONCILIATION_REQUIRED" ||
        order.status === "APPROVED"
      ) {
        return mapCreditTopupOrder(order);
      }
      if (order.status !== "CONFIRMING") {
        topupConflict(`현재 ${order.status} 상태의 충전 주문은 재확인할 수 없습니다.`);
      }
      const uncertain = await tx.creditTopupOrder.update({
        where: { id: order.id },
        data: { status: "RECONCILIATION_REQUIRED", failureReason: reason }
      });
      return mapCreditTopupOrder(uncertain);
    });
  }

  async cancelReadyTopup(input: CancelReadyTopupCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    const orderId = requireNonblank(input.orderId, "orderId");
    return this.serializable(async (tx) => {
      const cancelled = await tx.creditTopupOrder.updateMany({
        where: { managerId, orderId, status: "READY" },
        data: { status: "CANCELLED", failureReason: null }
      });
      const order = await tx.creditTopupOrder.findFirst({
        where: { managerId, orderId }
      });
      if (!order) throw new NotFoundException("충전 주문을 찾을 수 없습니다.");
      if (cancelled.count === 1 || order.status === "CANCELLED") {
        return mapCreditTopupOrder(order);
      }
      topupConflict(`현재 ${order.status} 상태의 충전 주문은 취소할 수 없습니다.`);
    });
  }

  async saveAutoPayPolicy(input: SaveAutoPayPolicyCommand) {
    const managerId = requireNonblank(input.managerId, "managerId");
    let perRequestLimit: bigint | null = null;
    if (input.mode === "AUTO_DEBIT_UNDER_LIMIT") {
      perRequestLimit = BigInt(
        requirePositiveSafeMoney(
          input.perRequestLimit ?? Number.NaN,
          "perRequestLimit"
        )
      );
    } else if (input.mode === "ALWAYS_REQUIRE_APPROVAL") {
      if (input.perRequestLimit !== undefined) {
        throw new BadRequestException(
          "항상 승인 정책에는 자동결제 한도를 지정할 수 없습니다."
        );
      }
    } else {
      throw new BadRequestException("지원하지 않는 자동결제 정책입니다.");
    }

    return this.serializable(async (tx) => {
      await this.ensureAccountRows(tx, managerId);
      const policy = await tx.autoPayPolicy.update({
        where: { managerId },
        data: { mode: input.mode, perRequestLimit }
      });
      return mapAutoPayPolicy(policy);
    });
  }

  async evaluateAfterCompletion(
    input: EvaluateAfterCompletionCommand
  ): Promise<EvaluateAfterCompletionResult> {
    const managerId = requireNonblank(input.managerId, "managerId");
    const paymentRequestId = requireNonblank(
      input.paymentRequestId,
      "paymentRequestId"
    );
    const completionDecisionId = requireNonblank(
      input.completionDecisionId,
      "completionDecisionId"
    );
    const actorUserId = requireNonblank(input.actorUserId, "actorUserId");

    return this.serializable(async (tx) => {
      const request = await this.loadSettlementRequest(
        tx,
        managerId,
        paymentRequestId
      );
      this.validateSettlementRequest(request, completionDecisionId);

      if (isFinalPaymentStatus(request.status)) {
        return {
          outcome: "ALREADY_FINAL",
          paymentRequestId,
          status: request.status
        };
      }
      if (request.status === "PENDING_APPROVAL") {
        return { outcome: "PENDING_APPROVAL", paymentRequestId };
      }
      if (request.status === "INSUFFICIENT_CREDIT") {
        return { outcome: "INSUFFICIENT_CREDIT", paymentRequestId };
      }
      if (request.status !== "WAITING_COMPLETION") {
        topupConflict(
          `현재 ${request.status} 상태의 지급 요청은 자동 평가할 수 없습니다.`
        );
      }

      await this.ensureAccountRows(tx, managerId);
      const policy = await tx.autoPayPolicy.findUniqueOrThrow({
        where: { managerId }
      });
      const shouldAutoPay =
        policy.mode === "AUTO_DEBIT_UNDER_LIMIT" &&
        policy.perRequestLimit !== null &&
        BigInt(request.amount) <= policy.perRequestLimit;

      if (!shouldAutoPay) {
        await tx.vendorPaymentRequest.update({
          where: { id: paymentRequestId },
          data: {
            status: "PENDING_APPROVAL",
            completionDecisionId,
            failureReason: null,
            lastAttemptMode: null
          }
        });
        await this.appendPaymentState(tx, request, {
          type: "PENDING_APPROVAL",
          eventType: "VENDOR_PAYMENT_PENDING_APPROVAL",
          statusCode: "PENDING_APPROVAL",
          actorUserId,
          completionDecisionId
        });
        return { outcome: "PENDING_APPROVAL", paymentRequestId };
      }

      await this.assertNoActiveTossOrder(tx, paymentRequestId);
      const result = await this.settleLocked(tx, request, {
        managerId,
        paymentRequestId,
        mode: "AUTO_CREDIT",
        idempotencyKey: `auto:${paymentRequestId}:${completionDecisionId}`,
        actorUserId,
        completionDecisionId
      });
      if (result.outcome === "INSUFFICIENT_CREDIT") {
        return { outcome: "INSUFFICIENT_CREDIT", paymentRequestId };
      }
      if (result.outcome === "ALREADY_FINAL") {
        if (!isFinalPaymentStatus(result.request.status)) {
          throw new ConflictException("최종 지급 상태가 올바르지 않습니다.");
        }
        return {
          outcome: "ALREADY_FINAL",
          paymentRequestId,
          status: result.request.status
        };
      }
      if (!result.ledgerEntryId) {
        throw new ConflictException("자동결제 원장 기록이 없습니다.");
      }
      return {
        outcome: "AUTO_PAID",
        paymentRequestId,
        ledgerEntryId: result.ledgerEntryId
      };
    });
  }

  async settlePaymentRequest(
    input: SettlePaymentRequestCommand
  ): Promise<SettlePaymentRequestResult> {
    const managerId = requireNonblank(input.managerId, "managerId");
    const paymentRequestId = requireNonblank(
      input.paymentRequestId,
      "paymentRequestId"
    );
    const actorUserId = requireNonblank(input.actorUserId, "actorUserId");
    const idempotencyKey = requireNonblank(
      input.idempotencyKey,
      "idempotencyKey"
    );
    if (!(["AUTO_CREDIT", "MANUAL_CREDIT", "DIRECT"] as const).includes(input.mode)) {
      throw new BadRequestException("지원하지 않는 지급 방식입니다.");
    }
    let normalizedInput = input;
    if (input.mode === "DIRECT") {
      const paidAt = new Date(input.paidAt);
      if (!Number.isFinite(paidAt.getTime())) {
        throw new BadRequestException("외부 지급 시각이 올바르지 않습니다.");
      }
      if (paidAt.getTime() > Date.now()) {
        throw new BadRequestException("외부 지급 시각은 현재보다 이후일 수 없습니다.");
      }
      const reference = requireNonblank(input.reference, "외부 지급 거래참조");
      if (reference.length > 120) {
        throw new BadRequestException("외부 지급 거래참조는 120자 이하여야 합니다.");
      }
      normalizedInput = {
        ...input,
        paidAt: paidAt.toISOString(),
        reference
      };
    }

    return this.serializable(async (tx) => {
      const request = await this.loadSettlementRequest(
        tx,
        managerId,
        paymentRequestId
      );
      const decisionId =
        normalizedInput.completionDecisionId ?? request.completionDecisionId;
      if (!decisionId) {
        throw new ConflictException("승인된 완료 결정이 지급 요청에 없습니다.");
      }
      this.validateSettlementRequest(request, decisionId);
      if (
        normalizedInput.mode === "DIRECT" &&
        request.completionDecision &&
        new Date(normalizedInput.paidAt).getTime() <
          request.completionDecision.decidedAt.getTime()
      ) {
        throw new BadRequestException(
          "외부 지급 시각은 완료 승인 시각보다 빠를 수 없습니다."
        );
      }

      const payloadHash = this.paymentAttemptHash({
        managerId,
        paymentRequestId,
        mode: normalizedInput.mode,
        idempotencyKey,
        actorUserId,
        completionDecisionId: decisionId,
        ...(normalizedInput.mode === "DIRECT"
          ? {
              paidAt: normalizedInput.paidAt,
              reference: normalizedInput.reference
            }
          : {})
      });
      const existing = await tx.vendorPaymentAttempt.findUnique({
        where: { idempotencyKey }
      });
      if (existing) {
        if (
          existing.paymentRequestId !== paymentRequestId ||
          existing.mode !== normalizedInput.mode ||
          existing.payloadHash !== payloadHash
        ) {
          topupConflict(
            "동일한 idempotencyKey로 다른 지급 요청을 처리할 수 없습니다."
          );
        }
        const persisted = await tx.vendorPaymentRequest.findUniqueOrThrow({
          where: { id: paymentRequestId }
        });
        if (isFinalPaymentStatus(persisted.status)) {
          return {
            outcome: "ALREADY_FINAL",
            request: mapVendorPaymentRequest(persisted)
          };
        }
        if (existing.status === "INSUFFICIENT_CREDIT") {
          return {
            outcome: "INSUFFICIENT_CREDIT",
            request: mapVendorPaymentRequest(persisted)
          };
        }
        return {
          outcome: "ALREADY_FINAL",
          request: mapVendorPaymentRequest(persisted)
        };
      }

      if (isFinalPaymentStatus(request.status)) {
        return {
          outcome: "ALREADY_FINAL",
          request: mapVendorPaymentRequest(request)
        };
      }
      if (
        normalizedInput.mode !== "AUTO_CREDIT" &&
        request.status !== "PENDING_APPROVAL" &&
        request.status !== "INSUFFICIENT_CREDIT"
      ) {
        topupConflict(
          `현재 ${request.status} 상태의 지급 요청은 수동 결제할 수 없습니다.`
        );
      }
      if (normalizedInput.mode === "AUTO_CREDIT" && request.status !== "WAITING_COMPLETION") {
        topupConflict(
          `현재 ${request.status} 상태의 지급 요청은 자동 결제할 수 없습니다.`
        );
      }

      await this.assertNoActiveTossOrder(tx, paymentRequestId);

      await this.ensureAccountRows(tx, managerId);
      return this.settleLocked(tx, request, {
        ...normalizedInput,
        completionDecisionId: decisionId
      });
    });
  }

  async reverseCreditPayment(input: VendorPaymentCorrectionCommand) {
    return this.runCorrection(input, "CREDIT_REVERSAL", async (tx, request, normalized) => {
      if (
        request.status !== "AUTO_PAID" &&
        request.status !== "MANUAL_CREDIT_PAID"
      ) {
        topupConflict("확정된 크레딧 결제만 취소할 수 있습니다.");
      }
      if (!request.ledgerEntry || !request.ledgerEntryId) {
        throw new ConflictException("취소할 크레딧 결제 원장을 찾을 수 없습니다.");
      }
      if (
        request.ledgerEntry.type !== "AUTO_DEBIT" &&
        request.ledgerEntry.type !== "MANUAL_DEBIT"
      ) {
        throw new ConflictException("원본 크레딧 차감 기록이 올바르지 않습니다.");
      }
      if (
        request.ledgerEntry.referenceType !== "VENDOR_PAYMENT_REQUEST" ||
        request.ledgerEntry.referenceId !== request.id ||
        request.ledgerEntry.signedAmount !== -BigInt(request.amount)
      ) {
        throw new ConflictException("지급 요청과 크레딧 차감 원장이 일치하지 않습니다.");
      }

      const now = new Date();
      const reversalAmount = -request.ledgerEntry.signedAmount;
      const accounts = await tx.$queryRaw<Array<{ id: string; balance: bigint }>>(
        Prisma.sql`
          UPDATE "CreditAccount"
          SET
            "balance" = "balance" + ${reversalAmount},
            "version" = "version" + 1,
            "updatedAt" = ${now}
          WHERE "id" = ${request.ledgerEntry.creditAccountId}
            AND "managerId" = ${request.managerId}
            AND "balance" <= ${MAX_SAFE_CREDIT_BALANCE - reversalAmount}
          RETURNING "id", "balance"
        `
      );
      if (accounts.length !== 1) {
        const account = await tx.creditAccount.findFirst({
          where: {
            id: request.ledgerEntry.creditAccountId,
            managerId: request.managerId
          },
          select: { id: true }
        });
        if (!account) {
          throw new ConflictException("크레딧 계좌를 찾을 수 없습니다.");
        }
        throw new ConflictException(
          "취소 후 크레딧 잔액이 안전 범위를 초과합니다."
        );
      }

      await tx.creditLedgerEntry.create({
        data: {
          id: `credit-ledger-${randomUUID()}`,
          creditAccountId: accounts[0].id,
          type: "REVERSAL",
          signedAmount: reversalAmount,
          balanceAfter: accounts[0].balance,
          referenceType: "VENDOR_PAYMENT_REQUEST",
          referenceId: request.id,
          idempotencyKey: `credit-reversal:${normalized.idempotencyKey}`,
          reversesLedgerEntryId: request.ledgerEntryId
        }
      });
      await this.voidAuthoritativeCost(tx, request, normalized.note, now);
      return this.finishCorrection(tx, request, normalized, {
        commandType: "CREDIT_REVERSAL",
        status: "REVERSED",
        auditType: "CREDIT_REVERSED",
        eventType: "VENDOR_PAYMENT_REVERSED",
        now
      });
    });
  }

  async voidDirectPayment(input: VendorPaymentCorrectionCommand) {
    return this.runCorrection(input, "DIRECT_VOID", async (tx, request, normalized) => {
      if (request.status !== "DIRECT_PAID") {
        topupConflict("확정된 직접 결제만 취소할 수 있습니다.");
      }
      if (request.ledgerEntryId !== null) {
        throw new ConflictException("직접 결제 요청에 크레딧 원장이 연결되어 있습니다.");
      }
      const now = new Date();
      await this.voidAuthoritativeCost(tx, request, normalized.note, now);
      return this.finishCorrection(tx, request, normalized, {
        commandType: "DIRECT_VOID",
        status: "DIRECT_PAYMENT_VOIDED",
        auditType: "DIRECT_PAYMENT_VOIDED",
        eventType: "VENDOR_DIRECT_PAYMENT_VOIDED",
        now
      });
    });
  }

  async cancelPaymentRequest(input: VendorPaymentCorrectionCommand) {
    return this.runCorrection(input, "PAYMENT_CANCEL", async (tx, request, normalized) => {
      await this.assertNoActiveTossOrder(tx, request.id);
      if (
        request.status !== "PENDING_APPROVAL" &&
        request.status !== "INSUFFICIENT_CREDIT"
      ) {
        topupConflict("승인 대기 또는 잔액 부족 지급 요청만 취소할 수 있습니다.");
      }
      if (request.costId !== null || request.ledgerEntryId !== null) {
        throw new ConflictException("이미 비용 또는 크레딧 원장이 생성된 요청입니다.");
      }
      return this.finishCorrection(tx, request, normalized, {
        commandType: "PAYMENT_CANCEL",
        status: "CANCELLED",
        auditType: "CANCELLED",
        eventType: "VENDOR_PAYMENT_CANCELLED",
        now: new Date()
      });
    });
  }

  private async assertNoActiveTossOrder(
    tx: Prisma.TransactionClient,
    paymentRequestId: string
  ) {
    const active = await tx.repairPaymentOrder.findUnique({
      where: { openOrderKey: paymentRequestId },
      select: { status: true }
    });
    if (
      active &&
      (active.status === "READY" ||
        active.status === "CONFIRMING" ||
        active.status === "RECONCILIATION_REQUIRED")
    ) {
      throw new ConflictException(
        "진행 중인 Toss 결제 주문을 먼저 완료하거나 취소해야 합니다."
      );
    }
  }

  private async runCorrection(
    input: VendorPaymentCorrectionCommand,
    commandType: "CREDIT_REVERSAL" | "DIRECT_VOID" | "PAYMENT_CANCEL",
    execute: (
      tx: Prisma.TransactionClient,
      request: CorrectionRequest,
      input: VendorPaymentCorrectionCommand & { payloadHash: string }
    ) => Promise<ReturnType<typeof mapVendorPaymentRequest>>
  ) {
    const normalized = {
      managerId: requireNonblank(input.managerId, "managerId"),
      paymentRequestId: requireNonblank(input.paymentRequestId, "paymentRequestId"),
      idempotencyKey: requireNonblank(input.idempotencyKey, "idempotencyKey"),
      actorUserId: requireNonblank(input.actorUserId, "actorUserId"),
      note: boundedReason(input.note)
    };
    const payloadHash = canonicalHash({
      ...normalized,
      commandType
    });

    return this.serializable(async (tx) => {
      const request = await this.loadCorrectionRequest(
        tx,
        normalized.managerId,
        normalized.paymentRequestId
      );
      const receipt = await tx.vendorPaymentCommandReceipt.findUnique({
        where: { idempotencyKey: normalized.idempotencyKey }
      });
      if (receipt) {
        if (
          receipt.paymentRequestId !== normalized.paymentRequestId ||
          receipt.commandType !== commandType ||
          receipt.payloadHash !== payloadHash
        ) {
          topupConflict(
            "동일한 idempotencyKey로 다른 지급 정정 요청을 처리할 수 없습니다."
          );
        }
        return mapVendorPaymentRequest(request);
      }
      return execute(tx, request, { ...normalized, payloadHash });
    });
  }

  private async loadCorrectionRequest(
    tx: Prisma.TransactionClient,
    managerId: string,
    paymentRequestId: string
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "VendorPaymentRequest"
      WHERE "id" = ${paymentRequestId} AND "managerId" = ${managerId}
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw new NotFoundException("업체 지급 요청을 찾을 수 없습니다.");
    }
    return tx.vendorPaymentRequest.findUniqueOrThrow({
      where: { id: paymentRequestId },
      include: { cost: true, ledgerEntry: true }
    });
  }

  private async voidAuthoritativeCost(
    tx: Prisma.TransactionClient,
    request: CorrectionRequest,
    note: string,
    now: Date
  ) {
    const expectedPaymentReference =
      request.status === "DIRECT_PAID"
        ? request.directPaymentReference
        : request.repairId;
    if (
      !request.cost ||
      !request.costId ||
      request.cost.status !== "CONFIRMED" ||
      request.cost.managerId !== request.managerId ||
      !expectedPaymentReference ||
      request.cost.paymentRef !== expectedPaymentReference ||
      request.cost.amount !== request.amount ||
      request.cost.repairPayment !== "ALREADY_PAID"
    ) {
      throw new ConflictException("확정된 업체 지급 비용을 찾을 수 없습니다.");
    }
    await tx.cost.update({
      where: { id: request.costId },
      data: { status: "VOID", voidReason: note, updatedAt: now }
    });
  }

  private async finishCorrection(
    tx: Prisma.TransactionClient,
    request: CorrectionRequest,
    input: VendorPaymentCorrectionCommand & { payloadHash: string },
    state: {
      commandType: "CREDIT_REVERSAL" | "DIRECT_VOID" | "PAYMENT_CANCEL";
      status: "REVERSED" | "DIRECT_PAYMENT_VOIDED" | "CANCELLED";
      auditType: "CREDIT_REVERSED" | "DIRECT_PAYMENT_VOIDED" | "CANCELLED";
      eventType:
        | "VENDOR_PAYMENT_REVERSED"
        | "VENDOR_DIRECT_PAYMENT_VOIDED"
        | "VENDOR_PAYMENT_CANCELLED";
      now: Date;
    }
  ) {
    const updated = await tx.vendorPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: state.status,
        failureReason: null,
        processedAt: state.now
      }
    });
    await tx.vendorPaymentCommandReceipt.create({
      data: {
        id: `vendor-payment-command-${randomUUID()}`,
        idempotencyKey: input.idempotencyKey,
        paymentRequestId: request.id,
        commandType: state.commandType,
        payloadHash: input.payloadHash,
        resultStatus: state.status
      }
    });
    await tx.vendorPaymentAuditEvent.create({
      data: {
        id: `vendor-payment-audit-${randomUUID()}`,
        paymentRequestId: request.id,
        type: state.auditType,
        dedupeKey: `vendor-payment:${request.id}:${state.status}`,
        actorUserId: input.actorUserId,
        note: input.note
      }
    });
    const links = await tx.vendorAccountLink.findMany({
      where: {
        vendorId: request.vendorId,
        status: "ACTIVE",
        user: { status: "ACTIVE" }
      },
      select: { userId: true }
    });
    await this.events.enqueue(tx, {
      event: {
        eventKey: `vendor-payment:${request.id}:${state.status}`,
        type: state.eventType,
        targetUserIds: [...new Set(links.map(({ userId }) => userId))].sort(),
        vendorId: request.vendorId,
        managerId: request.managerId,
        repairId: request.repairId,
        paymentRequestId: request.id,
        ...(request.completionDecisionId
          ? { completionDecisionId: request.completionDecisionId }
          : {}),
        actorUserId: input.actorUserId,
        statusCode: state.status,
        occurredAt: state.now.toISOString()
      },
      consumers: ["NOTIFICATION"]
    });
    return mapVendorPaymentRequest(updated);
  }

  private async loadSettlementRequest(
    tx: Prisma.TransactionClient,
    managerId: string,
    paymentRequestId: string
  ): Promise<SettlementRequest> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "VendorPaymentRequest"
      WHERE "id" = ${paymentRequestId} AND "managerId" = ${managerId}
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw new NotFoundException("업체 지급 요청을 찾을 수 없습니다.");
    }

    return tx.vendorPaymentRequest.findUniqueOrThrow({
      where: { id: paymentRequestId },
      include: {
        repair: {
          include: {
            ticket: { include: { room: true } },
            completionReports: {
              orderBy: [{ version: "desc" }, { submittedAt: "desc" }]
            },
            estimates: { where: { status: "APPROVED" } }
          }
        },
        approvedEstimate: true,
        completionReport: true,
        completionDecision: true
      }
    });
  }

  private validateSettlementRequest(
    request: SettlementRequest,
    completionDecisionId: string
  ) {
    const latestReport = request.repair.completionReports[0];
    const decision = request.completionDecision;
    const approvedEstimate = request.approvedEstimate;
    if (
      !latestReport ||
      latestReport.id !== request.completionReportId ||
      request.completionReport.id !== latestReport.id
    ) {
      throw new ConflictException("최신 완료보고서와 지급 요청이 일치하지 않습니다.");
    }
    if (
      !decision ||
      decision.id !== completionDecisionId ||
      request.completionDecisionId !== completionDecisionId ||
      decision.completionReportId !== request.completionReportId ||
      decision.repairId !== request.repairId ||
      decision.source !== "MANAGER" ||
      decision.decision !== "APPROVED" ||
      decision.managerId !== request.managerId
    ) {
      throw new ConflictException("관리자 완료 승인과 지급 요청이 일치하지 않습니다.");
    }
    if (
      request.repair.costBearer !== "LANDLORD" ||
      request.repair.ticket.room.landlordId !== request.managerId
    ) {
      throw new ConflictException("관리자 부담 수리만 업체 지급이 가능합니다.");
    }
    if (
      approvedEstimate.status !== "APPROVED" ||
      approvedEstimate.responseType !== "FIXED_ESTIMATE" ||
      approvedEstimate.repairId !== request.repairId ||
      approvedEstimate.totalAmount !== request.amount ||
      !request.repair.estimates.some(
        (estimate) => estimate.id === request.approvedEstimateId
      )
    ) {
      throw new ConflictException("승인 견적과 지급 금액이 일치하지 않습니다.");
    }
    if (
      !Number.isInteger(request.amount) ||
      request.amount <= 0 ||
      request.amount > 2_147_483_647
    ) {
      throw new ConflictException("지급 금액이 허용 범위를 벗어났습니다.");
    }
  }

  private paymentAttemptHash(input: {
    managerId: string;
    paymentRequestId: string;
    mode: string;
    idempotencyKey: string;
    actorUserId: string;
    completionDecisionId: string;
    paidAt?: string;
    reference?: string;
  }) {
    return canonicalHash(
      Object.fromEntries(
        Object.entries(input).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      )
    );
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

  private async appendPaymentState(
    tx: Prisma.TransactionClient,
    request: SettlementRequest,
    state: {
      type:
        | "PENDING_APPROVAL"
        | "INSUFFICIENT_CREDIT"
        | "AUTO_PAID"
        | "MANUAL_CREDIT_PAID"
        | "DIRECT_PAID";
      eventType:
        | "VENDOR_PAYMENT_PENDING_APPROVAL"
        | "VENDOR_PAYMENT_INSUFFICIENT_CREDIT"
        | "VENDOR_PAYMENT_PAID";
      statusCode: string;
      actorUserId: string;
      completionDecisionId: string;
    }
  ) {
    const occurredAt = new Date();
    const audit = await tx.vendorPaymentAuditEvent.createMany({
      data: {
        id: `vendor-payment-audit-${randomUUID()}`,
        paymentRequestId: request.id,
        type: state.type,
        dedupeKey: `vendor-payment:${request.id}:${state.statusCode}`,
        actorUserId: state.actorUserId
      },
      skipDuplicates: true
    });
    if (audit.count === 0) return;
    const targetUserIds = await this.activeVendorUserIds(tx, request.vendorId);
    await this.events.enqueue(tx, {
      event: {
        eventKey: `vendor-payment:${request.id}:${state.statusCode}`,
        type: state.eventType,
        targetUserIds,
        vendorId: request.vendorId,
        managerId: request.managerId,
        repairId: request.repairId,
        paymentRequestId: request.id,
        completionDecisionId: state.completionDecisionId,
        actorUserId: state.actorUserId,
        statusCode: state.statusCode,
        occurredAt: occurredAt.toISOString()
      },
      consumers: ["NOTIFICATION"]
    });
  }

  private async settleLocked(
    tx: Prisma.TransactionClient,
    request: SettlementRequest,
    input: SettlePaymentRequestCommand & { completionDecisionId: string }
  ): Promise<SettlePaymentRequestResult> {
    const payloadHash = this.paymentAttemptHash({
      managerId: input.managerId,
      paymentRequestId: input.paymentRequestId,
      mode: input.mode,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId,
      completionDecisionId: input.completionDecisionId,
      ...(input.mode === "DIRECT"
        ? { paidAt: input.paidAt, reference: input.reference }
        : {})
    });
    const now = new Date();

    let ledgerEntryId: string | undefined;
    if (input.mode !== "DIRECT") {
      const balances = await tx.$queryRaw<
        Array<{ id: string; balance: bigint }>
      >(Prisma.sql`
        UPDATE "CreditAccount"
        SET
          "balance" = "balance" - ${BigInt(request.amount)},
          "version" = "version" + 1,
          "updatedAt" = ${now}
        WHERE "managerId" = ${request.managerId}
          AND "balance" >= ${BigInt(request.amount)}
        RETURNING "id", "balance"
      `);

      if (balances.length === 0) {
        await tx.vendorPaymentAttempt.create({
          data: {
            id: `vendor-payment-attempt-${randomUUID()}`,
            paymentRequestId: request.id,
            completionDecisionId: input.completionDecisionId,
            mode: input.mode,
            status: "INSUFFICIENT_CREDIT",
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            actorUserId: input.actorUserId,
            failureReason: "INSUFFICIENT_CREDIT",
            completedAt: now
          }
        });
        const insufficient = await tx.vendorPaymentRequest.update({
          where: { id: request.id },
          data: {
            status: "INSUFFICIENT_CREDIT",
            completionDecisionId: input.completionDecisionId,
            failureReason: "크레딧 잔액이 부족합니다.",
            lastAttemptMode: input.mode
          }
        });
        await this.appendPaymentState(tx, request, {
          type: "INSUFFICIENT_CREDIT",
          eventType: "VENDOR_PAYMENT_INSUFFICIENT_CREDIT",
          statusCode: "INSUFFICIENT_CREDIT",
          actorUserId: input.actorUserId,
          completionDecisionId: input.completionDecisionId
        });
        return {
          outcome: "INSUFFICIENT_CREDIT",
          request: mapVendorPaymentRequest(insufficient)
        };
      }

      ledgerEntryId = `credit-ledger-${randomUUID()}`;
      await tx.creditLedgerEntry.create({
        data: {
          id: ledgerEntryId,
          creditAccountId: balances[0].id,
          type:
            input.mode === "AUTO_CREDIT" ? "AUTO_DEBIT" : "MANUAL_DEBIT",
          signedAmount: -BigInt(request.amount),
          balanceAfter: balances[0].balance,
          referenceType: "VENDOR_PAYMENT_REQUEST",
          referenceId: request.id,
          idempotencyKey: `payment:${input.idempotencyKey}`
        }
      });
    }

    const requestStatus =
      input.mode === "AUTO_CREDIT"
        ? "AUTO_PAID"
        : input.mode === "MANUAL_CREDIT"
          ? "MANUAL_CREDIT_PAID"
          : "DIRECT_PAID";
    const unitId = request.repair.ticket.room.roomNo.trim().replace(/호$/u, "");
    const costId = `cost_vendor_payment_${request.id}`;
    await tx.cost.create({
      data: {
        id: costId,
        managerId: request.managerId,
        date: input.mode === "DIRECT"
          ? new Date(input.paidAt)
          : request.completionReport.completedAt,
        item: `${unitId} ${request.repair.title}`,
        amount: request.amount,
        type: "REPAIR",
        scope: "UNIT",
        unitId,
        status: "CONFIRMED",
        verified: true,
        repairPayment: "ALREADY_PAID",
        paymentRef:
          input.mode === "DIRECT" ? input.reference : request.repairId,
        createdAt: now,
        updatedAt: now
      }
    });
    await tx.vendorPaymentAttempt.create({
      data: {
        id: `vendor-payment-attempt-${randomUUID()}`,
        paymentRequestId: request.id,
        completionDecisionId: input.completionDecisionId,
        mode: input.mode,
        status: "SUCCEEDED",
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        actorUserId: input.actorUserId,
        ...(ledgerEntryId ? { ledgerEntryId } : {}),
        completedAt: now
      }
    });
    const paid = await tx.vendorPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: requestStatus,
        completionDecisionId: input.completionDecisionId,
        costId,
        ledgerEntryId: ledgerEntryId ?? null,
        failureReason: null,
        lastAttemptMode: input.mode,
        ...(input.mode === "DIRECT"
          ? {
              directPaidAt: new Date(input.paidAt),
              directPaymentReference: input.reference
            }
          : {}),
        processedAt: now
      }
    });
    await this.appendPaymentState(tx, request, {
      type: requestStatus,
      eventType: "VENDOR_PAYMENT_PAID",
      statusCode: requestStatus,
      actorUserId: input.actorUserId,
      completionDecisionId: input.completionDecisionId
    });
    return {
      outcome: "PAID",
      request: mapVendorPaymentRequest(paid),
      ...(ledgerEntryId ? { ledgerEntryId } : {})
    };
  }
}
