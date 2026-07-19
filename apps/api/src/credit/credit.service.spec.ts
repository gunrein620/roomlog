import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CreditController } from "./credit.controller";
import { CreditService } from "./credit.service";

const readyOrder = {
  id: "credit-topup-1",
  orderId: "roomlog-credit-1",
  amount: 10_000,
  status: "READY" as const,
  paymentKey: "private-payment-key",
  returnPath: "/gara",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z"
};

class StubCreditCommandRepository {
  createGaraTopupOrderCalls = 0;
  createGaraTopupOrderInput: unknown;

  constructor(private readonly order = readyOrder) {}

  async createGaraTopupOrder(input: unknown) {
    this.createGaraTopupOrderCalls += 1;
    this.createGaraTopupOrderInput = input;
    return { managerId: "manager-1", order: this.order };
  }
}

function createService(command: StubCreditCommandRepository) {
  return new CreditService(
    command as never,
    {} as never,
    {} as never,
    { clientKey: "test-client-key", tokenSecret: "test-token-secret" }
  );
}

describe("CreditService.createGaraVendorCreditCheckout", () => {
  it("delegates only the public checkout fields and fixes the return path", async () => {
    const command = new StubCreditCommandRepository();
    const service = createService(command);

    const checkout = await service.createGaraVendorCreditCheckout({
      managerVendorId: "manager-vendor-1",
      amount: 10_000,
      creationKey: "key-1"
    });

    assert.deepEqual(command.createGaraTopupOrderInput, {
      managerVendorId: "manager-vendor-1",
      amount: 10_000,
      creationKey: "key-1",
      returnPath: "/gara"
    });
    assert.equal(command.createGaraTopupOrderCalls, 1);
    assert.equal(checkout.order, readyOrder);
    assert.equal(checkout.clientKey, "test-client-key");
    assert.equal(checkout.orderName, "Gara 업체 크레딧 충전");
    assert.equal(typeof checkout.customerKey, "string");
    assert.equal("managerId" in checkout, false);
  });

  it("rejects invalid amounts before calling the repository", async () => {
    for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const command = new StubCreditCommandRepository();
      const service = createService(command);

      await assert.rejects(
        () =>
          service.createGaraVendorCreditCheckout({
            managerVendorId: "manager-vendor-1",
            amount,
            creationKey: "key-1"
          }),
        /1원 이상의 정수/
      );
      assert.equal(command.createGaraTopupOrderCalls, 0);
    }
  });

  it("uses an order-specific customer key that cannot correlate owner registrations", async () => {
    const first = await createService(
      new StubCreditCommandRepository(readyOrder)
    ).createGaraVendorCreditCheckout({
      managerVendorId: "manager-vendor-1",
      amount: 10_000,
      creationKey: "key-1"
    });
    const second = await createService(
      new StubCreditCommandRepository({
        ...readyOrder,
        id: "credit-topup-2",
        orderId: "roomlog-credit-2"
      })
    ).createGaraVendorCreditCheckout({
      managerVendorId: "manager-vendor-2",
      amount: 10_000,
      creationKey: "key-2"
    });

    assert.notEqual(first.customerKey, second.customerKey);
  });
});

describe("public Gara vendor credits", () => {
  const publicRows = [
    {
      id: "manager-vendor-1",
      businessName: "Gara 설비",
      phone: "02-1234-5678",
      settlementAccountNumber: "110-123-456789",
      linkedAccount: { name: "관리자", email: "manager@example.com" },
      cumulativeCredit: 30_000
    }
  ];

  it("delegates the unauthenticated list to the public query repository", async () => {
    let calls = 0;
    const service = new CreditService(
      {} as never,
      {
        listPublicGaraVendors: async () => {
          calls += 1;
          return publicRows;
        }
      } as never,
      {} as never,
      { clientKey: "test-client-key", tokenSecret: "test-token-secret" }
    );
    const candidate = service as unknown as {
      listPublicGaraVendors?: () => Promise<typeof publicRows>;
    };

    assert.equal(typeof candidate.listPublicGaraVendors, "function");
    assert.equal(await candidate.listPublicGaraVendors?.(), publicRows);
    assert.equal(calls, 1);
  });

  it("exposes GET /gara/vendors without an authorization parameter", async () => {
    const controller = new CreditController({
      listPublicGaraVendors: async () => publicRows
    } as never);
    const candidate = controller as unknown as {
      listPublicGaraVendors?: () => Promise<typeof publicRows>;
    };
    const handler = candidate.listPublicGaraVendors;

    assert.equal(typeof handler, "function");
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler as object), "gara/vendors");
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler as object), RequestMethod.GET);
    assert.equal((handler as Function).length, 0);
    assert.equal(await handler?.call(controller), publicRows);
  });
});

