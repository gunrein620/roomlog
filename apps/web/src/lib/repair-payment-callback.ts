import type {
  ConfirmRepairPaymentOrderInput,
  RepairPaymentOrderPublicView,
} from "@roomlog/types";

export type RepairPaymentMarker =
  | "approved"
  | "reconciliation_required"
  | "cancelled"
  | "failed";

export type RepairPaymentCallbackParams = Record<
  string,
  string | string[] | undefined
>;

export type RepairPaymentSuccessDependencies = {
  getOrder: (orderId: string) => Promise<RepairPaymentOrderPublicView>;
  confirmOrder: (
    orderId: string,
    input: ConfirmRepairPaymentOrderInput,
  ) => Promise<RepairPaymentOrderPublicView>;
};

export type RepairPaymentFailureDependencies = {
  getOrder: (orderId: string) => Promise<RepairPaymentOrderPublicView>;
  cancelOrder: (orderId: string) => Promise<RepairPaymentOrderPublicView>;
};

export type RepairPaymentReturnPathNormalizer = (value?: string) => string;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withCallbackMarker(
  returnPath: string,
  marker: RepairPaymentMarker,
  orderId?: string,
): string {
  const parsed = new URL(returnPath, "https://roomlog.invalid");
  parsed.searchParams.set("repairPayment", marker);
  if (orderId) parsed.searchParams.set("repairPaymentOrderId", orderId);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function markerForRepairPaymentOrder(
  order: RepairPaymentOrderPublicView,
): RepairPaymentMarker {
  if (order.status === "APPROVED") return "approved";
  if (order.status === "CONFIRMING" || order.status === "RECONCILIATION_REQUIRED") {
    return "reconciliation_required";
  }
  if (order.status === "CANCELLED") return "cancelled";
  return "failed";
}

function targetForOrder(
  order: RepairPaymentOrderPublicView,
  normalizeReturnPath: RepairPaymentReturnPathNormalizer,
): string {
  return withCallbackMarker(
    normalizeReturnPath(order.returnPath),
    markerForRepairPaymentOrder(order),
    order.orderId,
  );
}

function targetWithoutOrder(
  normalizeReturnPath: RepairPaymentReturnPathNormalizer,
  orderId?: string,
): string {
  return withCallbackMarker(
    normalizeReturnPath(undefined),
    "failed",
    orderId,
  );
}

async function readStoredOrder(
  orderId: string,
  getOrder: RepairPaymentSuccessDependencies["getOrder"],
): Promise<RepairPaymentOrderPublicView | null> {
  return getOrder(orderId).catch(() => null);
}

export async function resolveRepairPaymentSuccess(
  params: RepairPaymentCallbackParams,
  dependencies: RepairPaymentSuccessDependencies,
  normalizeReturnPath: RepairPaymentReturnPathNormalizer,
): Promise<string> {
  const paymentKey = first(params.paymentKey);
  const orderId = first(params.orderId);
  const amount = Number(first(params.amount));

  if (!orderId) return targetWithoutOrder(normalizeReturnPath);

  if (!paymentKey || !Number.isSafeInteger(amount) || amount <= 0) {
    const order = await readStoredOrder(orderId, dependencies.getOrder);
    return order
      ? targetForOrder(order, normalizeReturnPath)
      : targetWithoutOrder(normalizeReturnPath, orderId);
  }

  try {
    const order = await dependencies.confirmOrder(orderId, { paymentKey, amount });
    return targetForOrder(order, normalizeReturnPath);
  } catch {
    const order = await readStoredOrder(orderId, dependencies.getOrder);
    return order
      ? targetForOrder(order, normalizeReturnPath)
      : targetWithoutOrder(normalizeReturnPath, orderId);
  }
}

export async function resolveRepairPaymentFailure(
  params: RepairPaymentCallbackParams,
  dependencies: RepairPaymentFailureDependencies,
  normalizeReturnPath: RepairPaymentReturnPathNormalizer,
): Promise<string> {
  const orderId = first(params.orderId);
  if (!orderId) return targetWithoutOrder(normalizeReturnPath);

  const stored = await readStoredOrder(orderId, dependencies.getOrder);
  if (!stored) return targetWithoutOrder(normalizeReturnPath, orderId);

  let order = stored;
  if (order.status === "READY") {
    try {
      order = await dependencies.cancelOrder(orderId);
    } catch {
      const refreshed = await readStoredOrder(orderId, dependencies.getOrder);
      return refreshed
        ? targetForOrder(refreshed, normalizeReturnPath)
        : targetWithoutOrder(normalizeReturnPath, orderId);
    }
  }

  return targetForOrder(order, normalizeReturnPath);
}
