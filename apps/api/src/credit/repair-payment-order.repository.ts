import type {
  RepairPaymentInitiator,
  RepairPaymentOrderView,
  RepairPaymentPayerRole
} from "@roomlog/types";
import type { TossPaymentSnapshot } from "../payment/toss-payment.gateway";

export const REPAIR_PAYMENT_ORDER_REPOSITORY = Symbol(
  "REPAIR_PAYMENT_ORDER_REPOSITORY"
);

export interface RepairPaymentActor {
  payerRole: RepairPaymentPayerRole;
  payerUserId: string;
  initiatedBy: RepairPaymentInitiator;
  confirmationId?: string;
  toolCallId?: string;
}

export type CreateRepairPaymentOrderCommand = Readonly<{
  paymentRequestId: string;
  creationKey: string;
  returnPath: string;
}>;

export type ClaimRepairPaymentConfirmationCommand = Readonly<{
  orderId: string;
  paymentKey: string;
  amount: number;
}>;

export type RepairPaymentConfirmationClaim =
  | { outcome: "CLAIMED"; order: RepairPaymentOrderView }
  | { outcome: "ALREADY_APPROVED"; order: RepairPaymentOrderView }
  | { outcome: "IN_PROGRESS"; order: RepairPaymentOrderView }
  | { outcome: "RECONCILIATION_REQUIRED"; order: RepairPaymentOrderView };

export type FinalizeRepairPaymentOrderCommand = Readonly<{
  orderId: string;
  payment: TossPaymentSnapshot;
}>;

export type ExplainRepairPaymentOrderCommand = Readonly<{
  orderId: string;
  reason: string;
}>;

export type CancelRepairPaymentOrderCommand = Readonly<{
  orderId: string;
}>;

export type RetryRepairPaymentOrderCommand = Readonly<{
  orderId: string;
  creationKey: string;
  returnPath: string;
}>;

export interface RepairPaymentOrderRepository {
  assertTenantAccess(actor: RepairPaymentActor): Promise<void>;
  createOrder(
    actor: RepairPaymentActor,
    input: CreateRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView>;
  getOrder(
    actor: RepairPaymentActor,
    orderId: string
  ): Promise<RepairPaymentOrderView>;
  claimConfirmation(
    actor: RepairPaymentActor,
    input: ClaimRepairPaymentConfirmationCommand
  ): Promise<RepairPaymentConfirmationClaim>;
  finalizeOrder(
    actor: RepairPaymentActor,
    input: FinalizeRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView>;
  markRejected(
    actor: RepairPaymentActor,
    input: ExplainRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView>;
  markUncertain(
    actor: RepairPaymentActor,
    input: ExplainRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView>;
  cancelOrder(
    actor: RepairPaymentActor,
    input: CancelRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView>;
  retryOrder(
    actor: RepairPaymentActor,
    input: RetryRepairPaymentOrderCommand
  ): Promise<RepairPaymentOrderView>;
}
