import type {
  ManagerAutoPayPolicyView,
  ManagerCreditAccountPublicView,
  ManagerCreditWorkspacePublicView,
  ManagerGaraVendorPayoutRequestPublicView,
  ManagerVendorPaymentRequestPublicView,
} from "@roomlog/types";
import type { CreditReadResult } from "@/lib/vendor-credit-api";

export type CreditWorkspaceView = {
  account: ManagerCreditAccountPublicView;
  policy: ManagerAutoPayPolicyView;
  ledgerEntries: Array<
    Pick<
      ManagerCreditWorkspacePublicView["ledgerEntries"][number],
      "type" | "signedAmount" | "balanceAfter" | "referenceType" | "createdAt"
    > & { rowKey: string }
  >;
  topupOrders: Array<
    Pick<
      ManagerCreditWorkspacePublicView["topupOrders"][number],
      "orderId" | "amount" | "status" | "method" | "failureReason" | "createdAt"
    >
  >;
  paymentRequests: Array<
    Pick<
      ManagerVendorPaymentRequestPublicView,
      | "id"
      | "repairId"
      | "ticketId"
      | "vendorName"
      | "repairTitle"
      | "roomLabel"
      | "amount"
      | "status"
      | "failureReason"
      | "createdAt"
      | "processedAt"
      | "latestRepairPaymentOrder"
    >
  >;
  garaPayoutRequests: Array<ManagerGaraVendorPayoutRequestPublicView>;
  nextLedgerCursor?: string;
  nextTopupCursor?: string;
  nextPaymentCursor?: string;
};

export type CreditWorkspaceViewResult = {
  data: CreditWorkspaceView;
  source: "API" | "DEMO";
};

export function toCreditWorkspaceView(
  result: CreditReadResult<ManagerCreditWorkspacePublicView>,
): CreditWorkspaceViewResult {
  const { data } = result;
  return {
    source: result.source,
    data: {
      account: {
        balance: data.account.balance,
        updatedAt: data.account.updatedAt,
      },
      policy: data.policy,
      ledgerEntries: data.ledgerEntries.map((entry) => ({
        rowKey: [
          "ledger",
          entry.createdAt,
          entry.type,
          entry.signedAmount,
          entry.balanceAfter,
          entry.referenceType,
        ].join("-"),
        type: entry.type,
        signedAmount: entry.signedAmount,
        balanceAfter: entry.balanceAfter,
        referenceType: entry.referenceType,
        createdAt: entry.createdAt,
      })),
      topupOrders: data.topupOrders.map((order) => ({
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
        ...(order.method ? { method: order.method } : {}),
        ...(order.failureReason ? { failureReason: order.failureReason } : {}),
        createdAt: order.createdAt,
      })),
      paymentRequests: data.paymentRequests.map((request) => ({
        id: request.id,
        repairId: request.repairId,
        ...(request.ticketId ? { ticketId: request.ticketId } : {}),
        ...(request.vendorName ? { vendorName: request.vendorName } : {}),
        ...(request.repairTitle ? { repairTitle: request.repairTitle } : {}),
        ...(request.roomLabel ? { roomLabel: request.roomLabel } : {}),
        amount: request.amount,
        status: request.status,
        ...(request.failureReason ? { failureReason: request.failureReason } : {}),
        createdAt: request.createdAt,
        ...(request.processedAt ? { processedAt: request.processedAt } : {}),
        ...(request.latestRepairPaymentOrder
          ? { latestRepairPaymentOrder: request.latestRepairPaymentOrder }
          : {}),
      })),
      garaPayoutRequests: data.garaPayoutRequests,
      ...(data.nextLedgerCursor ? { nextLedgerCursor: data.nextLedgerCursor } : {}),
      ...(data.nextTopupCursor ? { nextTopupCursor: data.nextTopupCursor } : {}),
      ...(data.nextPaymentCursor ? { nextPaymentCursor: data.nextPaymentCursor } : {}),
    },
  };
}
