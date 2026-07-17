import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function databaseUrlFromEnvironment() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for credit persistence.");
  }
  return databaseUrl;
}

export const CREDIT_DATABASE_URL = Symbol("CREDIT_DATABASE_URL");

@Injectable()
export class CreditPrismaClient implements OnModuleDestroy {
  readonly client: PrismaClient;
  private closed = false;

  constructor(
    @Optional() @Inject(CREDIT_DATABASE_URL) databaseUrl?: string
  ) {
    const resolvedDatabaseUrl = databaseUrl ?? databaseUrlFromEnvironment();
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: resolvedDatabaseUrl })
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.client.$disconnect();
  }

  async onModuleDestroy() {
    await this.close();
  }
}
