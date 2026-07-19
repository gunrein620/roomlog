import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaCreditCommandRepository } from "./prisma-credit-command.repository";
import { PrismaCreditQueryRepository } from "./prisma-credit-query.repository";

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
          where: { id: firstPayoutId },
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
