import { BadRequestException } from "@nestjs/common";

export const REPAIR_PAYMENT_ORDER_BYTE_LIMITS = {
  orderId: 64,
  creationKey: 128,
  paymentKey: 200,
  returnPath: 2048
} as const;

function requireBoundedUtf8Text(
  value: unknown,
  field: keyof typeof REPAIR_PAYMENT_ORDER_BYTE_LIMITS,
  label: string
) {
  if (typeof value !== "string") {
    throw new BadRequestException(`${label}이(가) 필요합니다.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${label}이(가) 필요합니다.`);
  }
  const limit = REPAIR_PAYMENT_ORDER_BYTE_LIMITS[field];
  if (Buffer.byteLength(normalized, "utf8") > limit) {
    throw new BadRequestException(
      `${label}은(는) UTF-8 기준 ${limit}바이트 이하여야 합니다.`
    );
  }
  return normalized;
}

export function requireRepairPaymentOrderId(value: unknown) {
  return requireBoundedUtf8Text(
    value,
    "orderId",
    "수리비 결제 주문 ID"
  );
}

export function requireRepairPaymentCreationKey(value: unknown) {
  return requireBoundedUtf8Text(
    value,
    "creationKey",
    "수리비 결제 요청 키"
  );
}

export function requireRepairPaymentKey(value: unknown) {
  return requireBoundedUtf8Text(value, "paymentKey", "결제 키");
}

export function requireRepairPaymentReturnPath(value: unknown) {
  return requireBoundedUtf8Text(value, "returnPath", "결제 복귀 경로");
}
