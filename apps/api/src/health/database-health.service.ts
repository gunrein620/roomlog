import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type DatabaseHealthStatus = {
  status: "ok" | "not_configured" | "error";
  provider: "postgresql";
  message?: string;
};

@Injectable()
export class DatabaseHealthService implements OnModuleDestroy {
  private prisma?: PrismaClient;

  async check(): Promise<DatabaseHealthStatus> {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      return {
        status: "not_configured",
        provider: "postgresql"
      };
    }

    try {
      await this.client(databaseUrl).$queryRaw`SELECT 1`;

      return {
        status: "ok",
        provider: "postgresql"
      };
    } catch (error) {
      return {
        status: "error",
        provider: "postgresql",
        message: error instanceof Error ? error.message : "Database health check failed"
      };
    }
  }

  async onModuleDestroy() {
    await this.prisma?.$disconnect();
  }

  private client(databaseUrl: string) {
    if (!this.prisma) {
      const adapter = new PrismaPg({ connectionString: databaseUrl });
      this.prisma = new PrismaClient({ adapter });
    }

    return this.prisma;
  }
}
