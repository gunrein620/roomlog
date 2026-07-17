import type {
  ConfirmRepairPaymentOrderInput,
  CreateRepairPaymentOrderInput,
  RepairPaymentCheckout,
  RepairPaymentOrderPublicView,
  RetryRepairPaymentOrderInput,
} from "@roomlog/types";
import { serverFetch } from "./server-api";

const encoded = (value: string) => encodeURIComponent(value);

export const tenantRepairPaymentApiPath = {
  create: (paymentRequestId: string) =>
    `/tenant/vendor-payment-requests/${encoded(paymentRequestId)}/toss-orders`,
  order: (orderId: string) =>
    `/tenant/repair-payment-orders/${encoded(orderId)}`,
  confirm: (orderId: string) =>
    `/tenant/repair-payment-orders/${encoded(orderId)}/confirm`,
  reconcile: (orderId: string) =>
    `/tenant/repair-payment-orders/${encoded(orderId)}/reconcile`,
  cancel: (orderId: string) =>
    `/tenant/repair-payment-orders/${encoded(orderId)}/cancel`,
  retry: (orderId: string) =>
    `/tenant/repair-payment-orders/${encoded(orderId)}/retry`,
} as const;

export function createTenantRepairPaymentOrder(
  paymentRequestId: string,
  input: CreateRepairPaymentOrderInput,
): Promise<RepairPaymentCheckout> {
  return serverFetch<RepairPaymentCheckout>(
    tenantRepairPaymentApiPath.create(paymentRequestId),
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getTenantRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    tenantRepairPaymentApiPath.order(orderId),
  );
}

export function confirmTenantRepairPaymentOrder(
  orderId: string,
  input: ConfirmRepairPaymentOrderInput,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    tenantRepairPaymentApiPath.confirm(orderId),
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reconcileTenantRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    tenantRepairPaymentApiPath.reconcile(orderId),
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function cancelTenantRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    tenantRepairPaymentApiPath.cancel(orderId),
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function retryTenantRepairPaymentOrder(
  orderId: string,
  input: RetryRepairPaymentOrderInput,
): Promise<RepairPaymentCheckout> {
  return serverFetch<RepairPaymentCheckout>(
    tenantRepairPaymentApiPath.retry(orderId),
    { method: "POST", body: JSON.stringify(input) },
  );
}
