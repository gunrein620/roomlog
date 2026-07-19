import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  AutoPayPolicy,
  CreditAccount,
  CreditLedgerEntry,
  CreditTopupOrder,
  RepairPaymentOrder,
  VendorPaymentRequest
} from "@prisma/client";
import type {
  GaraVendorCreditPublicView,
  ManagerAutoPayPolicyView,
  ManagerCreditAccountView,
  ManagerCreditLedgerEntryView,
  ManagerCreditTopupOrderView,
  ManagerVendorPaymentRequestView
} from "@roomlog/types";
import { CreditPrismaClient } from "./credit-prisma.client";
import type {
  CreditQueryRepository,
  GaraTopupOrder
} from "./credit-query.repository";
import { mapRepairPaymentOrder } from "./prisma-repair-payment-order.repository";

export function safeCreditNumber(value: bigint, field: string): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const min = BigInt(Number.MIN_SAFE_INTEGER);
  if (value > max || value < min) {
    throw new RangeError(`${field} exceeds the JavaScript safe integer range.`);
  }
  return Number(value);
}

export function mapCreditAccount(row: CreditAccount): ManagerCreditAccountView {
  return {
    id: row.id,
    balance: safeCreditNumber(row.balance, "CreditAccount.balance"),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function mapCreditTopupOrder(
  row: CreditTopupOrder
): ManagerCreditTopupOrderView {
  return {
    id: row.id,
    orderId: row.orderId,
    amount: safeCreditNumber(row.amount, "CreditTopupOrder.amount"),
    status: row.status,
    ...(row.paymentKey === null ? {} : { paymentKey: row.paymentKey }),
    ...(row.method === null ? {} : { method: row.method }),
    ...(row.failureReason === null
      ? {}
      : { failureReason: row.failureReason }),
    returnPath: row.returnPath,
    ...(row.approvedAt === null
      ? {}
      : { approvedAt: row.approvedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapLedgerEntry(
  row: CreditLedgerEntry
): ManagerCreditLedgerEntryView {
  return {
    id: row.id,
    type: row.type,
    signedAmount: safeCreditNumber(
      row.signedAmount,
      "CreditLedgerEntry.signedAmount"
    ),
    balanceAfter: safeCreditNumber(
      row.balanceAfter,
      "CreditLedgerEntry.balanceAfter"
    ),
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    ...(row.reversesLedgerEntryId === null
      ? {}
      : { reversesLedgerEntryId: row.reversesLedgerEntryId }),
    createdAt: row.createdAt.toISOString()
  };
}

export function mapAutoPayPolicy(
  row: AutoPayPolicy
): ManagerAutoPayPolicyView {
  return {
    mode: row.mode,
    ...(row.perRequestLimit === null
      ? {}
      : {
          perRequestLimit: safeCreditNumber(
            row.perRequestLimit,
            "AutoPayPolicy.perRequestLimit"
          )
        }),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function mapVendorPaymentRequest(
  row: VendorPaymentRequest & {
    vendor?: { businessName: string };
    repair?: {
      ticketId: string;
      title: string;
      ticket?: { room: { buildingName: string; roomNo: string } };
    };
    repairPaymentOrders?: RepairPaymentOrder[];
  }
): ManagerVendorPaymentRequestView {
  return {
    id: row.id,
    repairId: row.repairId,
    ...(row.repair ? { ticketId: row.repair.ticketId } : {}),
    vendorId: row.vendorId,
    ...(row.vendor ? { vendorName: row.vendor.businessName } : {}),
    ...(row.repair ? { repairTitle: row.repair.title } : {}),
    ...(row.repair?.ticket
      ? {
          roomLabel: `${row.repair.ticket.room.buildingName} ${row.repair.ticket.room.roomNo}`
        }
      : {}),
    approvedEstimateId: row.approvedEstimateId,
    completionReportId: row.completionReportId,
    ...(row.completionDecisionId === null
      ? {}
      : { completionDecisionId: row.completionDecisionId }),
    payerRole: row.payerRole,
    payerUserId: row.payerUserId,
    amount: row.amount,
    status: row.status,
    ...(row.failureReason === null
      ? {}
      : { failureReason: row.failureReason }),
    ...(row.lastAttemptMode === null
      ? {}
      : { lastAttemptMode: row.lastAttemptMode }),
    ...(row.directPaidAt === null
      ? {}
      : { directPaidAt: row.directPaidAt.toISOString() }),
    ...(row.directPaymentReference === null
      ? {}
      : { directPaymentReference: row.directPaymentReference }),
    ...(row.ledgerEntryId === null
      ? {}
      : { ledgerEntryId: row.ledgerEntryId }),
    ...(row.costId === null ? {} : { costId: row.costId }),
    ...(row.repairPaymentOrders?.[0]
      ? {
          latestRepairPaymentOrder: mapRepairPaymentOrder(
            row.repairPaymentOrders[0]
          )
        }
      : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.processedAt === null
      ? {}
      : { processedAt: row.processedAt.toISOString() })
  };
}

@Injectable()
export class PrismaCreditQueryRepository implements CreditQueryRepository {
  constructor(private readonly database: CreditPrismaClient) {}

  async assertManagerAccess(userId: string): Promise<void> {
    const user = await this.database.client.userAccount.findFirst({
      where: { id: userId, status: "ACTIVE" },
      select: { id: true, role: true }
    });
    if (!user) throw new ForbiddenException("관리자 접근 권한이 없습니다.");
    if (user.role === "LANDLORD") return;

    const ownedRooms = await this.database.client.room.count({
      where: { landlordId: userId }
    });
    if (ownedRooms === 0) {
      throw new ForbiddenException("관리자 접근 권한이 없습니다.");
    }
  }

  async getAccount(managerId: string) {
    const row = await this.database.client.creditAccount.findUnique({
      where: { managerId }
    });
    if (!row) throw new NotFoundException("크레딧 계좌를 찾을 수 없습니다.");
    return mapCreditAccount(row);
  }

  async getTopupOrder(managerId: string, orderId: string) {
    const row = await this.database.client.creditTopupOrder.findFirst({
      where: { managerId, orderId }
    });
    if (!row) throw new NotFoundException("충전 주문을 찾을 수 없습니다.");
    return mapCreditTopupOrder(row);
  }

  async listPublicGaraVendors(): Promise<GaraVendorCreditPublicView[]> {
    const rows = await this.database.client.managerVendor.findMany({
      where: {
        status: "ACTIVE",
        vendor: { isActive: true }
      },
      select: {
        id: true,
        settlementAccountNumber: true,
        manager: { select: { name: true, email: true } },
        vendor: { select: { businessName: true, phone: true } },
        garaVendorPayoutRequests: { select: { amount: true } }
      },
      orderBy: [{ vendor: { businessName: "asc" } }, { id: "asc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      businessName: row.vendor.businessName,
      phone: row.vendor.phone,
      ...(row.settlementAccountNumber === null
        ? {}
        : { settlementAccountNumber: row.settlementAccountNumber }),
      linkedAccount: row.manager,
      cumulativeCredit: row.garaVendorPayoutRequests.reduce(
        (total, payout) =>
          total + safeCreditNumber(payout.amount, "GaraVendorPayoutRequest.amount"),
        0
      )
    }));
  }

  async getGaraTopupOrder(orderId: string): Promise<GaraTopupOrder> {
    const row = await this.database.client.creditTopupOrder.findFirst({
      where: { orderId, garaManagerVendorId: { not: null } }
    });
    if (!row || !row.garaManagerVendorId) {
      throw new NotFoundException("Gara 크레딧 충전 주문을 찾을 수 없습니다.");
    }
    return {
      managerId: row.managerId,
      managerVendorId: row.garaManagerVendorId,
      order: mapCreditTopupOrder(row)
    };
  }

  async getWorkspace(
    managerId: string,
    page: {
      ledgerCursor?: string;
      topupCursor?: string;
      paymentCursor?: string;
      limit?: number;
    } = {}
  ) {
    const requestedLimit = page.limit ?? 30;
    const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 100);

    const [account, policy, ledgerRows, topupOrders, paymentRequests] =
      await Promise.all([
        this.database.client.creditAccount.findUnique({
          where: { managerId }
        }),
        this.database.client.autoPayPolicy.findUnique({
          where: { managerId }
        }),
        this.database.client.creditLedgerEntry.findMany({
          where: { creditAccount: { managerId } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(page.ledgerCursor
            ? { cursor: { id: page.ledgerCursor }, skip: 1 }
            : {})
        }),
        this.database.client.creditTopupOrder.findMany({
          where: { managerId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(page.topupCursor
            ? { cursor: { id: page.topupCursor }, skip: 1 }
            : {})
        }),
        this.database.client.vendorPaymentRequest.findMany({
          where: { managerId },
          include: {
            vendor: { select: { businessName: true } },
            repair: {
              select: {
                ticketId: true,
                title: true,
                ticket: {
                  select: {
                    room: { select: { buildingName: true, roomNo: true } }
                  }
                }
              }
            },
            repairPaymentOrders: {
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
              take: 1
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(page.paymentCursor
            ? { cursor: { id: page.paymentCursor }, skip: 1 }
            : {})
        })
      ]);

    if (!account || !policy) {
      throw new NotFoundException("크레딧 작업공간을 찾을 수 없습니다.");
    }

    const hasNextLedger = ledgerRows.length > limit;
    const hasNextTopup = topupOrders.length > limit;
    const hasNextPayment = paymentRequests.length > limit;
    const visibleLedger = hasNextLedger ? ledgerRows.slice(0, limit) : ledgerRows;
    const visibleTopups = hasNextTopup ? topupOrders.slice(0, limit) : topupOrders;
    const visiblePayments = hasNextPayment
      ? paymentRequests.slice(0, limit)
      : paymentRequests;
    return {
      account: mapCreditAccount(account),
      policy: mapAutoPayPolicy(policy),
      ledgerEntries: visibleLedger.map(mapLedgerEntry),
      topupOrders: visibleTopups.map(mapCreditTopupOrder),
      paymentRequests: visiblePayments.map(mapVendorPaymentRequest),
      ...(hasNextLedger
        ? { nextLedgerCursor: visibleLedger[visibleLedger.length - 1]?.id }
        : {}),
      ...(hasNextTopup
        ? { nextTopupCursor: visibleTopups[visibleTopups.length - 1]?.id }
        : {}),
      ...(hasNextPayment
        ? { nextPaymentCursor: visiblePayments[visiblePayments.length - 1]?.id }
        : {})
    };
  }
}
