export type RepairPaymentPayerRole = "MANAGER" | "TENANT";
export type RepairPaymentFlow = "TOSS_ONE_TIME";
export type RepairPaymentInitiator = "USER_UI" | "AI_AGENT" | "SYSTEM_POLICY";
export type RepairPaymentOrderStatus =
  | "READY"
  | "CONFIRMING"
  | "RECONCILIATION_REQUIRED"
  | "APPROVED"
  | "FAILED"
  | "CANCELLED";

export interface RepairPaymentOrderView {
  id: string;
  orderId: string;
  paymentRequestId: string;
  payerRole: RepairPaymentPayerRole;
  payerUserId: string;
  flow: RepairPaymentFlow;
  amount: number;
  status: RepairPaymentOrderStatus;
  paymentKey?: string;
  method?: string;
  failureReason?: string;
  returnPath: string;
  initiatedBy: RepairPaymentInitiator;
  confirmationId?: string;
  toolCallId?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RepairPaymentOrderPublicView = Omit<
  RepairPaymentOrderView,
  "id" | "paymentKey" | "payerUserId" | "confirmationId" | "toolCallId"
>;

export interface CreateRepairPaymentOrderInput {
  creationKey: string;
  returnPath: string;
}

export interface RetryRepairPaymentOrderInput {
  creationKey: string;
  returnPath: string;
}

export interface ConfirmRepairPaymentOrderInput {
  paymentKey: string;
  amount: number;
}

export interface RepairPaymentCheckout {
  order: RepairPaymentOrderPublicView;
  clientKey: string;
  customerKey: string;
  orderName: "집우집주 수리비 결제";
}
