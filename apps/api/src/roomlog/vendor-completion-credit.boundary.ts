export const VENDOR_COMPLETION_CREDIT_BOUNDARY = Symbol(
  "VENDOR_COMPLETION_CREDIT_BOUNDARY"
);

export interface VendorCompletionCreditBoundary {
  readonly availability: "DEFERRED" | "READY";
  evaluateAfterCompletion(input: Readonly<{
    managerId: string;
    paymentRequestId: string;
    completionDecisionId: string;
    actorUserId: string;
  }>): Promise<
    | { outcome: "DEFERRED"; paymentRequestId: string }
    | { outcome: "AUTO_PAID"; paymentRequestId: string; ledgerEntryId: string }
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
      }
  >;
}

export class DeferredVendorCompletionCreditBoundary
  implements VendorCompletionCreditBoundary
{
  readonly availability = "DEFERRED" as const;

  async evaluateAfterCompletion(input: Readonly<{ paymentRequestId: string }>) {
    return {
      outcome: "DEFERRED",
      paymentRequestId: input.paymentRequestId
    } as const;
  }
}
