import type {
  ManagerCreditAccountView,
  ManagerCreditWorkspace,
} from "@roomlog/types";

const OPENED_AT = "2026-07-01T00:00:00.000Z";
const TOPPED_UP_AT = "2026-07-08T02:30:00.000Z";
const DEBITED_AT = "2026-07-14T06:20:00.000Z";

export const DEMO_MANAGER_CREDIT_ACCOUNT: ManagerCreditAccountView = {
  id: "credit-account-demo-manager",
  balance: 480_000,
  updatedAt: DEBITED_AT,
};

export const DEMO_MANAGER_CREDIT_WORKSPACE: ManagerCreditWorkspace = {
  account: DEMO_MANAGER_CREDIT_ACCOUNT,
  policy: {
    mode: "AUTO_DEBIT_UNDER_LIMIT",
    perRequestLimit: 150_000,
    updatedAt: "2026-07-03T01:00:00.000Z",
  },
  ledgerEntries: [
    {
      id: "credit-ledger-demo-opening",
      type: "OPENING_BALANCE",
      signedAmount: 100_000,
      balanceAfter: 100_000,
      referenceType: "DEMO_SEED",
      referenceId: "credit-account-demo-manager",
      createdAt: OPENED_AT,
    },
    {
      id: "credit-ledger-demo-topup",
      type: "TOPUP",
      signedAmount: 500_000,
      balanceAfter: 600_000,
      referenceType: "CREDIT_TOPUP_ORDER",
      referenceId: "credit-topup-demo-500000",
      createdAt: TOPPED_UP_AT,
    },
    {
      id: "credit-ledger-demo-auto-debit",
      type: "AUTO_DEBIT",
      signedAmount: -120_000,
      balanceAfter: 480_000,
      referenceType: "VENDOR_PAYMENT_REQUEST",
      referenceId: "vendor-payment-demo-120000",
      createdAt: DEBITED_AT,
    },
  ],
  topupOrders: [
    {
      id: "credit-topup-demo-500000",
      orderId: "credit-demo-order-500000",
      amount: 500_000,
      status: "APPROVED",
      paymentKey: "credit-demo-payment-key",
      method: "카드",
      returnPath: "/manager/vendor-mgmt/credit",
      approvedAt: TOPPED_UP_AT,
      createdAt: TOPPED_UP_AT,
      updatedAt: TOPPED_UP_AT,
    },
  ],
  paymentRequests: [
    {
      id: "vendor-payment-demo-120000",
      repairId: "repair-demo-credit-001",
      ticketId: "ticket-demo-credit-001",
      vendorId: "vendor-demo-001",
      vendorName: "룸로그 전기 안전",
      repairTitle: "주방 누전 차단기 교체",
      roomLabel: "정글빌라 301호",
      approvedEstimateId: "estimate-demo-credit-001",
      completionReportId: "completion-demo-credit-001",
      completionDecisionId: "completion-decision-demo-credit-001",
      payerRole: "MANAGER",
      payerUserId: "manager-demo",
      amount: 120_000,
      status: "AUTO_PAID",
      lastAttemptMode: "AUTO_CREDIT",
      ledgerEntryId: "credit-ledger-demo-auto-debit",
      costId: "cost-demo-credit-001",
      createdAt: DEBITED_AT,
      processedAt: DEBITED_AT,
    },
  ],
};
