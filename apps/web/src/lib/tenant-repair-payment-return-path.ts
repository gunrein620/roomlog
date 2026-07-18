const TENANT_REPAIR_PAYMENT_ROOT = "/tenant/repair-payment/";
// 세입자탭 임베드 체크아웃(도입 2026-07-18): 결제 후 탭으로 복귀(?complaintId=로 시트 자동 오픈).
const TENANT_TAB_PATH = "/living";
const SAFE_ORIGIN = "https://roomlog.invalid";

export function normalizeTenantRepairPaymentReturnPath(
  value: string | null | undefined,
  fallback = "/living",
): string {
  if (!value || value.startsWith("//")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, SAFE_ORIGIN);
  } catch {
    return fallback;
  }

  if (
    parsed.origin !== SAFE_ORIGIN
    || !(
      parsed.pathname.startsWith(TENANT_REPAIR_PAYMENT_ROOT)
      || parsed.pathname === TENANT_TAB_PATH
    )
  ) {
    return fallback;
  }

  parsed.searchParams.delete("repairPayment");
  parsed.searchParams.delete("repairPaymentOrderId");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
