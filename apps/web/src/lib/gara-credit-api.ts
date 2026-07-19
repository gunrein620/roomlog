import type {
  ConfirmManagerCreditTopupInput,
  CreateGaraVendorCreditCheckoutInput,
  CreateGaraVendorPayoutInput,
  GaraVendorCreditCheckout,
  GaraVendorPayoutRequestPublicView,
  ManagerCreditTopupOrderPublicView,
} from "@roomlog/types";

export class GaraCreditApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "GaraCreditApiError";
  }
}

async function browserGaraCreditFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new GaraCreditApiError(
      response.status,
      message || `크레딧 요청을 처리하지 못했습니다 (HTTP ${response.status}).`,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }
  return body as T;
}

const CHECKOUTS_PATH = "/api/gara/vendor-credit-checkouts";
const PAYOUT_REQUESTS_PATH = "/api/gara/vendor-payout-requests";

export function createGaraVendorPayoutRequest(
  input: CreateGaraVendorPayoutInput,
): Promise<GaraVendorPayoutRequestPublicView> {
  return browserGaraCreditFetch<GaraVendorPayoutRequestPublicView>(PAYOUT_REQUESTS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createGaraVendorCreditCheckout(
  input: CreateGaraVendorCreditCheckoutInput,
): Promise<GaraVendorCreditCheckout> {
  return browserGaraCreditFetch<GaraVendorCreditCheckout>(CHECKOUTS_PATH, {
    method: "POST",
    body: JSON.stringify({
      managerVendorId: input.managerVendorId,
      amount: input.amount,
      creationKey: input.creationKey,
    }),
  });
}

export function getGaraVendorCreditCheckout(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return browserGaraCreditFetch<ManagerCreditTopupOrderPublicView>(
    `${CHECKOUTS_PATH}/${encodeURIComponent(orderId)}`,
  );
}

export function confirmGaraVendorCreditCheckout(
  orderId: string,
  input: ConfirmManagerCreditTopupInput,
): Promise<ManagerCreditTopupOrderPublicView> {
  return browserGaraCreditFetch<ManagerCreditTopupOrderPublicView>(
    `${CHECKOUTS_PATH}/${encodeURIComponent(orderId)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function cancelGaraVendorCreditCheckout(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return browserGaraCreditFetch<ManagerCreditTopupOrderPublicView>(
    `${CHECKOUTS_PATH}/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