describe("CreditController public Gara checkout", () => {
  it("creates a checkout without auth and strips private top-up fields", async () => {
    const input = {
      managerVendorId: "manager-vendor-1",
      amount: 10_000,
      creationKey: "key-1"
    };
    let received: unknown;
    const controller = new CreditController({
      createGaraVendorCreditCheckout: async (value: unknown) => {
        received = value;
        return {
          order: readyOrder,
          clientKey: "client-key",
          customerKey: "customer-key",
          orderName: "Gara 업체 크레딧 충전"
        };
      }
    } as never);

    const checkout = await controller.createGaraVendorCreditCheckout(input);

    assert.equal(received, input);
    assert.equal(checkout.order.orderId, readyOrder.orderId);
    assert.equal("id" in checkout.order, false);
    assert.equal("paymentKey" in checkout.order, false);
    assert.equal("managerId" in checkout, false);
  });

  it("resolves the private owner before get, confirm, and cancel", async () => {
    const calls: string[] = [];
    const approvedOrder = { ...readyOrder, status: "APPROVED" as const };
    const credit = {
      getGaraTopupOrder: async (orderId: string) => {
        calls.push(`resolve:${orderId}`);
        return {
          managerId: "private-manager-1",
          managerVendorId: "manager-vendor-1",
          order: readyOrder
        };
      },
      getTopupOrder: async (managerId: string, orderId: string) => {
        calls.push(`get:${managerId}:${orderId}`);
        return readyOrder;
      },
      confirmTopup: async (
        managerId: string,
        orderId: string,
        input: unknown,
        garaManagerVendorId?: string
      ) => {
        calls.push(
          `confirm:${managerId}:${orderId}:${String(input !== undefined)}:${garaManagerVendorId}`
        );
        return approvedOrder;
      },
      cancelTopup: async (managerId: string, orderId: string) => {
        calls.push(`cancel:${managerId}:${orderId}`);
        return { ...readyOrder, status: "CANCELLED" as const };
      }
    };
    const controller = new CreditController(credit as never);

    await controller.getGaraVendorCreditCheckout("order-1");
    await controller.confirmGaraVendorCreditCheckout("order-1", {
      paymentKey: "payment-1",
      amount: 10_000
    });
    await controller.cancelGaraVendorCreditCheckout("order-1");

    assert.deepEqual(calls, [
      "resolve:order-1",
      "get:private-manager-1:order-1",
      "resolve:order-1",
      "confirm:private-manager-1:order-1:true:manager-vendor-1",
      "resolve:order-1",
      "cancel:private-manager-1:order-1"
    ]);
  });

  it("does not invoke confirmation when the order is not Gara-linked", async () => {
    let confirmCalls = 0;
    const controller = new CreditController({
      getGaraTopupOrder: async () => {
        throw new NotFoundException("Gara 크레딧 충전 주문을 찾을 수 없습니다.");
      },
      confirmTopup: async () => {
        confirmCalls += 1;
        return readyOrder;
      }
    } as never);

    await assert.rejects(
      () =>
        controller.confirmGaraVendorCreditCheckout("normal-order", {
          paymentKey: "payment-1",
          amount: 10_000
        }),
      /Gara 크레딧 충전 주문/
    );
    assert.equal(confirmCalls, 0);
  });
});

describe("CreditController credit balance realtime updates", () => {
  it("notifies only the credited manager after a successful top-up confirmation", async () => {
    const notifications: string[] = [];
    const controller = new CreditController({
      requireManager: async () => "manager-1",
      confirmTopup: async () => ({ ...readyOrder, status: "APPROVED" as const }),
    } as never, {
      notifyManagerCreditUpdated: (managerId: string) => notifications.push(managerId),
    } as never);

    await controller.confirmTopup("Bearer manager-token", "roomlog-credit-1", {
      paymentKey: "payment-1",
      amount: 10_000,
    });

    assert.deepEqual(notifications, ["manager-1"]);
  });

  it("notifies the manager after settling a Gara payout with credit", async () => {
    const notifications: string[] = [];
    const controller = new CreditController({
      requireManager: async () => "manager-1",
      settleGaraVendorPayout: async () => ({
        request: { id: "gara-payout-1" },
        account: { id: "account-1", balance: 9_000 },
      }),
    } as never, {
      notifyManagerCreditUpdated: (managerId: string) => notifications.push(managerId),
      notifyGaraPayoutUpdated: () => undefined,
    } as never);

    await controller.settleGaraVendorPayout("Bearer manager-token", "gara-payout-1", {
      idempotencyKey: "settle-1",
    });

    assert.deepEqual(notifications, ["manager-1"]);
  });
});
