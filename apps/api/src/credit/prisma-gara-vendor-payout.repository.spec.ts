import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaCreditCommandRepository } from "./prisma-credit-command.repository";
import { PrismaCreditQueryRepository } from "./prisma-credit-query.repository";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

it("preserves the Gara fulfillment marker when a registration deletion is attempted", () => {
  const prismaRoot = resolve(__dirname, "../../../../prisma");
  const schema = readFileSync(resolve(prismaRoot, "schema.prisma"), "utf8");
  const migration = readFileSync(
    resolve(
      prismaRoot,
      "migrations/20260719010000_restrict_gara_topup_registration_delete/migration.sql"
    ),
    "utf8"
  );

  assert.match(
    schema,
    /garaManagerVendor ManagerVendor\?[\s\S]*onDelete: Restrict/
  );
  assert.match(
    migration,
    /CreditTopupOrder_garaManagerVendorId_fkey[\s\S]*ON DELETE RESTRICT/
  );
});

describe("PrismaCreditCommandRepository.createGaraVendorPayout", () => {
  it("exposes an atomic Gara vendor payout command", () => {
    const repository = new PrismaCreditCommandRepository(
      { client: {} } as never,
      { enqueue: async () => ({ eventId: "unused" }) } as never,
    );
    const candidate = repository as unknown as { createGaraVendorPayout?: unknown };

    assert.equal(typeof candidate.createGaraVendorPayout, "function");
  });

  it(
    "debits credit and records one request and ledger entry for an active registered vendor",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      const suffix = Date.now().toString(36);
      const managerId = `usr_gara_manager_${suffix}`;
      const vendorId = `vendor_gara_${suffix}`;
      const managerVendorId = `manager_vendor_gara_${suffix}`;
      const creditAccountId = `credit_gara_${suffix}`;
      const repository = new PrismaCreditCommandRepository(
        { client: prisma } as never,
        { enqueue: async () => ({ eventId: "unused" }) } as never,
      );
      const candidate = repository as unknown as {
        createGaraVendorPayout(input: {
          managerId: string;
          managerVendorId: string;
          amount: number;
          idempotencyKey: string;
        }): Promise<{
          request: { id: string; amount: number; status: string; accountNumber: string };
          account: { balance: number };
        }>;
      };

      try {
        await prisma.userAccount.create({
          data: {
            id: managerId,
            email: `gara-manager-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "Gara 관리자",
            role: "LANDLORD",
          },
        });
        await prisma.vendorProfile.create({
          data: {
            id: vendorId,
            businessName: "Gara 설비",
            contactPerson: "가라 기사",
            phone: `010-${suffix.slice(-4).padStart(4, "0")}-0000`,
            serviceArea: "성동구",
            trades: ["PLUMBING"],
            serviceAreas: ["성동구"],
            verificationStatus: "VERIFIED",
          },
        });
        await prisma.managerVendor.create({
          data: {
            id: managerVendorId,
            managerId,
            vendorId,
            status: "ACTIVE",
            settlementAccountNumber: "110-123-456789",
          },
        });
        await prisma.creditAccount.create({
          data: { id: creditAccountId, managerId, balance: 10_000n },
        });

        const input = {
          managerId,
          managerVendorId,
          amount: 4_000,
          idempotencyKey: `gara-key-${suffix}`,
        };
        const created = await candidate.createGaraVendorPayout(input);

        assert.equal(created.request.amount, 4_000);
        assert.equal(created.request.status, "CREDIT_DEBITED");
        assert.equal(created.request.accountNumber, "110-123-456789");
        assert.equal(created.account.balance, 6_000);

        const repeated = await candidate.createGaraVendorPayout(input);
        assert.equal(repeated.request.id, created.request.id);
        assert.equal(repeated.account.balance, 6_000);
        await assert.rejects(
          () => candidate.createGaraVendorPayout({ ...input, amount: 3_000 }),
          /동일한 멱등성 키/,
        );
        await assert.rejects(
          () => candidate.createGaraVendorPayout({
            ...input,
            amount: 6_001,
            idempotencyKey: "gara-insufficient-" + suffix,
          }),
          /크레딧 잔액이 부족합니다/,
        );
        assert.equal(
          await prisma.creditLedgerEntry.count({
            where: { referenceType: "GARA_VENDOR_PAYOUT_REQUEST" },
          }),
          1,
        );
        assert.equal(
          (await prisma.creditAccount.findUniqueOrThrow({ where: { id: creditAccountId } })).balance,
          6_000n,
        );
      } finally {
        await prisma.$executeRawUnsafe(
          'DELETE FROM "GaraVendorPayoutRequest" WHERE "managerId" = $1',
          managerId,
        ).catch(() => undefined);
        await prisma.creditLedgerEntry.deleteMany({
          where: { creditAccountId },
        });
        await prisma.autoPayPolicy.deleteMany({ where: { managerId } });
        await prisma.creditAccount.deleteMany({ where: { id: creditAccountId } });
        await prisma.managerVendor.deleteMany({ where: { id: managerVendorId } });
        await prisma.vendorProfile.deleteMany({ where: { id: vendorId } });
        await prisma.userAccount.deleteMany({ where: { id: managerId } });
        await prisma.$disconnect();
      }
    },
  );

  it(
    "automatically debits a public Gara request at or below the manager policy limit",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      const suffix = Date.now().toString(36);
      const managerId = `usr_gara_auto_${suffix}`;
      const vendorId = `vendor_gara_auto_${suffix}`;
      const managerVendorId = `manager_vendor_gara_auto_${suffix}`;
      const creditAccountId = `credit_gara_auto_${suffix}`;
      const repository = new PrismaCreditCommandRepository(
        { client: prisma } as never,
        { enqueue: async () => ({ eventId: "unused" }) } as never,
      );
      const candidate = repository as unknown as {
        createPublicGaraVendorPayoutRequest(input: {
          managerVendorId: string;
          amount: number;
          idempotencyKey: string;
        }): Promise<{ status: string }>;
      };

      try {
        await prisma.userAccount.create({
          data: {
            id: managerId,
            email: `gara-auto-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "Gara 자동지급 관리자",
            role: "LANDLORD",
          },
        });
        await prisma.vendorProfile.create({
          data: {
            id: vendorId,
            businessName: "Gara 자동지급 설비",
            contactPerson: "가라 기사",
            phone: `010-${suffix.slice(-4).padStart(4, "0")}-1000`,
            serviceArea: "성동구",
            trades: ["PLUMBING"],
            serviceAreas: ["성동구"],
            verificationStatus: "VERIFIED",
          },
        });
        await prisma.managerVendor.create({
          data: {
            id: managerVendorId,
            managerId,
            vendorId,
            status: "ACTIVE",
            settlementAccountNumber: "110-999-000001",
          },
        });
        await prisma.creditAccount.create({
          data: { id: creditAccountId, managerId, balance: 10_000n },
        });
        await prisma.autoPayPolicy.create({
          data: {
            id: `auto_pay_gara_${suffix}`,
            managerId,
            mode: "AUTO_DEBIT_UNDER_LIMIT",
            perRequestLimit: 5_000n,
          },
        });

        const automatic = await candidate.createPublicGaraVendorPayoutRequest({
          managerVendorId,
          amount: 4_000,
          idempotencyKey: `gara-auto-under-${suffix}`,
        });
        const awaitingApproval = await candidate.createPublicGaraVendorPayoutRequest({
          managerVendorId,
          amount: 5_001,
          idempotencyKey: `gara-auto-over-${suffix}`,
        });

        assert.equal(automatic.status, "CREDIT_DEBITED");
        assert.equal(awaitingApproval.status, "PENDING_APPROVAL");
        assert.equal(
          (await prisma.creditAccount.findUniqueOrThrow({ where: { id: creditAccountId } })).balance,
          6_000n,
        );
        assert.equal(
          await prisma.creditLedgerEntry.count({
            where: { creditAccountId, type: "AUTO_DEBIT", referenceType: "GARA_VENDOR_PAYOUT_REQUEST" },
          }),
          1,
        );
      } finally {
        await prisma.garaVendorPayoutRequest.deleteMany({ where: { managerId } });
        await prisma.$executeRawUnsafe('ALTER TABLE "CreditLedgerEntry" DISABLE TRIGGER USER');
        try {
          await prisma.creditLedgerEntry.deleteMany({ where: { creditAccountId } });
        } finally {
          await prisma.$executeRawUnsafe('ALTER TABLE "CreditLedgerEntry" ENABLE TRIGGER USER');
        }
        await prisma.autoPayPolicy.deleteMany({ where: { managerId } });
        await prisma.creditAccount.deleteMany({ where: { id: creditAccountId } });
        await prisma.managerVendor.deleteMany({ where: { id: managerVendorId } });
        await prisma.vendorProfile.deleteMany({ where: { id: vendorId } });
        await prisma.userAccount.deleteMany({ where: { id: managerId } });
        await prisma.$disconnect();
      }
    },
  );
});

