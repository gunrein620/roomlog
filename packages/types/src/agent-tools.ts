import type { RepairPaymentOrderStatus } from "./repair-payment";

export const TENANT_AGENT_TOOL_NAMES = [
  "vendor.search_candidates",
  "vendor.prepare_connection",
  "vendor.confirm_connection",
  "vendor.get_workflow",
  "vendor.accept_estimate",
  "vendor.confirm_completion",
  "repair_payment.list_payable",
  "repair_payment.prepare",
  "repair_payment.get",
  "repair_payment.reconcile",
  "repair_payment.cancel",
  "repair_payment.retry",
] as const;

export type TenantAgentToolName = (typeof TENANT_AGENT_TOOL_NAMES)[number];
export type AgentPaymentMethod = "TOSS" | "DIRECT";

export interface AgentToolInvokeInput {
  tool: string;
  arguments?: Record<string, unknown>;
  toolCallId: string;
}

export interface AgentConfirmationCard {
  title: string;
  target: string;
  room?: string;
  vendor?: string;
  work?: string;
  amount?: number;
  paymentMethod?: AgentPaymentMethod;
  action: string;
}

export interface AgentPendingActionView {
  confirmationId: string;
  tool: TenantAgentToolName;
  expiresAt: string;
  card: AgentConfirmationCard;
}

export interface AgentRepairPaymentOrderView {
  orderRef: string;
  orderId: string;
  amount: number;
  status: RepairPaymentOrderStatus;
  method?: string;
  failureReason?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRepairPaymentCheckoutView {
  order: AgentRepairPaymentOrderView;
  clientKey: string;
  customerKey: string;
  orderName: "집우집주 수리비 결제";
}

export type AgentToolInvokeResponse =
  | {
      status: "executed";
      tool: TenantAgentToolName;
      data: Record<string, unknown>;
    }
  | { status: "pending_confirmation"; pendingAction: AgentPendingActionView }
  | { status: "executing"; confirmationId: string; summary: string }
  | { status: "cancelled"; confirmationId: string; summary: string }
  | { status: "failed"; confirmationId?: string; summary: string }
  | { status: "blocked"; summary: string };
