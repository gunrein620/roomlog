import type {
  CancelVendorPaymentRequestInput,
  ConfirmManagerCreditTopupInput,
  CreateGaraVendorPayoutInput,
  CreateGaraVendorPayoutResult,
  ConfirmRepairPaymentOrderInput,
  CreateManagerCreditTopupInput,
  CreateRepairPaymentOrderInput,
  ManagerAutoPayPolicyView,
  ManagerCreditAccountPublicView,
  ManagerCreditTopupCheckout,
  ManagerCreditTopupOrderPublicView,
  ManagerCreditWorkspacePublicView,
  ManagerVendorPaymentRequestPublicView,
  RepairPaymentCheckout,
  RepairPaymentOrderPublicView,
  RetryRepairPaymentOrderInput,
  ReverseVendorCreditPaymentInput,
  SettleVendorPaymentRequestInput,
  UpdateAutoPayPolicyInput,
  VoidVendorDirectPaymentInput,
} from "@roomlog/types";
import {
  DEMO_MANAGER_CREDIT_ACCOUNT,
  DEMO_MANAGER_CREDIT_WORKSPACE,
} from "./demo-vendor-credit";
import { serverFetch } from "./server-api";

export type CreditReadResult<T> = { data: T; source: "API" | "DEMO" };
export type ManagerCreditWorkspacePage = {
  ledgerCursor?: string;
  topupCursor?: string;
  paymentCursor?: string;
  limit?: number;
};

/** Node/browser fetch가 연결 단계에서 내는 TypeError만 데모 허용 대상으로 본다. */
export function canUseCreditReadDemo(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message);
}

export async function readCreditData<T>(
  read: () => Promise<T>,
  demo: T,
): Promise<CreditReadResult<T>> {
  try {
    return { data: await read(), source: "API" };
  } catch (error) {
    if (!canUseCreditReadDemo(error)) throw error;
    console.warn("[vendor-credit/api] API 연결 불가 · 명시적 데모 데이터 사용");
    return { data: demo, source: "DEMO" };
  }
}

export function getManagerCreditAccount(): Promise<CreditReadResult<ManagerCreditAccountPublicView>> {
  return readCreditData(
    () => serverFetch<ManagerCreditAccountPublicView>("/manager/credits/account"),
    DEMO_MANAGER_CREDIT_ACCOUNT,
  );
}

