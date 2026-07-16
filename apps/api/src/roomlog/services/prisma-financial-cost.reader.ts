import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { Cost } from "../roomlog.types";

export interface FinancialCostReader {
  listManagerCosts(managerId: string): Promise<Cost[]>;
  isFinanceOwnedCost(costId: string): Promise<boolean>;
  close?(): Promise<void>;
}

export class NoopFinancialCostReader implements FinancialCostReader {
  async listManagerCosts(): Promise<Cost[]> {
    return [];
  }

  async isFinanceOwnedCost(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {}
}

export class PrismaFinancialCostReader implements FinancialCostReader {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl })
    });
  }

  async listManagerCosts(managerId: string): Promise<Cost[]> {
    const requests = await this.prisma.vendorPaymentRequest.findMany({
      where: {
        managerId,
        costId: { not: null }
      },
      select: { cost: true }
    });

    return requests
      .map((request) => request.cost)
      .filter((cost): cost is NonNullable<typeof cost> => cost !== null)
      .map((cost) => ({
        id: cost.id,
        managerId: cost.managerId ?? undefined,
        date: cost.date.toISOString(),
        item: cost.item,
        amount: cost.amount,
        type: cost.type.toLowerCase() as Cost["type"],
        scope: cost.scope.toLowerCase() as Cost["scope"],
        unitId: cost.unitId ?? undefined,
        status: cost.status.toLowerCase() as Cost["status"],
        verified: cost.verified,
        reviewReason:
          (cost.reviewReason?.toLowerCase() as Cost["reviewReason"]) ?? undefined,
        disclosure:
          (cost.disclosure?.toLowerCase() as Cost["disclosure"]) ?? undefined,
        repairPayment:
          (cost.repairPayment?.toLowerCase() as Cost["repairPayment"]) ?? undefined,
        paymentRef: cost.paymentRef ?? undefined,
        receiptId: cost.receiptId ?? undefined,
        supersedesId: cost.supersedesId ?? undefined,
        voidReason: cost.voidReason ?? undefined,
        createdAt: cost.createdAt.toISOString(),
        updatedAt: cost.updatedAt.toISOString()
      }));
  }

  async isFinanceOwnedCost(costId: string): Promise<boolean> {
    return (
      (await this.prisma.vendorPaymentRequest.count({
        where: { costId }
      })) > 0
    );
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
