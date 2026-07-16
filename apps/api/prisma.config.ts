import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://roomlog:roomlog@localhost:5433/roomlog?schema=public";

export default defineConfig({
  schema: "../../prisma/schema.prisma",
  migrations: {
    path: "../../prisma/migrations"
  },
  datasource: {
    url: databaseUrl
  }
});
