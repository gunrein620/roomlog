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
import { toCreditWorkspaceView } from "./view-model";

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
  return settleVendorPaymentRequest(paymentRequestId, input);
}

export async function settleGaraPayoutAction(payoutRequestId: string, idempotencyKey: string) {
  return settleGaraVendorPayout(payoutRequestId, { idempotencyKey });
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
