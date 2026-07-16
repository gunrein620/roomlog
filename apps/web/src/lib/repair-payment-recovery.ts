import type { RepairPaymentOrderStatus } from "@roomlog/types";

export interface RepairPaymentRecoveryView {
  label: string;
  canRetry: boolean;
  canCancel: boolean;
  canReconcile: boolean;
}

export function repairPaymentRecovery(
  status?: RepairPaymentOrderStatus
): RepairPaymentRecoveryView | undefined {
  if (!status) return undefined;
  if (status === "READY" || status === "FAILED") {
    return {
      label: "결제 미완료",
      canRetry: true,
      canCancel: true,
      canReconcile: false,
    };
  }
  if (status === "CONFIRMING" || status === "RECONCILIATION_REQUIRED") {
    return {
      label: "결제 확인 중",
      canRetry: false,
      canCancel: false,
      canReconcile: true,
    };
  }
  if (status === "APPROVED") {
    return {
      label: "결제 완료",
      canRetry: false,
      canCancel: false,
      canReconcile: false,
    };
  }
  return {
    label: "주문 취소",
    canRetry: false,
    canCancel: false,
    canReconcile: false,
  };
}
