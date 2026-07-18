import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaCreditCommandRepository } from "./prisma-credit-command.repository";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

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
});
