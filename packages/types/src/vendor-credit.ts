import type {
  VendorPaymentAttemptMode,
  VendorPaymentRequestStatus
} from "./vendor-workflow";
import type {
  RepairPaymentOrderPublicView,
  RepairPaymentOrderView,
  RepairPaymentPayerRole
} from "./repair-payment";

export type CreditLedgerEntryType =
  | "OPENING_BALANCE"
  | "TOPUP"
  | "AUTO_DEBIT"
  | "MANUAL_DEBIT"
  | "REVERSAL";

export type CreditTopupOrderStatus =
  | "READY"
  | "CONFIRMING"
  | "RECONCILIATION_REQUIRED"
  | "APPROVED"
  | "FAILED"
  | "CANCELLED";

export type AutoPayPolicyMode =
  | "ALWAYS_REQUIRE_APPROVAL"
  | "AUTO_DEBIT_UNDER_LIMIT";

export type VendorPaymentSettlementMode = "MANUAL_CREDIT" | "DIRECT";

/** Gara에서 관리자 크레딧을 차감하고 생성하는 업체 지급 요청의 상태. */
export type GaraVendorPayoutStatus = "CREDIT_DEBITED";

export interface CreateGaraVendorPayoutInput {
  managerVendorId: string;
  amount: number;
  idempotencyKey: string;
}

export interface GaraVendorPayoutRequestPublicView {
  id: string;
  amount: number;
  accountNumber: string;
  status: GaraVendorPayoutStatus;
  createdAt: string;
}

export interface CreateGaraVendorPayoutResult {
  request: GaraVendorPayoutRequestPublicView;
  account: ManagerCreditAccountPublicView;
}

export interface GaraVendorCreditPublicView {
  id: string;
  businessName: string;
  phone: string;
  settlementAccountNumber?: string;
  linkedAccount: { name: string; email: string };
  cumulativeCredit: number;
}

export interface CreateGaraVendorCreditCheckoutInput {
  managerVendorId: string;
  amount: number;
  creationKey: string;
}

export interface GaraVendorCreditCheckout {
  order: ManagerCreditTopupOrderPublicView;
  clientKey: string;
  customerKey: string;
  orderName: string;
}

export interface ManagerCreditAccountView {
  id: string;
  balance: number;
  updatedAt: string;
}

export interface ManagerCreditLedgerEntryView {
  id: string;
  type: CreditLedgerEntryType;
  signedAmount: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  reversesLedgerEntryId?: string;
  createdAt: string;
}

export interface ManagerCreditTopupOrderView {
  id: string;
  orderId: string;
  amount: number;
  status: CreditTopupOrderStatus;
  paymentKey?: string;
  method?: string;
  failureReason?: string;
  returnPath: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagerAutoPayPolicyView {
  mode: AutoPayPolicyMode;
  perRequestLimit?: number;
  updatedAt: string;
}

export interface ManagerVendorPaymentRequestView {
  id: string;
  repairId: string;
  ticketId?: string;
  vendorId: string;
  vendorName?: string;
  repairTitle?: string;
  roomLabel?: string;
  approvedEstimateId: string;
  completionReportId: string;
  completionDecisionId?: string;
  payerRole: RepairPaymentPayerRole;
  payerUserId: string;
  amount: number;
  status: VendorPaymentRequestStatus;
  failureReason?: string;
  lastAttemptMode?: VendorPaymentAttemptMode;
  directPaidAt?: string;
  directPaymentReference?: string;
  ledgerEntryId?: string;
  costId?: string;
  createdAt: string;
  processedAt?: string;
  latestRepairPaymentOrder?: RepairPaymentOrderView;
}

export interface ManagerCreditWorkspace {
  account: ManagerCreditAccountView;
  policy: ManagerAutoPayPolicyView;
  ledgerEntries: ManagerCreditLedgerEntryView[];
  topupOrders: ManagerCreditTopupOrderView[];
  paymentRequests: ManagerVendorPaymentRequestView[];
  nextLedgerCursor?: string;
  nextTopupCursor?: string;
  nextPaymentCursor?: string;
}

/** Browser-safe manager credit account; persistence identifiers stay server-side. */
export type ManagerCreditAccountPublicView = Omit<ManagerCreditAccountView, "id">;

export type ManagerCreditLedgerEntryPublicView = Omit<
  ManagerCreditLedgerEntryView,
  "id" | "referenceId" | "reversesLedgerEntryId"
>;

export type ManagerCreditTopupOrderPublicView = Omit<
  ManagerCreditTopupOrderView,
  "id" | "paymentKey"
>;

export type ManagerVendorPaymentRequestPublicView = Pick<
  ManagerVendorPaymentRequestView,
  | "id"
  | "repairId"
  | "ticketId"
  | "vendorName"
  | "repairTitle"
  | "roomLabel"
  | "payerRole"
  | "amount"
  | "status"
  | "failureReason"
  | "directPaidAt"
  | "directPaymentReference"
  | "createdAt"
  | "processedAt"
> & {
  latestRepairPaymentOrder?: RepairPaymentOrderPublicView;
};

export interface ManagerCreditWorkspacePublicView {
  account: ManagerCreditAccountPublicView;
  policy: ManagerAutoPayPolicyView;
  ledgerEntries: ManagerCreditLedgerEntryPublicView[];
  topupOrders: ManagerCreditTopupOrderPublicView[];
  paymentRequests: ManagerVendorPaymentRequestPublicView[];
  nextLedgerCursor?: string;
  nextTopupCursor?: string;
  nextPaymentCursor?: string;
}

export interface CreateManagerCreditTopupInput {
  amount: number;
  creationKey: string;
  returnPath: string;
}

export interface ManagerCreditTopupCheckout {
  order: ManagerCreditTopupOrderPublicView;
  clientKey: string;
  customerKey: string;
  orderName: string;
}

export interface ConfirmManagerCreditTopupInput {
  paymentKey: string;
  amount: number;
}

export interface UpdateAutoPayPolicyInput {
  mode: AutoPayPolicyMode;
  perRequestLimit?: number;
}

export type SettleVendorPaymentRequestInput =
  | {
      mode: "MANUAL_CREDIT";
      idempotencyKey: string;
    }
  | {
      mode: "DIRECT";
      idempotencyKey: string;
      /** 실제 외부 지급 시각(ISO 8601). */
      paidAt: string;
      /** 은행 거래번호·이체 메모 등 관리자가 확인한 외부 지급 근거. */
      reference: string;
    };

export interface ReverseVendorCreditPaymentInput {
  idempotencyKey: string;
  note: string;
}

export interface VoidVendorDirectPaymentInput {
  idempotencyKey: string;
  note: string;
}

export interface CancelVendorPaymentRequestInput {
  idempotencyKey: string;
  note: string;
}