describe("PrismaCreditCommandRepository.finalizeTopup Gara payout", () => {
  it("atomically offsets the top-up into one linked payout and stays idempotent", async () => {
    const approvedAt = new Date("2026-07-19T01:02:03.000Z");
    let balance = 0n;
    let version = 0;
    let order = {
      id: "credit-topup-gara-1",
      creditAccountId: "credit-account-gara-1",
      managerId: "manager-1",
      garaManagerVendorId: "manager-vendor-1",
      orderId: "roomlog-credit-gara-1",
      creationKey: "creation-gara-1",
      payloadHash: "payload-gara-1",
      amount: 4_000n,
      status: "CONFIRMING",
      paymentKey: "payment-gara-1",
      method: null,
      failureReason: null,
      returnPath: "/gara",
      approvedAt: null as Date | null,
      createdAt: new Date("2026-07-19T00:00:00.000Z"),
      updatedAt: new Date("2026-07-19T00:00:00.000Z")
    };
    const ledgerByKey = new Map<string, Record<string, unknown>>();
    const payouts: Array<Record<string, unknown>> = [];
    let failPayout = false;
    const tx = {
      creditTopupOrder: {
        findFirst: async () => order,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          order = { ...order, ...data, updatedAt: approvedAt } as typeof order;
          return order;
        }
      },
      creditAccount: {
        updateMany: async ({ data }: { data: { balance: { increment: bigint } } }) => {
          balance += data.balance.increment;
          version += 1;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({
          id: "credit-account-gara-1",
          managerId: "manager-1",
          balance,
          version,
          createdAt: new Date("2026-07-19T00:00:00.000Z"),
          updatedAt: approvedAt
        })
      },
      creditLedgerEntry: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
          ledgerByKey.get(where.idempotencyKey) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, createdAt: approvedAt };
          ledgerByKey.set(String(data.idempotencyKey), row);
          return row;
        }
      },
      managerVendor: {
        findUnique: async () => ({
          id: "manager-vendor-1",
          managerId: "manager-1",
          vendorId: "vendor-1",
          status: "ACTIVE",
          settlementAccountNumber: "110-123-456789",
          vendor: { isActive: true }
        })
      },
      garaVendorPayoutRequest: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (failPayout) throw new Error("injected payout failure");
          payouts.push(data);
          return { ...data, createdAt: approvedAt };
        }
      },
      $queryRaw: async () => {
        if (balance < 4_000n) return [];
        balance -= 4_000n;
        version += 1;
        return [{ id: "credit-account-gara-1" }];
      }
    };
    const database = {
      client: {
        $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => {
          const snapshot = {
            balance,
            version,
            order: { ...order },
            ledgerEntries: [...ledgerByKey.entries()],
            payouts: payouts.slice()
          };
          try {
            return await operation(tx);
          } catch (error) {
            balance = snapshot.balance;
            version = snapshot.version;
            order = snapshot.order;
            ledgerByKey.clear();
            for (const [key, value] of snapshot.ledgerEntries) {
              ledgerByKey.set(key, value);
            }
            payouts.splice(0, payouts.length, ...snapshot.payouts);
            throw error;
          }
        }
      }
    };
    const repository = new PrismaCreditCommandRepository(
      database as never,
      { enqueue: async () => ({ eventId: "event-1" }) } as never
    );
    const payment = {
      paymentKey: "payment-gara-1",
      orderId: "roomlog-credit-gara-1",
      amount: 4_000,
      status: "DONE",
      method: "카드",
      approvedAt: approvedAt.toISOString()
    };

    const first = await repository.finalizeTopup({
      managerId: "manager-1",
      orderId: "roomlog-credit-gara-1",
      payment
    });
    const second = await repository.finalizeTopup({
      managerId: "manager-1",
      orderId: "roomlog-credit-gara-1",
      payment
    });

    assert.equal(first.order.status, "APPROVED");
    assert.equal(second.order.status, "APPROVED");
    assert.equal(balance, 0n);
    assert.equal(payouts.length, 1);
    assert.equal(payouts[0]?.topupOrderId, "credit-topup-gara-1");
    assert.equal(
      payouts[0]?.idempotencyKey,
      "gara-topup-payout:roomlog-credit-gara-1"
    );
    const debit = ledgerByKey.get(
      "gara-topup-payout:roomlog-credit-gara-1"
    );
    assert.equal(debit?.type, "MANUAL_DEBIT");
    assert.equal(debit?.signedAmount, -4_000n);
    assert.equal(debit?.referenceType, "GARA_VENDOR_PAYOUT_REQUEST");
    assert.equal(debit?.referenceId, payouts[0]?.id);

    balance = 0n;
    version = 0;
    ledgerByKey.clear();
    payouts.length = 0;
    failPayout = true;
    order = {
      ...order,
      id: "credit-topup-gara-failure",
      orderId: "roomlog-credit-gara-failure",
      creationKey: "creation-gara-failure",
      status: "CONFIRMING",
      paymentKey: "payment-gara-failure",
      method: null,
      approvedAt: null
    };

    await assert.rejects(
      () => repository.finalizeTopup({
        managerId: "manager-1",
        orderId: "roomlog-credit-gara-failure",
        payment: {
          ...payment,
          paymentKey: "payment-gara-failure",
          orderId: "roomlog-credit-gara-failure"
        },
        garaManagerVendorId: "manager-vendor-1"
      }),
      /injected payout failure/
    );
    assert.equal(order.status, "CONFIRMING");
    assert.equal(balance, 0n);
    assert.equal(ledgerByKey.size, 0);
    assert.equal(payouts.length, 0);
  });
});

