import type {
  ConfirmManagerCreditTopupInput,
  ManagerCreditTopupOrderPublicView,
} from "@roomlog/types";
import { apiUrl } from "./api-url";
import { fetchJsonWithPayloadRetry } from "./server-api";

const CHECKOUTS_PATH = "/gara/vendor-credit-checkouts";

async function serverGaraCreditFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  return fetchJsonWithPayloadRetry<T>(
    () => fetch(apiUrl(path), {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    }),
    { path, method },
  );
}

export function getGaraVendorCreditCheckoutServer(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverGaraCreditFetch<ManagerCreditTopupOrderPublicView>(
    `${CHECKOUTS_PATH}/${encodeURIComponent(orderId)}`,
  );
}

export function confirmGaraVendorCreditCheckoutServer(
  orderId: string,
  input: ConfirmManagerCreditTopupInput,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverGaraCreditFetch<ManagerCreditTopupOrderPublicView>(
    `${CHECKOUTS_PATH}/${encodeURIComponent(orderId)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function cancelGaraVendorCreditCheckoutServer(
  orderId: string,
): Promise<ManagerCreditTopupOrderPublicView> {
  return serverGaraCreditFetch<ManagerCreditTopupOrderPublicView>(
    `${CHECKOUTS_PATH}/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
