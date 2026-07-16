import type {
  RepairPaymentOrderPublicView,
  RepairPaymentOrderView
} from "@roomlog/types";

export function publicRepairPaymentOrder(
  order: RepairPaymentOrderView
): RepairPaymentOrderPublicView {
  const {
    id: _id,
    paymentKey: _paymentKey,
    payerUserId: _payerUserId,
    confirmationId: _confirmationId,
    toolCallId: _toolCallId,
    ...visible
  } = order;
  return visible;
}
