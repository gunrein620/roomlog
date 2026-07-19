"use server";

import type {
  CancelVendorPaymentRequestInput,
  ReverseVendorCreditPaymentInput,
  SettleVendorPaymentRequestInput,
  UpdateAutoPayPolicyInput,
  VoidVendorDirectPaymentInput,
} from "@roomlog/types";
import {
  cancelVendorPaymentRequest,
  getAuthoritativeManagerCreditWorkspace,
  reconcileManagerCreditTopup,
  reverseVendorCreditPayment,
  settleVendorPaymentRequest,
  settleGaraVendorPayout,
  updateManagerAutoPayPolicy,
  voidVendorDirectPayment,
} from "@/lib/vendor-credit-api";
import { ApiError } from "@/lib/server-api";
import { toCreditWorkspaceView } from "./view-model";

export type CreditInsufficientBalanceResult = Readonly<{
  kind: "INSUFFICIENT_CREDIT";
  message: string;
}>;

function isInsufficientCreditError(error: unknown): error is ApiError {
  return error instanceof ApiError
    && error.status === 409
    && error.message.includes("크레딧 잔액이 부족합니다.");
}

async function withInsufficientCreditResult<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (isInsufficientCreditError(error)) {
      return {
        kind: "INSUFFICIENT_CREDIT" as const,
        message: error.message,
      } satisfies CreditInsufficientBalanceResult;
    }
    throw error;
  }
}

export async function refreshCreditWorkspaceAction() {
  return toCreditWorkspaceView(await getAuthoritativeManagerCreditWorkspace());
}

export async function loadMoreCreditHistoryAction(
  kind: "ledger" | "topup" | "payment",
  cursor: string,
) {
  const page = kind === "ledger"
    ? { ledgerCursor: cursor }
    : kind === "topup"
      ? { topupCursor: cursor }
      : { paymentCursor: cursor };
  return toCreditWorkspaceView(await getAuthoritativeManagerCreditWorkspace(page));
}

export async function updateCreditPolicyAction(input: UpdateAutoPayPolicyInput) {
  return updateManagerAutoPayPolicy(input);
}

export async function settleCreditPaymentAction(
  paymentRequestId: string,
  input: SettleVendorPaymentRequestInput,
) {
  return withInsufficientCreditResult(() => settleVendorPaymentRequest(paymentRequestId, input));
}

export async function settleGaraPayoutAction(payoutRequestId: string, idempotencyKey: string) {
  return withInsufficientCreditResult(() =>
    settleGaraVendorPayout(payoutRequestId, { idempotencyKey }));
}

export async function reverseCreditPaymentAction(
  paymentRequestId: string,
  input: ReverseVendorCreditPaymentInput,
) {
  return reverseVendorCreditPayment(paymentRequestId, input);
}

export async function voidDirectPaymentAction(
  paymentRequestId: string,
  input: VoidVendorDirectPaymentInput,
) {
  return voidVendorDirectPayment(paymentRequestId, input);
}

export async function cancelCreditPaymentAction(
  paymentRequestId: string,
  input: CancelVendorPaymentRequestInput,
) {
  return cancelVendorPaymentRequest(paymentRequestId, input);
}

export async function reconcileCreditTopupAction(orderId: string) {
  return reconcileManagerCreditTopup(orderId);
}
