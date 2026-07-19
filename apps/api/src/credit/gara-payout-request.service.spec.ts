import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CreditController } from "./credit.controller";
import { CreditService } from "./credit.service";

describe("public Gara payout requests", () => {
  it("queues a request without an authenticated manager or a credit debit", async () => {
    let received: unknown;
    const command = {
      createPublicGaraVendorPayoutRequest: async (input: unknown) => {
        received = input;
        return {
          id: "gara-payout-1",
          amount: 50_000,
          accountNumber: "110-123-456789",
          status: "PENDING_APPROVAL" as const,
          createdAt: "2026-07-19T00:00:00.000Z"
        };
      }
    };
    const service = new CreditService(command as never, {} as never, {} as never, {
      clientKey: "test-client-key",
      tokenSecret: "test-token-secret"
    });
    const input = {
      managerVendorId: "manager-vendor-1",
      amount: 50_000,
      idempotencyKey: "gara-request-key-1"
    };

    const request = await (service as unknown as {
      createPublicGaraVendorPayoutRequest(payload: typeof input): Promise<unknown>;
    }).createPublicGaraVendorPayoutRequest(input);

    assert.deepEqual(received, input);
    assert.deepEqual(request, {
      id: "gara-payout-1",
      amount: 50_000,
      accountNumber: "110-123-456789",
      status: "PENDING_APPROVAL",
      createdAt: "2026-07-19T00:00:00.000Z"
    });
  });

  it("exposes an unauthenticated endpoint for sending the request", async () => {
    const controller = new CreditController({
      createPublicGaraVendorPayoutRequest: async () => ({ id: "gara-payout-1" })
    } as never);
    const handler = (controller as unknown as {
      createPublicGaraVendorPayoutRequest?: (input: unknown) => Promise<unknown>;
    }).createPublicGaraVendorPayoutRequest;

    assert.equal(typeof handler, "function");
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler as object), "gara/vendor-payout-requests");
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler as object), RequestMethod.POST);
    assert.equal((handler as Function).length, 1);
  });
});
