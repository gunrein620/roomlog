import type { ManagerCreditTopupOrderPublicView } from "@roomlog/types";
import { redirect } from "next/navigation";
import {
  cancelGaraVendorCreditCheckoutServer,
  getGaraVendorCreditCheckoutServer,
} from "@/lib/gara-credit-server-api";

type CreditTopupMarker = "approved" | "reconciliation_required" | "cancelled" | "failed";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withCallbackMarker(
  returnPath: "/gara",
  marker: CreditTopupMarker,
  orderId?: string,
): string {
  const parsed = new URL(returnPath, "https://roomlog.invalid");
  parsed.searchParams.set("creditTopup", marker);
  if (orderId) parsed.searchParams.set("creditTopupOrderId", orderId);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function redirectForOrder(
  order: ManagerCreditTopupOrderPublicView,
  marker: CreditTopupMarker,
): never {
  redirect(withCallbackMarker("/gara", marker, order.orderId));
}

function redirectWithoutOrder(orderId?: string): never {
  redirect(withCallbackMarker("/gara", "failed", orderId));
}

function markerForOrder(order: ManagerCreditTopupOrderPublicView): CreditTopupMarker {
  if (order.status === "APPROVED") return "approved";
  if (order.status === "CONFIRMING" || order.status === "RECONCILIATION_REQUIRED") {
    return "reconciliation_required";
  }
  if (order.status === "CANCELLED") return "cancelled";
  return "failed";
}

export default async function GaraCreditCheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orderId = first(params.orderId);
  if (!orderId) redirectWithoutOrder();

  let order: ManagerCreditTopupOrderPublicView;
  const stored = await getGaraVendorCreditCheckoutServer(orderId).catch(() => null);
  if (!stored) redirectWithoutOrder(orderId);
  order = stored;

  if (order.status === "READY") {
    try {
      order = await cancelGaraVendorCreditCheckoutServer(orderId);
    } catch {
      const refreshed = await getGaraVendorCreditCheckoutServer(orderId).catch(() => null);
      if (!refreshed) redirectWithoutOrder(orderId);
      order = refreshed;
    }
  }

  redirectForOrder(order, markerForOrder(order));
}