describe("PrismaCreditQueryRepository.listPublicGaraVendors", () => {
  it("exposes the public Gara vendor list query", () => {
    const repository = new PrismaCreditQueryRepository({ client: {} } as never);
    const candidate = repository as unknown as {
      listPublicGaraVendors?: unknown;
    };

    assert.equal(typeof candidate.listPublicGaraVendors, "function");
  });

  it(
    "lists active registered vendors with their manager contact and cumulative Gara credit",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      const suffix = Date.now().toString(36);
      const firstManagerId = `usr_gara_public_first_${suffix}`;
      const secondManagerId = `usr_gara_public_second_${suffix}`;
      const firstVendorId = `vendor_gara_public_first_${suffix}`;
      const secondVendorId = `vendor_gara_public_second_${suffix}`;
      const archivedVendorId = `vendor_gara_public_archived_${suffix}`;
      const creditedRegistrationId = `manager_vendor_gara_public_first_${suffix}`;
      const uncreditedRegistrationId = `manager_vendor_gara_public_second_${suffix}`;
      const archivedRegistrationId = `manager_vendor_gara_public_archived_${suffix}`;
      const firstCreditAccountId = `credit_gara_public_first_${suffix}`;
      const firstLedgerEntryId = `ledger_gara_public_first_${suffix}`;
      const firstPayoutId = `payout_gara_public_first_${suffix}`;
      const pendingPayoutId = `payout_gara_public_pending_${suffix}`;
      const repository = new PrismaCreditQueryRepository({ client: prisma } as never);
      const candidate = repository as unknown as {
        listPublicGaraVendors(): Promise<Array<{
          id: string;
          businessName: string;
          phone: string;
          settlementAccountNumber?: string;
          linkedAccount: { name: string; email: string };
          cumulativeCredit: number;
        }>>;
      };

      try {
        await prisma.userAccount.createMany({
          data: [
            {
              id: firstManagerId,
              email: "first-manager@roomlog.test",
              passwordHash: "salt:hash",
              name: "첫 번째 관리자",
              role: "LANDLORD",
            },
            {
              id: secondManagerId,
              email: "second-manager@roomlog.test",
              passwordHash: "salt:hash",
              name: "두 번째 관리자",
              role: "LANDLORD",
            },
          ],
        });
        await prisma.vendorProfile.createMany({
          data: [
            {
              id: firstVendorId,
              businessName: "가라 01 첫 번째 설비",
              contactPerson: "첫 번째 기사",
              phone: "010-1000-0001",
              serviceArea: "성동구",
              trades: ["PLUMBING"],
              serviceAreas: ["성동구"],
              verificationStatus: "VERIFIED",
            },
            {
              id: secondVendorId,
              businessName: "가라 02 두 번째 설비",
              contactPerson: "두 번째 기사",
              phone: "010-1000-0002",
              serviceArea: "성동구",
              trades: ["PLUMBING"],
              serviceAreas: ["성동구"],
              verificationStatus: "VERIFIED",
            },
            {
              id: archivedVendorId,
              businessName: "가라 보관 설비",
              contactPerson: "보관 기사",
              phone: "010-1000-0003",
              serviceArea: "성동구",
              trades: ["PLUMBING"],
              serviceAreas: ["성동구"],
              verificationStatus: "VERIFIED",
            },
          ],
        });
        await prisma.managerVendor.createMany({
          data: [
            {
              id: creditedRegistrationId,
              managerId: firstManagerId,
              vendorId: firstVendorId,
              status: "ACTIVE",
              settlementAccountNumber: "110-100-000001",
            },
            {
              id: uncreditedRegistrationId,
              managerId: secondManagerId,
              vendorId: secondVendorId,
              status: "ACTIVE",
              settlementAccountNumber: "110-100-000002",
            },
            {
              id: archivedRegistrationId,
              managerId: firstManagerId,
              vendorId: archivedVendorId,
              status: "ARCHIVED",
              settlementAccountNumber: "110-100-000003",
            },
          ],
        });
        await prisma.creditAccount.create({
          data: { id: firstCreditAccountId, managerId: firstManagerId, balance: 6_000n },
        });
        await prisma.creditLedgerEntry.create({
          data: {
            id: firstLedgerEntryId,
            creditAccountId: firstCreditAccountId,
            type: "MANUAL_DEBIT",
            signedAmount: -4_000n,
            balanceAfter: 6_000n,
            referenceType: "GARA_VENDOR_PAYOUT_REQUEST",
            referenceId: firstPayoutId,
            idempotencyKey: `gara-public-ledger-${suffix}`,
          },
        });
        await prisma.garaVendorPayoutRequest.create({
          data: {
            id: firstPayoutId,
            managerId: firstManagerId,
            managerVendorId: creditedRegistrationId,
            vendorId: firstVendorId,
            creditAccountId: firstCreditAccountId,
            ledgerEntryId: firstLedgerEntryId,
            amount: 4_000n,
            accountNumberSnapshot: "110-100-000001",
            idempotencyKey: `gara-public-payout-${suffix}`,
            payloadHash: "test-payload-hash",
          },
        });
        await prisma.garaVendorPayoutRequest.create({
          data: {
            id: pendingPayoutId,
            managerId: firstManagerId,
            managerVendorId: creditedRegistrationId,
            vendorId: firstVendorId,
            amount: 9_000n,
            accountNumberSnapshot: "110-100-000001",
            idempotencyKey: `gara-public-pending-${suffix}`,
            payloadHash: "test-pending-payload-hash",
            status: "PENDING_APPROVAL",
          },
        });

        const rows = await candidate.listPublicGaraVendors();

        assert.deepEqual(rows.map((row) => row.linkedAccount.email), [
          "first-manager@roomlog.test",
          "second-manager@roomlog.test",
        ]);
        assert.equal(rows.find((row) => row.id === creditedRegistrationId)?.cumulativeCredit, 4_000);
        assert.equal(rows.some((row) => row.id === archivedRegistrationId), false);
        assert.deepEqual(rows.find((row) => row.id === creditedRegistrationId), {
          id: creditedRegistrationId,
          businessName: "가라 01 첫 번째 설비",
          phone: "010-1000-0001",
          settlementAccountNumber: "110-100-000001",
          linkedAccount: {
            name: "첫 번째 관리자",
            email: "first-manager@roomlog.test",
          },
          cumulativeCredit: 4_000,
        });
      } finally {
        await prisma.garaVendorPayoutRequest.deleteMany({
          where: { id: { in: [firstPayoutId, pendingPayoutId] } },
        });
        await prisma.creditLedgerEntry.deleteMany({
          where: { id: firstLedgerEntryId },
        });
        await prisma.creditAccount.deleteMany({
          where: { id: firstCreditAccountId },
        });
        await prisma.managerVendor.deleteMany({
          where: {
            id: {
              in: [
                creditedRegistrationId,
                uncreditedRegistrationId,
                archivedRegistrationId,
              ],
            },
          },
        });
        await prisma.vendorProfile.deleteMany({
          where: { id: { in: [firstVendorId, secondVendorId, archivedVendorId] } },
        });
        await prisma.userAccount.deleteMany({
          where: { id: { in: [firstManagerId, secondManagerId] } },
        });
        await prisma.$disconnect();
      }
    },
  );
});
