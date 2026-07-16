import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

const composeSource = readFileSync("../../docker-compose.yml", "utf8");
const envExampleSource = readFileSync("../../.env.example", "utf8");
const readmeSource = readFileSync("../../README.md", "utf8");
const rootPackageSource = readFileSync("../../package.json", "utf8");
const deployWorkflowSource = readFileSync("../../.github/workflows/deploy.yml", "utf8");
const migrationBootstrapSource = readFileSync("scripts/migrate-database.mjs", "utf8");
const migrationSources = readdirSync("../../prisma/migrations", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(`../../prisma/migrations/${entry.name}/migration.sql`, "utf8"))
  .join("\n");

describe("Docker Postgres local database wiring", () => {
  it("uses PostgreSQL 18.3 and creates a local test database in Compose", () => {
    assert.match(composeSource, /image:\s*postgres:18\.3-alpine/);
    assert.match(composeSource, /POSTGRES_TEST_DB:\s*\$\{POSTGRES_TEST_DB:-roomlog_test\}/);
    assert.match(composeSource, /roomlog-postgres-data:\/var\/lib\/postgresql/);
    assert.doesNotMatch(composeSource, /roomlog-postgres-data:\/var\/lib\/postgresql\/data/);
    assert.match(composeSource, /docker\/postgres\/init:\/docker-entrypoint-initdb\.d:ro/);
    assert.match(composeSource, /pg_isready/);
  });

  it("documents localhost test database usage", () => {
    const testUrl = "postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public";

    assert.match(envExampleSource, new RegExp(`ROOMLOG_TEST_DATABASE_URL=${testUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(readmeSource, /PostgreSQL 18\.3/);
    assert.match(readmeSource, new RegExp(testUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(rootPackageSource, /db:test:push/);
    assert.match(rootPackageSource, /prisma migrate diff --from-empty --to-schema prisma\/schema\.prisma --script/);
    assert.match(rootPackageSource, /docker exec -i roomlog-postgres psql/);
  });

  it("documents a dedicated non-system production database", () => {
    assert.match(
      envExampleSource,
      /DATABASE_URL=postgresql:\/\/roomlog_admin:YOUR_PASSWORD@roomlog-db\.xxxxxx\.ap-northeast-2\.rds\.amazonaws\.com:5432\/roomlog\?sslmode=require/
    );
    assert.doesNotMatch(
      envExampleSource,
      /DATABASE_URL=postgresql:\/\/roomlog_admin:[^\n]+\/postgres\?sslmode=require/
    );
  });

  it("uses the publicly readable user-mappings view for RDS catalog inspection", () => {
    assert.match(migrationBootstrapSource, /SELECT 1 FROM pg_user_mappings/);
    assert.doesNotMatch(migrationBootstrapSource, /SELECT 1 FROM pg_user_mapping\n/);
  });

  it("carries required vendor activation secrets into the production environment", () => {
    for (const key of ["VENDOR_ACTIVATION_KEY_PEPPER", "VENDOR_ACTIVATION_SESSION_SECRET"]) {
      assert.match(envExampleSource, new RegExp(`^${key}=$`, "m"));
      assert.match(
        deployWorkflowSource,
        new RegExp(`${key}: "\\$\\{\\{ secrets\\.${key} \\}\\}"`)
      );
      assert.match(
        deployWorkflowSource,
        new RegExp(`${key}="\\$\\(read_prod_env_key ${key}\\)"`)
      );
      assert.match(
        deployWorkflowSource,
        new RegExp(`:\\s+"\\$\\{${key}:\\?${key} secret is required\\}"`)
      );
      assert.match(deployWorkflowSource, new RegExp(`^\\s+${key}=\\$\\{${key}\\}$`, "m"));
    }
    assert.match(
      deployWorkflowSource,
      /ROBOFLOW_API_KEY\|VENDOR_ACTIVATION_KEY_PEPPER\|VENDOR_ACTIVATION_SESSION_SECRET/
    );
  });

  it("carries optional GPU orchestrator secrets into the production environment", () => {
    for (const key of [
      "GPU_PIPELINE_ENABLED",
      "GPU_INSTANCE_ID",
      "GPU_REGION",
      "GPU_WORKER_SECRET",
    ]) {
      assert.match(
        deployWorkflowSource,
        new RegExp(`${key}: "\\$\\{\\{ secrets\\.${key} \\}\\}"`)
      );
      assert.match(
        deployWorkflowSource,
        new RegExp(`${key}="\\$\\(read_prod_env_key ${key}\\)"`)
      );
      assert.match(
        deployWorkflowSource,
        new RegExp(`echo "${key}=\\$\\{${key}\\}" >> \\.env\\.production`)
      );
    }
    assert.match(
      deployWorkflowSource,
      /GPU_PIPELINE_ENABLED\|GPU_INSTANCE_ID\|GPU_REGION\|GPU_WORKER_SECRET/
    );
  });

  it("migrates the GPU reconstruction job state tracked by the Prisma schema", () => {
    assert.match(migrationSources, /CREATE TYPE "SplatReconstructionJobState" AS ENUM/);
    for (const column of [
      "jobState",
      "jobError",
      "jobAttempts",
      "jobCommandId",
      "jobStartedAt",
    ]) {
      assert.match(migrationSources, new RegExp(`ADD COLUMN(?: IF NOT EXISTS)? "${column}"`));
    }
  });

  it("prevents the migration container from consuming the remote deploy script stdin", () => {
    assert.match(
      deployWorkflowSource,
      /compose -f docker-compose\.prod\.yml run --rm migration < \/dev\/null/
    );
  });
});
