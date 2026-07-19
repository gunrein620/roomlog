import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  confirmGaraVendorCreditCheckoutServer,
  getGaraVendorCreditCheckoutServer,
} from "./gara-credit-server-api";

const originalFetch = globalThis.fetch;
const originalInternalUrl = process.env.API_INTERNAL_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalInternalUrl === undefined) {
    delete process.env.API_INTERNAL_URL;
  } else {
    process.env.API_INTERNAL_URL = originalInternalUrl;
  }
});

const readyOrder = {
  orderId: "gara-order-1",
  amount: 10_000,
  status: "READY" as const,
  returnPath: "/gara",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

test("Gara callback helpers call the absolute internal API URL", async () => {
  process.env.API_INTERNAL_URL = "http://api:4000";
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify(readyOrder), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await getGaraVendorCreditCheckoutServer(readyOrder.orderId);
  await confirmGaraVendorCreditCheckoutServer(readyOrder.orderId, {
    paymentKey: "payment-key-1",
    amount: readyOrder.amount,
  });

  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "http://api:4000/api/gara/vendor-credit-checkouts/gara-order-1",
      "http://api:4000/api/gara/vendor-credit-checkouts/gara-order-1/confirm",
    ],
  );
  assert.equal(requests[1]?.init?.method, "POST");
  assert.equal(
    requests[1]?.init?.body,
    JSON.stringify({ paymentKey: "payment-key-1", amount: 10_000 }),
  );
});
