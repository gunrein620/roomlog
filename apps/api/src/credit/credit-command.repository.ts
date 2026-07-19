import type {
  AutoPayPolicyMode,
  GaraVendorPayoutRequestPublicView,
  ManagerAutoPayPolicyView,
  ManagerCreditAccountView,
  ManagerCreditTopupOrderView,
  ManagerVendorPaymentRequestView
} from "@roomlog/types";
import type { TossPaymentSnapshot } from "../payment/toss-payment.gateway";

export const CREDIT_COMMAND_REPOSITORY = Symbol("CREDIT_COMMAND_REPOSITORY");

export type CreateTopupOrderCommand = Readonly<{
  managerId: string;
  amount: number;
  creationKey: string;
  returnPath: string;
  garaManagerVendorId?: string;
}>;

export type CreateTopupOrderResult = Readonly<{
  order: ManagerCreditTopupOrderView;
}>;

export type CreateGaraTopupOrderCommand = Readonly<{
  managerVendorId: string;
  amount: number;
  creationKey: string;
  returnPath: "/gara";
}>;

export type CreateGaraTopupOrderResult = Readonly<{
  managerId: string;
  order: ManagerCreditTopupOrderView;
}>;

export type CreateGaraVendorPayoutCommand = Readonly<{
  managerId: string;
  managerVendorId: string;
  amount: number;
  idempotencyKey: string;
}>;

export type CreateGaraVendorPayoutResult = Readonly<{
  request: GaraVendorPayoutRequestPublicView;
  account: ManagerCreditAccountView;
}>;

export type CreatePublicGaraVendorPayoutRequestCommand = Readonly<{
  managerVendorId: string;
  amount: number;
  idempotencyKey: string;
}>;

export type SettleGaraVendorPayoutCommand = Readonly<{
  managerId: string;
  payoutRequestId: string;
  idempotencyKey: string;
}>;

export type ClaimTopupConfirmationCommand = Readonly<{
  managerId: string;
  orderId: string;
  paymentKey: string;
  amount: number;
  garaManagerVendorId?: string;
}>;

export type TopupConfirmationClaim =
  | { outcome: "CLAIMED"; order: ManagerCreditTopupOrderView }
  | { outcome: "ALREADY_APPROVED"; order: ManagerCreditTopupOrderView }
  | { outcome: "IN_PROGRESS"; order: ManagerCreditTopupOrderView }
  | {
      outcome: "RECONCILIATION_REQUIRED";
      order: ManagerCreditTopupOrderView;
    };

export type FinalizeTopupCommand = Readonly<{
  managerId: string;
  orderId: string;
  payment: TossPaymentSnapshot;
  garaManagerVendorId?: string;
}>;

export type FinalizeTopupResult = Readonly<{
  order: ManagerCreditTopupOrderView;
  ledgerEntryId: string;
}>;

export type MarkTopupRejectedCommand = Readonly<{
  managerId: string;
  orderId: string;
  reason: string;
}>;

export type MarkTopupUncertainCommand = Readonly<{
  managerId: string;
  orderId: string;
  reason: string;
}>;

export type CancelReadyTopupCommand = Readonly<{
  managerId: string;
  orderId: string;
}>;

export type SaveAutoPayPolicyCommand = Readonly<{
  managerId: string;
  mode: AutoPayPolicyMode;
  perRequestLimit?: number;
}>;

export type EvaluateAfterCompletionCommand = Readonly<{
  managerId: string;
  paymentRequestId: string;
  completionDecisionId: string;
  actorUserId: string;
}>;

export type EvaluateAfterCompletionResult =
  | {
      outcome: "AUTO_PAID";
      paymentRequestId: string;
      ledgerEntryId: string;
    }
  | {
      outcome: "PENDING_APPROVAL" | "INSUFFICIENT_CREDIT";
      paymentRequestId: string;
    }
  | {
      outcome: "ALREADY_FINAL";
      paymentRequestId: string;
      status:
        | "AUTO_PAID"
        | "MANUAL_CREDIT_PAID"
        | "DIRECT_PAID"
        | "TOSS_PAID"
        | "CANCELLED"
        | "REVERSED"
        | "DIRECT_PAYMENT_VOIDED";
    };

type SettlePaymentRequestCommandBase = Readonly<{
  managerId: string;
  paymentRequestId: string;
  idempotencyKey: string;
  actorUserId: string;
  completionDecisionId?: string;
}>;

export type SettlePaymentRequestCommand =
  | (SettlePaymentRequestCommandBase & Readonly<{
      mode: "AUTO_CREDIT" | "MANUAL_CREDIT";
    }>)
  | (SettlePaymentRequestCommandBase & Readonly<{
      mode: "DIRECT";
      paidAt: string;
      reference: string;
    }>);

export type SettlePaymentRequestResult =
  | {
      outcome: "PAID";
      request: ManagerVendorPaymentRequestView;
      ledgerEntryId?: string;
    }
  | {
      outcome: "INSUFFICIENT_CREDIT";
      request: ManagerVendorPaymentRequestView;
    }
  | {
      outcome: "ALREADY_FINAL";
      request: ManagerVendorPaymentRequestView;
    };

export type VendorPaymentCorrectionCommand = Readonly<{
  managerId: string;
  paymentRequestId: string;
  idempotencyKey: string;
  actorUserId: string;
  note: string;
}>;

export interface CreditCommandRepository {
  ensureAccount(
    input: Readonly<{ managerId: string }>
  ): Promise<ManagerCreditAccountView>;
  createTopupOrder(
    input: CreateTopupOrderCommand
  ): Promise<CreateTopupOrderResult>;
  createGaraTopupOrder(
    input: CreateGaraTopupOrderCommand
  ): Promise<CreateGaraTopupOrderResult>;
  createGaraVendorPayout(
    input: CreateGaraVendorPayoutCommand
  ): Promise<CreateGaraVendorPayoutResult>;
  createPublicGaraVendorPayoutRequest(
    input: CreatePublicGaraVendorPayoutRequestCommand
  ): Promise<GaraVendorPayoutRequestPublicView>;
  settleGaraVendorPayout(
    input: SettleGaraVendorPayoutCommand
  ): Promise<CreateGaraVendorPayoutResult>;
  claimTopupConfirmation(
    input: ClaimTopupConfirmationCommand
  ): Promise<TopupConfirmationClaim>;
  finalizeTopup(input: FinalizeTopupCommand): Promise<FinalizeTopupResult>;
  markTopupRejected(
    input: MarkTopupRejectedCommand
  ): Promise<ManagerCreditTopupOrderView>;
  markTopupUncertain(
    input: MarkTopupUncertainCommand
  ): Promise<ManagerCreditTopupOrderView>;
  cancelReadyTopup(
    input: CancelReadyTopupCommand
  ): Promise<ManagerCreditTopupOrderView>;
  saveAutoPayPolicy(
    input: SaveAutoPayPolicyCommand
  ): Promise<ManagerAutoPayPolicyView>;
  evaluateAfterCompletion(
    input: EvaluateAfterCompletionCommand
  ): Promise<EvaluateAfterCompletionResult>;
  settlePaymentRequest(
    input: SettlePaymentRequestCommand
  ): Promise<SettlePaymentRequestResult>;
  reverseCreditPayment(
    input: VendorPaymentCorrectionCommand
  ): Promise<ManagerVendorPaymentRequestView>;
  voidDirectPayment(
    input: VendorPaymentCorrectionCommand
  ): Promise<ManagerVendorPaymentRequestView>;
  cancelPaymentRequest(
    input: VendorPaymentCorrectionCommand
  ): Promise<ManagerVendorPaymentRequestView>;
}