export function createGaraVendorPayout(
  input: CreateGaraVendorPayoutInput,
): Promise<CreateGaraVendorPayoutResult> {
  return serverFetch<CreateGaraVendorPayoutResult>("/manager/gara/vendor-payout-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function settleGaraVendorPayout(
  payoutRequestId: string,
  input: Readonly<{ idempotencyKey: string }>,
): Promise<CreateGaraVendorPayoutResult> {
  return serverFetch<CreateGaraVendorPayoutResult>(
    `/manager/gara/vendor-payout-requests/${encodeURIComponent(payoutRequestId)}/settle`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

function managerCreditWorkspacePath(page: ManagerCreditWorkspacePage = {}): string {
  const params = new URLSearchParams();
  if (page.ledgerCursor?.trim()) params.set("ledgerCursor", page.ledgerCursor.trim());
  if (page.topupCursor?.trim()) params.set("topupCursor", page.topupCursor.trim());
  if (page.paymentCursor?.trim()) params.set("paymentCursor", page.paymentCursor.trim());
  if (page.limit !== undefined) params.set("limit", String(page.limit));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return `/manager/credits${query}`;
}

/** Initial page read may render demo data while the API is offline. */
export function getManagerCreditWorkspace(
  page: ManagerCreditWorkspacePage = {},
): Promise<CreditReadResult<ManagerCreditWorkspacePublicView>> {
  return readCreditData(
    () => serverFetch<ManagerCreditWorkspacePublicView>(managerCreditWorkspacePath(page)),
    DEMO_MANAGER_CREDIT_WORKSPACE,
  );
}

/** Pagination and post-mutation refreshes must remain authoritative and never mix demo rows. */
export async function getAuthoritativeManagerCreditWorkspace(
  page: ManagerCreditWorkspacePage = {},
): Promise<CreditReadResult<ManagerCreditWorkspacePublicView>> {
  return {
    data: await serverFetch<ManagerCreditWorkspacePublicView>(managerCreditWorkspacePath(page)),
    source: "API",
  };
}

/** Callback routes need the authoritative stored returnPath, so this read never falls back. */
export function getManagerCreditTopup(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverFetch<ManagerCreditTopupOrderPublicView>(
    `/manager/credits/topup-orders/${encodeURIComponent(orderId)}`,
  );
}

export function createManagerCreditTopup(
  input: CreateManagerCreditTopupInput,
): Promise<ManagerCreditTopupCheckout> {
  return serverFetch<ManagerCreditTopupCheckout>("/manager/credits/topup-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmManagerCreditTopup(
  orderId: string,
  input: ConfirmManagerCreditTopupInput,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverFetch<ManagerCreditTopupOrderPublicView>(
    `/manager/credits/topup-orders/${encodeURIComponent(orderId)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reconcileManagerCreditTopup(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverFetch<ManagerCreditTopupOrderPublicView>(
    `/manager/credits/topup-orders/${encodeURIComponent(orderId)}/reconcile`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function cancelManagerCreditTopup(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverFetch<ManagerCreditTopupOrderPublicView>(
    `/manager/credits/topup-orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function createManagerRepairPaymentOrder(
  paymentRequestId: string,
  input: CreateRepairPaymentOrderInput,
): Promise<RepairPaymentCheckout> {
  return serverFetch<RepairPaymentCheckout>(
    `/manager/vendor-payment-requests/${encodeURIComponent(paymentRequestId)}/toss-orders`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getManagerRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}`,
  );
}

export function confirmManagerRepairPaymentOrder(
  orderId: string,
  input: ConfirmRepairPaymentOrderInput,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reconcileManagerRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/reconcile`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function cancelManagerRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function retryManagerRepairPaymentOrder(
  orderId: string,
  input: RetryRepairPaymentOrderInput,
): Promise<RepairPaymentCheckout> {
  return serverFetch<RepairPaymentCheckout>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/retry`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateManagerAutoPayPolicy(
  input: UpdateAutoPayPolicyInput,
): Promise<ManagerAutoPayPolicyView> {
  return serverFetch<ManagerAutoPayPolicyView>("/manager/credits/auto-pay-policy", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function settleVendorPaymentRequest(
  paymentRequestId: string,
  input: SettleVendorPaymentRequestInput,
): Promise<ManagerVendorPaymentRequestPublicView> {
  return serverFetch<ManagerVendorPaymentRequestPublicView>(
    `/manager/vendor-payment-requests/${encodeURIComponent(paymentRequestId)}/settle`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reverseVendorCreditPayment(
  paymentRequestId: string,
  input: ReverseVendorCreditPaymentInput,
): Promise<ManagerVendorPaymentRequestPublicView> {
  return serverFetch<ManagerVendorPaymentRequestPublicView>(
    `/manager/vendor-payment-requests/${encodeURIComponent(paymentRequestId)}/reverse-credit`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function voidVendorDirectPayment(
  paymentRequestId: string,
  input: VoidVendorDirectPaymentInput,
): Promise<ManagerVendorPaymentRequestPublicView> {
  return serverFetch<ManagerVendorPaymentRequestPublicView>(
    `/manager/vendor-payment-requests/${encodeURIComponent(paymentRequestId)}/void-direct`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function cancelVendorPaymentRequest(
  paymentRequestId: string,
  input: CancelVendorPaymentRequestInput,
): Promise<ManagerVendorPaymentRequestPublicView> {
  return serverFetch<ManagerVendorPaymentRequestPublicView>(
    `/manager/vendor-payment-requests/${encodeURIComponent(paymentRequestId)}/cancel`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
