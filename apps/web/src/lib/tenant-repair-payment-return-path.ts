const TENANT_REPAIR_PAYMENT_ROOT = "/tenant/repair-payment/";
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
    || !parsed.pathname.startsWith(TENANT_REPAIR_PAYMENT_ROOT)
  ) {
    return fallback;
  }

  parsed.searchParams.delete("repairPayment");
  parsed.searchParams.delete("repairPaymentOrderId");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
