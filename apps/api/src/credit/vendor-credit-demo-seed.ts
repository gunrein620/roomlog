import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

const OPENING_BALANCE = 100_000n;
const OPENING_REFERENCE_TYPE = "DEMO_OPENING";

export type VendorCreditDemoSeedResult = Readonly<{
  managerId: string;
  accountId: string;
  ledgerEntryId: string;
  balance: number;
  created: boolean;
}>;

export function requireVendorCreditDemoManagerId(
  env: NodeJS.ProcessEnv = process.env
) {
  const managerId = env.ROOMLOG_DEMO_MANAGER_ID?.trim();
  if (!managerId) {
    throw new Error("ROOMLOG_DEMO_MANAGER_ID is required.");
  }
  return managerId;
}

function requireDatabaseUrl(env: NodeJS.ProcessEnv) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return databaseUrl;
}

function openingKey(managerId: string) {
  return `opening:${managerId}`;
}

function safeBalance(value: bigint) {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance)) {
    throw new Error("Credit account balance exceeds the safe integer range.");
  }
  return balance;
}

export async function seedVendorCreditDemo(
  prisma: PrismaClient,
  rawManagerId: string
): Promise<VendorCreditDemoSeedResult> {
  const managerId = rawManagerId.trim();
  if (!managerId) throw new Error("manager ID is required.");

  return prisma.$transaction(async (tx) => {
    const [manager] = await tx.$queryRaw<Array<{ id: string; role: string }>>(
      Prisma.sql`
        SELECT "id", CAST("role" AS text) AS "role"
        FROM "UserAccount"
        WHERE "id" = ${managerId}
        FOR UPDATE
      `
    );
    if (!manager || manager.role !== "LANDLORD") {
      throw new Error(
        "ROOMLOG_DEMO_MANAGER_ID must reference an existing LANDLORD manager."
      );
    }

    const existingAccount = await tx.creditAccount.findUnique({
      where: { managerId }
    });
    if (!existingAccount) {
      const account = await tx.creditAccount.create({
        data: {
          id: `credit-demo-${randomUUID()}`,
          managerId,
          balance: OPENING_BALANCE,
          version: 0
        }
      });
      const ledgerEntry = await tx.creditLedgerEntry.create({
        data: {
          id: `credit-demo-opening-${randomUUID()}`,
          creditAccountId: account.id,
          type: "OPENING_BALANCE",
          signedAmount: OPENING_BALANCE,
          balanceAfter: OPENING_BALANCE,
          referenceType: OPENING_REFERENCE_TYPE,
          referenceId: managerId,
          idempotencyKey: openingKey(managerId)
        }
      });
      return {
        managerId,
        accountId: account.id,
        ledgerEntryId: ledgerEntry.id,
        balance: safeBalance(account.balance),
        created: true
      };
    }

    const entries = await tx.creditLedgerEntry.findMany({
      where: { creditAccountId: existingAccount.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const ledgerSum = entries.reduce(
      (sum, entry) => sum + entry.signedAmount,
      0n
    );
    if (ledgerSum !== existingAccount.balance) {
      throw new Error(
        "Existing credit account balance disagrees with its ledger sum."
      );
    }

    const openingEntries = entries.filter(
      (entry) => entry.type === "OPENING_BALANCE"
    );
    const opening = openingEntries[0];
    if (
      openingEntries.length !== 1 ||
      !opening ||
      opening.idempotencyKey !== openingKey(managerId) ||
      opening.signedAmount !== OPENING_BALANCE ||
      opening.balanceAfter !== OPENING_BALANCE ||
      opening.referenceType !== OPENING_REFERENCE_TYPE ||
      opening.referenceId !== managerId ||
      opening.reversesLedgerEntryId !== null
    ) {
      throw new Error(
        "Existing credit account does not contain the expected demo opening ledger."
      );
    }

    return {
      managerId,
      accountId: existingAccount.id,
      ledgerEntryId: opening.id,
      balance: safeBalance(existingAccount.balance),
      created: false
    };
  });
}

export async function runVendorCreditDemoSeed(
  env: NodeJS.ProcessEnv = process.env
) {
  const managerId = requireVendorCreditDemoManagerId(env);
  const databaseUrl = requireDatabaseUrl(env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl })
  });
  try {
    return await seedVendorCreditDemo(prisma, managerId);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runVendorCreditDemoSeed()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
