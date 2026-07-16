const DEFAULT_MANAGER_CREDIT_RETURN_PATH = "/manager/vendor-mgmt/credit";

function isManagerPath(pathname: string): boolean {
  return pathname === "/manager" || pathname.startsWith("/manager/");
}

export const normalizeManagerReturnPath = (
  value: string | null | undefined,
  fallback = DEFAULT_MANAGER_CREDIT_RETURN_PATH,
): string => {
  if (!value || !value.startsWith("/manager") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://roomlog.invalid");
    if (
      parsed.origin !== "https://roomlog.invalid"
      || !isManagerPath(parsed.pathname)
    ) {
      return fallback;
    }
    parsed.searchParams.delete("creditTopup");
    parsed.searchParams.delete("creditTopupOrderId");
    parsed.searchParams.delete("repairPayment");
    parsed.searchParams.delete("repairPaymentOrderId");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};
